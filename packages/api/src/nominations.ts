import { uuidv7 } from "@OpenFarm/db/ids";
import {
  nomination,
  nominationPaper,
  nominee,
} from "@OpenFarm/db/schema/venture";
import type { Nominee, PaperDocument } from "@OpenFarm/domain";
import {
  MOST_NOMINEES,
  farmDayOf,
  nomineeRowOf,
  nomineesProblem,
  paperFrom,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Trail, Tx } from "./audit";
import { audited } from "./audit";
import { assertRegistered, exportedPaper } from "./export-store";
import { farmDay } from "./farm-clock";
import type { NominationOnFile } from "./nomination-store";
import { nominationInForce, paperNominees } from "./nomination-store";
import { paperInvestor, paperValues, producedAt } from "./paper-values";
import type { PhotoInput } from "./photo-input";
import type { Owned } from "./portal-invitable";
import { refused } from "./portal-invitable";
import { languageOf } from "./reader-language";
import { currentWording, giveStandardTemplates } from "./template-store";

/** Somebody who collects a minor Nominee's share, as a form sends them. */
const receiverInput = z.object({
  name: z.string().trim().min(1).max(120),
  relation: z.string().trim().max(60).nullable(),
  phone: z.string().trim().max(20).nullable(),
});

/** The Nominees a paper names, as a form sends them: whether they may be named is the domain's rule, not the wire's. */
export const nomineesInput = z
  .array(
    z.object({
      name: z.string().trim().max(120),
      relation: z.string().trim().max(60).nullable(),
      phone: z.string().trim().max(20).nullable(),
      bornOn: farmDay.nullable(),
      sharePercent: z.number(),
      receiver: receiverInput.nullable(),
    })
  )
  .max(MOST_NOMINEES + 1);

// The মনোনয়নপত্র (the glossary's **Nomination**): the only way an Investor's Nominees change outside signing an
// Agreement. Printed from the farm's wording for the list the Owner writes down, signed in front of the Owner, and
// recorded with the day and a photo of it; then it is the list in force for all their Agreements.

/** The Investor a মনোনয়নপত্র is for: on this farm, and not retired — a retired Investor signs nothing new. */
const theirs = async (context: Owned, investorId: string) => {
  const them = await context.db.query.investor.findFirst({
    where: { id: investorId, farmId: context.farm.id },
  });
  if (!them) {
    throw new ORPCError("NOT_FOUND", { message: "No such Investor" });
  }
  if (them.retiredAt) {
    throw refused(
      "A retired Investor signs nothing new until the Owner brings them back",
      "investor_retired"
    );
  }
  return them;
};

/** The list refused, by what is wrong with it and which Nominee it is about. */
export const assertNamable = (nominees: readonly Nominee[], onDay: string) => {
  const problem = nomineesProblem(nominees, onDay);
  if (problem) {
    throw new ORPCError("BAD_REQUEST", {
      message: `These Nominees cannot be named: ${problem.code}`,
      data: { refusal: `nominees_${problem.code}`, at: problem.at },
    });
  }
};

/**
 * The মনোনয়নপত্র for one Investor and the Nominees the Owner has written down, laid out to print and have signed today,
 * each Nominee judged a minor or not on that day. Nothing is written but the trail's line: an Export on the Investor.
 */
export const nominationToSign = async (
  context: Owned,
  investorId: string,
  nominees: readonly Nominee[]
): Promise<{
  document: PaperDocument;
  wording: {
    number: number;
    reviewedBy: string | null;
    reviewedOn: string | null;
  };
}> => {
  const them = await theirs(context, investorId);
  const now = context.clock.now();
  const today = farmDayOf(now);
  assertNamable(nominees, today);
  assertRegistered(context.farm, "a মনোনয়নপত্র");
  await giveStandardTemplates(context);
  const wording = await currentWording(
    context.db,
    context.farm.id,
    "nomination"
  );
  const him = paperInvestor(
    them,
    paperNominees({ nominees: [...nominees] }, today)
  );
  const document = paperFrom(wording.content, {
    kind: "nomination",
    parties: {
      farm: context.farm,
      ownerName: context.actor.name,
      investors: [him],
    },
    values: paperValues({
      farm: context.farm,
      ownerName: context.actor.name,
      him,
    }),
    producedBy: context.actor.name,
    producedAt: producedAt(now, await languageOf(context.db, context.actor.id)),
    version: wording.number,
  });
  await audited(context).write(
    {
      entity: "investor",
      entityId: investorId,
      action: "export",
      after: exportedPaper(context.farm, "nomination", {
        investorId,
        version: wording.number,
      }),
    },
    () => Promise.resolve()
  );
  return {
    document,
    wording: {
      number: wording.number,
      reviewedBy: wording.reviewedBy,
      reviewedOn: wording.reviewedOn,
    },
  };
};

/** A list of Nominees as the trail keeps it and the Data Copy reads it: one line, each with their share. */
const nomineesLine = (nominees: readonly Nominee[]) =>
  nominees.length === 0
    ? "কোনো নমিনি নেই"
    : nominees
        .map((one) =>
          [
            one.name,
            nomineeRowOf({ ...one, minor: false }).share,
            one.receiver ? `গ্রহণকারী ${one.receiver.name}` : null,
          ]
            .filter(Boolean)
            .join(" ")
        )
        .join("; ");

