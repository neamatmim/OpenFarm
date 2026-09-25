import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, inArray, isNull } from "@OpenFarm/db/operators";
import { paperTemplateVersion } from "@OpenFarm/db/schema/paper-template";
import { portalConsent } from "@OpenFarm/db/schema/venture";
import type { PaperDocument } from "@OpenFarm/domain";
import { farmDayOf, paperFrom, startOfFarmDay } from "@OpenFarm/domain";

import type { Tx } from "./audit";
import { audited } from "./audit";
import { farmsOwnValues } from "./data-keepers";
import { assertRegistered, exportedPaper } from "./export-store";
import { paperInvestor, paperValues, producedAt } from "./paper-values";
import type { Owned } from "./portal-invitable";
import { invitable, refused } from "./portal-invitable";
import { languageOf } from "./reader-language";
import { currentWording, giveStandardTemplates } from "./template-store";

// The Portal Consent (the glossary's entry): signed on paper in front of the Owner before any code is given, and
// recorded here with the day, the wording signed and who recorded it. The paper is filed; this is how the farm proves
// it (Personal Data Protection Act 2026 s.5(4)).

/** A consent in force, as the Owner's screens say it: the day it was signed and the Version of the wording. */
export interface ConsentSaid {
  signedOn: string;
  version: number;
  versionId: string;
}

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
      versionId: portalConsent.versionId,
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
      {
        signedOn: farmDayOf(row.signedOn),
        version: row.version,
        versionId: row.versionId,
      },
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

/**
 * What the trail keeps of an Investor's consent in force, either side of recording one: the day, and the Version by
 * number and id — never a code. A plain copy, as the trail writes every record down.
 */
const readConsent = async (tx: Tx, farmId: string, investorId: string) => {
  const said = await consentInForce(tx, farmId, investorId);
  return said ? { ...said } : null;
};

/** A consent is in force already: a new one follows only a withdrawn one. */
const alreadySigned = () =>
  refused(
    "They have signed the consent already; it is in force",
    "consent_in_force"
  );

/**
 * Records that an Investor signed the Portal Consent today, in front of the Owner, on the wording in force. Refused
 * while one is already in force: a new consent follows only a withdrawn one.
 */
export const recordConsent = async (
  context: Owned,
  investorId: string
): Promise<ConsentSaid> => {
  const farmId = context.farm.id;
  await invitable(context, investorId);
  if (await consentInForce(context.db, farmId, investorId)) {
    throw alreadySigned();
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
      // One in force at a time, held by the table: a second press of the same button meets the first one's consent.
      const [kept] = await tx
        .insert(portalConsent)
        .values({
          id: uuidv7(now),
          farmId,
          investorId,
          versionId: wording.versionId,
          signedOn: startOfFarmDay(farmDayOf(now)),
          recordedBy: context.actor.id,
          recordedAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: portalConsent.id });
      if (!kept) {
        throw alreadySigned();
      }
    }
  );
  return {
    signedOn: farmDayOf(now),
    version: wording.number,
    versionId: wording.versionId,
  };
};

/**
 * The Portal Consent sheet for one Investor, to print and have signed: the wording in force with their name and phone
 * in it (the standard wording names both) and the farm's own facts, signed by them first and countersigned by the Owner, its Version in the foot so the
 * paper filed says which wording it was. An Export in the trail, as every paper that leaves the farm is.
 */
export const consentSheet = async (
  context: Owned,
  investorId: string
): Promise<PaperDocument> => {
  const farmId = context.farm.id;
  const { who: them } = await invitable(context, investorId);
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
