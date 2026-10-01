import type { Database } from "@OpenFarm/db";
import type { SumsStanding } from "@OpenFarm/domain";
import { TAKES_MONTHLY_SUMS, sumsStandingOf } from "@OpenFarm/domain";

import { holdersOf } from "./alerts-store";
import type { Tx } from "./audit";
import type { Raised } from "./notice";
import { rememberingPeople, tell } from "./notice";
import type { VentureRow } from "./venture-store";
import { paidForBy } from "./venture-store";

type Db = Pick<Database, "query">;

/** One Agreement behind on its Monthly Sums, not yet told for the latest month it missed. */
export interface MissedToTell {
  /** The Agreement and the month: what the Owner is told of once. */
  aboutId: string;
  facts: {
    ventureId: string;
    venture: string;
    investor: string;
    missedBdt: number;
    dueOn: string;
  };
}

/** One Agreement of a running Venture paid by the month, and where it stands against its Monthly Sums today. */
export interface AgreementStanding {
  agreementId: string;
  ventureId: string;
  investorId: string;
  standing: SumsStanding;
}

/**
 * Where every Agreement of these Ventures stands against its Monthly Sums today — those of the Ventures paid by the
 * month that still take them, buying or fattening; nothing for any other. One read of the papers and one of the money
 * for them all, which the evening's sweep and the Owner's list of Ventures both ask.
 */
export const standingsOf = async (
  db: Db,
  farmId: string,
  ventures: readonly VentureRow[],
  today: string
): Promise<AgreementStanding[]> => {
  const running = ventures.filter(
    (one) =>
      one.capitalPaid === "by_the_month" &&
      TAKES_MONTHLY_SUMS.some((state) => state === one.state)
  );
  if (running.length === 0) {
    return [];
  }
  const agreements = await db.query.investmentAgreement.findMany({
    where: { farmId, ventureId: { in: running.map((one) => one.id) } },
    columns: { id: true, ventureId: true, investorId: true, units: true },
  });
  const paid = new Map<string, number>();
  const movements = await db.query.ventureMovement.findMany({
    where: {
      farmId,
      kind: "capital_in",
      agreementId: { in: agreements.map((one) => one.id) },
    },
    columns: { agreementId: true, amountBdt: true },
  });
  for (const movement of movements) {
    if (movement.agreementId) {
      paid.set(
        movement.agreementId,
        (paid.get(movement.agreementId) ?? 0) + movement.amountBdt
      );
    }
  }
  const byId = new Map(running.map((one) => [one.id, one]));
  return agreements.flatMap((one) => {
    const venture = byId.get(one.ventureId);
    const monthly = venture ? paidForBy(venture).monthly : null;
    if (!(venture && monthly)) {
      return [];
    }
    return [
      {
        agreementId: one.id,
        ventureId: one.ventureId,
        investorId: one.investorId,
        standing: sumsStandingOf({
          units: one.units,
          unitPriceBdt: venture.unitPriceBdt,
          monthly,
          paidBdt: paid.get(one.id) ?? 0,
          today,
        }),
      },
    ];
  });
};

/** What each running Venture paid by the month has missed of its Monthly Sums today, across its Agreements. */
export const missedByEach = async (
  db: Db,
  farmId: string,
  ventures: readonly VentureRow[],
  today: string
): Promise<Map<string, number>> => {
  const missed = new Map<string, number>();
  for (const one of await standingsOf(db, farmId, ventures, today)) {
    missed.set(
      one.ventureId,
      (missed.get(one.ventureId) ?? 0) + one.standing.missedBdt
    );
  }
  return missed;
};

/**
 * The Agreements of Ventures paid by the month that have missed a Monthly Sum — past its seven days — and whose latest
 * missed month the Owner has not been told of. Told once a month per Agreement, however many mornings it stays missed;
 * a month missed after it is told again, because it is a second month gone. Only while the Venture still takes its
 * sums: once it sells, a sum not paid is not paid, and the man shares by what he did pay.
 */
export const missedToTell = async (
  db: Db,
  farmId: string,
  today: string
): Promise<MissedToTell[]> => {
  const ventures = await db.query.venture.findMany({
    where: {
      farmId,
      capitalPaid: "by_the_month",
      state: { in: [...TAKES_MONTHLY_SUMS] },
    },
  });
  const standings = await standingsOf(db, farmId, ventures, today);
  const behindOn = standings.filter(
    (one) => one.standing.lastMissedOn !== null
  );
  if (behindOn.length === 0) {
    return [];
  }
  const people = await db.query.investor.findMany({
    where: { farmId, id: { in: behindOn.map((one) => one.investorId) } },
    columns: { id: true, name: true },
  });
  const named = new Map(people.map((one) => [one.id, one.name]));
  const byId = new Map(ventures.map((one) => [one.id, one]));
  const behind: MissedToTell[] = behindOn.map((one) => {
    const dueOn = one.standing.lastMissedOn ?? "";
    return {
      aboutId: `${one.agreementId}|${dueOn}`,
      facts: {
        ventureId: one.ventureId,
        venture: byId.get(one.ventureId)?.name ?? "",
        investor: named.get(one.investorId) ?? "",
        missedBdt: one.standing.missedBdt,
        dueOn,
      },
    };
  });
  const owners = await holdersOf(db as Tx, farmId, ["owner"]);
  const told = await db.query.alert.findMany({
    where: {
      farmId,
      kind: "monthly_sum_missed",
      entityId: { in: behind.map((one) => one.aboutId) },
    },
    columns: { entityId: true, userId: true },
  });
  const said = new Set(told.map((row) => `${row.userId}|${row.entityId}`));
  return behind.filter((one) =>
    owners.some((userId) => !said.has(`${userId}|${one.aboutId}`))
  );
};

/** Raises the notices for these missed months. Who hears them is the Notice's to say: the Owner. */
export const raiseMissedSums = async (
  tx: Tx,
  farmId: string,
  untold: readonly MissedToTell[],
  now: Date
): Promise<Raised[]> => {
  const raised: Raised[] = [];
  const remembering = rememberingPeople();
  for (const one of untold) {
    // Sequential against one unique index, as the other notices are.
    // oxlint-disable-next-line no-await-in-loop
    const rows = await tell(
      tx,
      farmId,
      {
        kind: "monthly_sum_missed",
        about: { id: one.aboutId },
        facts: one.facts,
      },
      now,
      remembering
    );
    raised.push(...rows);
  }
  return raised;
};