/** What the trail keeps of an Investor's Nominees in force: the day, which paper, and who. */
const snapshotOf = (inForce: NominationOnFile | null) =>
  inForce
    ? {
        signedOn: inForce.signedOn,
        nominationHow: inForce.how,
        nominees: nomineesLine(inForce.nominees),
      }
    : null;

/** The Nominees in force, as the trail snapshots them either side of a new Nomination. */
export const readNominees = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  investorId: string
) => snapshotOf(await nominationInForce(tx, farmId, investorId));

/** A Nomination's Nominees as the table holds them, in the order printed. */
export const nomineeRows = (
  nominationId: string,
  nominees: readonly Nominee[]
) =>
  nominees.map((one, index) => ({
    nominationId,
    place: index + 1,
    name: one.name.trim(),
    relation: one.relation?.trim() || null,
    phone: one.phone?.trim() || null,
    bornOn: one.bornOn,
    sharePercent: one.sharePercent,
    receiverName: one.receiver?.name.trim() || null,
    receiverRelation: one.receiver?.relation?.trim() || null,
    receiverPhone: one.receiver?.phone?.trim() || null,
  }));

/**
 * Records a মনোনয়নপত্র signed on `signedOn` in front of the Owner, with its photo: the Nominees it names, each judged
 * a minor or not on that day, pinned to the wording in force. From then on it is the list in force for all the
 * Investor's Agreements. A day in the future, or one before the list in force was signed, is refused — the newest
 * paper on file must be the newest signed.
 */
export const recordNomination = async (
  context: Owned,
  input: {
    investorId: string;
    nominees: readonly Nominee[];
    signedOn: string;
    photo: PhotoInput;
  }
): Promise<{ id: string }> => {
  const farmId = context.farm.id;
  await theirs(context, input.investorId);
  const now = context.clock.now();
  if (input.signedOn > farmDayOf(now)) {
    throw refused(
      "A মনোনয়নপত্র cannot be signed on a day still to come",
      "signed_in_future"
    );
  }
  const inForce = await nominationInForce(context.db, farmId, input.investorId);
  if (inForce && input.signedOn < inForce.signedOn) {
    throw refused(
      "A মনোনয়নপত্র cannot be signed before the one in force",
      "signed_before_in_force"
    );
  }
  assertNamable(input.nominees, input.signedOn);
  await giveStandardTemplates(context);
  const wording = await currentWording(context.db, farmId, "nomination");
  const id = uuidv7(now);
  await audited(context).write(
    {
      entity: "nomination",
      entityId: input.investorId,
      action: "create",
      before: (tx) => readNominees(tx, farmId, input.investorId),
      after: (tx) => readNominees(tx, farmId, input.investorId),
    },
    async (tx) => {
      await tx.insert(nomination).values({
        id,
        farmId,
        investorId: input.investorId,
        signedOn: input.signedOn,
        how: "nomination",
        templateVersionId: wording.versionId,
        recordedBy: context.actor.id,
        recordedAt: now,
      });
      const rows = nomineeRows(id, input.nominees);
      if (rows.length > 0) {
        await tx.insert(nominee).values(rows);
      }
      await tx.insert(nominationPaper).values({
        nominationId: id,
        farmId,
        contentType: input.photo.contentType,
        data: input.photo.data,
        updatedAt: now,
      });
    }
  );
  return { id };
};

/**
 * The Nominees an Agreement names when it is signed: those the Owner wrote down on the sign sheet, or — sent none — the
 * list in force, as the paper printed it.
 */
export const nomineesToSign = async (
  db: Pick<Tx, "query">,
  farmId: string,
  investorId: string,
  given: readonly Nominee[] | undefined
): Promise<readonly Nominee[]> => {
  if (given) {
    return given;
  }
  const inForce = await nominationInForce(db, farmId, investorId);
  return inForce?.nominees ?? [];
};

/**
 * Records the Nominees an Investment Agreement names as that Investor's Nomination, made by the Agreement, on the day
 * it was stamped — inside the signing's own transaction, so there is no Agreement without it. Recorded every time, even
 * when it names the list already in force: the Agreement is a Nomination for what it named, and the history shows every
 * paper. None named is a Nomination too, with no Nominees.
 */
export const nominationBySigning = async (
  tx: Tx,
  trail: Trail,
  {
    farmId,
    investorId,
    agreementId,
    signedOn,
    nominees,
    recordedBy,
    now,
  }: {
    farmId: string;
    investorId: string;
    agreementId: string;
    signedOn: string;
    nominees: readonly Nominee[];
    recordedBy: string;
    now: Date;
  }
) => {
  const before = await readNominees(tx, farmId, investorId);
  const id = uuidv7(now);
  await tx.insert(nomination).values({
    id,
    farmId,
    investorId,
    signedOn,
    how: "agreement",
    agreementId,
    recordedBy,
    recordedAt: now,
  });
  const rows = nomineeRows(id, nominees);
  if (rows.length > 0) {
    await tx.insert(nominee).values(rows);
  }
  await trail(
    tx,
    {
      entity: "nomination",
      entityId: investorId,
      action: "create",
      after: (read) => readNominees(read, farmId, investorId),
    },
    { before }
  );
};
