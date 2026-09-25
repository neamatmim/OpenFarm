import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, inArray, isNull } from "@OpenFarm/db/operators";
import { paperTemplateVersion } from "@OpenFarm/db/schema/paper-template";
import { portalConsent } from "@OpenFarm/db/schema/venture";
import type { PaperDocument } from "@OpenFarm/domain";
import { farmDayOf, paperFrom, startOfFarmDay } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import { audited } from "./audit";
import type { Context } from "./context";
import { farmsOwnValues } from "./data-keepers";
import { assertRegistered, exportedPaper } from "./export-store";
import { paperInvestor, paperValues, producedAt } from "./paper-values";
import { languageOf } from "./reader-language";
import { currentWording, giveStandardTemplates } from "./template-store";

// The Portal Consent (the glossary's entry): signed on paper in front of the Owner before any code is given, and
// recorded here with the day, the wording signed and who recorded it. The paper is filed; this is how the farm proves
// it (Personal Data Protection Act 2026 s.5(4)).

/** A consent in force, as the Owner's screens say it: the day it was signed and the Version of the wording. */
export interface ConsentSaid {
  signedOn: string;
  version: number;
}

type Owned = Context & {
  farm: NonNullable<Context["farm"]>;
  actor: { id: string; name: string };
};

const refused = (message: string, refusal: string) =>
  new ORPCError("BAD_REQUEST", { message, data: { refusal } });

/** Each Investor's consent in force on this farm, by their id: none for somebody who has not signed one, or withdrew it. */
export const consentsInForce = async (
  db: Pick<Tx, "select">,
  farmId: string,
  investorIds?: readonly string[]
): Promise<Map<string, ConsentSaid>> => {
  const rows = await db
    .select({
      investorId: portalConsent.investorId,
      signedOn: portalConsent.signedOn,
      version: paperTemplateVersion.number,
    })
    .from(portalConsent)
    .innerJoin(
      paperTemplateVersion,
      eq(paperTemplateVersion.id, portalConsent.versionId)
    )
    .where(
      and(
        eq(portalConsent.farmId, farmId),
        isNull(portalConsent.withdrawnOn),
        investorIds
          ? inArray(portalConsent.investorId, [...investorIds])
          : undefined
      )
    );
  return new Map(
    rows.map((row) => [
      row.investorId,
      { signedOn: farmDayOf(row.signedOn), version: row.version },
    ])
  );
};

/** One Investor's consent in force, or null. */
export const consentInForce = async (
  db: Pick<Tx, "select">,
  farmId: string,
  investorId: string
): Promise<ConsentSaid | null> => {
  const inForce = await consentsInForce(db, farmId, [investorId]);
  return inForce.get(investorId) ?? null;
};

/** What the trail keeps of an Investor's consent, either side of a change: the day, the Version, and a withdrawal. */
const readConsent = async (tx: Tx, farmId: string, investorId: string) => {
  const said = await consentInForce(tx, farmId, investorId);
  return said ? { ...said } : null;
};

/** The Investor on this farm, as the consent and its paper need them. */
const onFile = async (context: Owned, investorId: string) => {
  const them = await context.db.query.investor.findFirst({
    where: { id: investorId, farmId: context.farm.id },
  });
  if (!them) {
    throw new ORPCError("NOT_FOUND", { message: "No such Investor" });
  }
  if (them.retiredAt) {
    throw refused(
      "A retired Investor is brought back before being invited",
      "investor_retired"
    );
  }
  return them;
};

/**
 * Records that an Investor signed the Portal Consent today, in front of the Owner, on the wording in force. Refused
 * while one is already in force: a new consent follows only a withdrawn one.
 */
export const recordConsent = async (
  context: Owned,
  investorId: string
): Promise<ConsentSaid> => {
  const farmId = context.farm.id;
  await onFile(context, investorId);
  if (await consentInForce(context.db, farmId, investorId)) {
    throw refused(
      "They have signed the consent already; it is in force",
      "consent_in_force"
    );
  }
  await giveStandardTemplates(context);
  const wording = await currentWording(context.db, farmId, "portal_consent");
  const now = context.clock.now();
  await audited(context).write(
    {
      entity: "portal_consent",
      entityId: investorId,
      action: "create",
      before: (tx) => readConsent(tx, farmId, investorId),
      after: (tx) => readConsent(tx, farmId, investorId),
    },
    async (tx) => {
      await tx.insert(portalConsent).values({
        id: uuidv7(now),
        farmId,
        investorId,
        versionId: wording.versionId,
        signedOn: startOfFarmDay(farmDayOf(now)),
        recordedBy: context.actor.id,
        recordedAt: now,
      });
    }
  );
  return { signedOn: farmDayOf(now), version: wording.number };
};

/**
 * The Portal Consent sheet for one Investor, to print and have signed: the wording in force with their name and phone
 * in it and the farm's own facts, signed by them first and countersigned by the Owner, its Version in the foot so the
 * paper filed says which wording it was. An Export in the trail, as every paper that leaves the farm is.
 */
export const consentSheet = async (
  context: Owned,
  investorId: string
): Promise<PaperDocument> => {
  const farmId = context.farm.id;
  const them = await onFile(context, investorId);
  assertRegistered(context.farm, "portal_consent");
  await giveStandardTemplates(context);
  const wording = await currentWording(context.db, farmId, "portal_consent");
  const him = paperInvestor(them);
  const values = {
    ...(await farmsOwnValues(context.db, context.farm, context.actor.name)),
    ...paperValues({ farm: context.farm, ownerName: context.actor.name, him }),
  };
  const document = paperFrom(wording.content, {
    kind: "portal_consent",
    parties: {
      farm: context.farm,
      ownerName: context.actor.name,
      investors: [him],
    },
    values,
    producedBy: context.actor.name,
    producedAt: producedAt(
      context.clock.now(),
      await languageOf(context.db, context.actor.id)
    ),
    version: wording.number,
  });
  await audited(context).write(
    {
      entity: "investor",
      entityId: investorId,
      action: "export",
      after: exportedPaper(context.farm, "portal_consent", {
        investorId,
        version: wording.number,
      }),
    },
    () => Promise.resolve()
  );
  return document;
};
