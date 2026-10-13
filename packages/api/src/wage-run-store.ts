import type { Database } from "@OpenFarm/db";
import { uuidv7 as newId } from "@OpenFarm/db/ids";
import type { RoleName } from "@OpenFarm/db/schema/farm";
import { ACTIVE_ROLE } from "@OpenFarm/db/schema/farm";
import type { SIDES } from "@OpenFarm/db/schema/herd";
import type { PaymentMethod } from "@OpenFarm/db/schema/money";
import { monthBefore, roundMoney, wageRunOf } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import { audited } from "./audit";
import type { Context } from "./context";
import {
  bookEnteredByHand,
  categoryForEntered,
  enteredOn,
  readEntered,
} from "./money-by-hand-store";
import { openDrawsOf } from "./wage-draw-store";
import { seenWhenDone } from "./writes-seen";

type Db = Pick<Database, "query">;

/** Who pays a month's wages, on which farm. */
type Paying = Context & {
  farm: NonNullable<Context["farm"]>;
  actor: NonNullable<Context["actor"]>;
};

/** The Farm's Wages Category, which every wage goes under. */
const wagesOf = async (db: Db, farmId: string) => {
  const wages = await db.query.moneyCategory.findFirst({
    where: { farmId, key: "wages" },
    columns: { id: true },
  });
  if (!wages) {
    throw new ORPCError("NOT_FOUND", { message: "The farm has no Wages" });
  }
  return wages.id;
};

/**
 * A month's wages as the farm would pay them (`wageRunOf`): everybody paid a wage for the month before, at that wage
 * whole — what they were paid and the draws it took — with what payday takes off their draws still owed, and whether
 * this month's is entered already.
 */
export const wageRunFor = async (db: Db, farmId: string, month: string) => {
  const before = monthBefore(month);
  const wages = await db.query.moneyEvent.findMany({
    where: {
      farmId,
      wageMonth: { in: [before, month] },
      counterpartyId: { isNotNull: true },
    },
    columns: {
      id: true,
      amountMoney: true,
      wageMonth: true,
      counterpartyId: true,
      side: true,
    },
    with: { counterparty: { columns: { name: true } } },
  });
  const lastMonth = wages.filter((one) => one.wageMonth === before);
  const [taken, open] = await Promise.all([
    lastMonth.length === 0
      ? []
      : db.query.wageDrawTaken.findMany({
          where: { wageEventId: { in: lastMonth.map((one) => one.id) } },
          columns: { wageEventId: true, amount: true },
        }),
    openDrawsOf(db, farmId),
  ]);
  const takenBy = new Map<string, number>();
  for (const one of taken) {
    takenBy.set(
      one.wageEventId,
      (takenBy.get(one.wageEventId) ?? 0) + one.amount
    );
  }
  return {
    month,
    rows: wageRunOf({
      lastMonth: lastMonth.flatMap((one) =>
        one.counterpartyId && one.counterparty
          ? [
              {
                personId: one.counterpartyId,
                name: one.counterparty.name,
                wageMoney: roundMoney(
                  one.amountMoney + (takenBy.get(one.id) ?? 0)
                ),
                side: one.side,
              },
            ]
          : []
      ),
      openDraws: open.map((one) => ({
        personId: one.counterpartyId,
        openMoney: one.openMoney,
      })),
      paidThisMonth: wages.flatMap((one) =>
        one.wageMonth === month && one.counterpartyId
          ? [one.counterpartyId]
          : []
      ),
    }),
  };
};

/**
 * A month's wages, ticked and saved together, in one transaction: all of them or none. Each is a wage of its own —
 * its own Money Event and Audit Event, one a person a month, taking the person's draws, waiting for the Owner over the
 * Approval Threshold — exactly as a wage entered alone (`bookEnteredByHand`).
 */
export const payWages = (
  context: Paying,
  role: RoleName,
  input: {
    month: string;
    occurredOn: string;
    paymentMethod: PaymentMethod;
    farmAccountId?: string;
    heldBy?: string;
    wages: readonly {
      personId: string;
      amountMoney: number;
      side?: (typeof SIDES)[number];
      reference?: string;
    }[];
  },
  now: Date
): Promise<{ ids: string[] }> =>
  seenWhenDone(
    context.db.transaction(async (tx) => {
      const farmId = context.farm.id;
      const occurredAt = enteredOn(input.occurredOn, now);
      const category = await categoryForEntered(
        tx,
        farmId,
        await wagesOf(tx, farmId),
        { wageMonth: input.month, alreadyUnderIt: false }
      );
      const ids: string[] = [];
      for (const wage of input.wages) {
        // One wage after another: each takes its own person's draws behind the Farm's lock, a handful a month.
        // oxlint-disable-next-line no-await-in-loop
        const person = await tx.query.counterparty.findFirst({
          where: { id: wage.personId, farmId },
          columns: { id: true },
        });
        if (!person) {
          throw new ORPCError("NOT_FOUND", { message: "No such person" });
        }
        const id = newId(now);
        // oxlint-disable-next-line no-await-in-loop
        await bookEnteredByHand(
          tx,
          { ...context, role },
          {
            id,
            category,
            occurredAt,
            counterpartyId: person.id,
            amountMoney: wage.amountMoney,
            paymentMethod: input.paymentMethod,
            ...(input.farmAccountId === undefined
              ? {}
              : { farmAccountId: input.farmAccountId }),
            ...(wage.reference === undefined
              ? {}
              : { reference: wage.reference }),
            ...(input.heldBy === undefined ? {} : { heldBy: input.heldBy }),
            note: null,
            wageMonth: input.month,
            side: wage.side ?? null,
            now,
          }
        );
        // oxlint-disable-next-line no-await-in-loop
        await audited(context).recordEvent(tx, {
          entity: "money_event",
          entityId: id,
          action: "create",
          after: (read) => readEntered(read, farmId, id),
        });
        ids.push(id);
      }
      return { ids };
    })
  );

/**
 * Whom a wage may name: everybody the farm has paid a wage before, and its own people — the Manager and the Barn Staff
 * by their names — so the person is chosen, and a new spelling of somebody already paid is a choice rather than an
 * accident. Each name once, in the reader's alphabet order.
 */
export const wagePeople = async (db: Db, farmId: string): Promise<string[]> => {
  const [paid, people] = await Promise.all([
    db.query.moneyEvent.findMany({
      where: {
        farmId,
        wageMonth: { isNotNull: true },
        counterpartyId: { isNotNull: true },
      },
      columns: { counterpartyId: true },
      with: { counterparty: { columns: { name: true } } },
    }),
    db.query.roleAssignment.findMany({
      where: { farmId, role: { in: ["manager", "staff"] }, ...ACTIVE_ROLE },
      columns: { userId: true },
      with: { user: { columns: { name: true } } },
    }),
  ]);
  const names = new Set<string>();
  for (const one of paid) {
    if (one.counterparty) {
      names.add(one.counterparty.name);
    }
  }
  for (const one of people) {
    const name = one.user?.name.trim() ?? "";
    if (name !== "") {
      names.add(name);
    }
  }
  return [...names].toSorted((a, b) => a.localeCompare(b));
};
