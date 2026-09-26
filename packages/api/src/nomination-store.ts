import type { NOMINATION_HOW } from "@OpenFarm/db/schema/venture";
import type { Nominee, PaperNominee } from "@OpenFarm/domain";
import { isMinorOn } from "@OpenFarm/domain";

import type { Tx } from "./audit";

/** How a Nomination came to be on file: a মনোনয়নপত্র, an Agreement, or carried over and not yet signed for. */
export type NominationHow = (typeof NOMINATION_HOW)[number];

/** One Nomination as the farm keeps it: the paper, and every Nominee it names in the order printed. */
export interface NominationOnFile {
  id: string;
  how: NominationHow;
  signedOn: string;
  agreementId: string | null;
  templateVersionId: string | null;
  recordedBy: string | null;
  recordedAt: Date;
  hasPhoto: boolean;
  nominees: Nominee[];
}

type Reader = Pick<Tx, "query">;

/**
 * Newest first, and the same order every time: by the day signed, then when it was recorded, then its id — two
 * recorded in one transaction share a timestamp, and the list in force must not turn on luck.
 */
const NEWEST_FIRST = {
  signedOn: "desc",
  recordedAt: "desc",
  id: "desc",
} as const;

const onFile = (row: {
  id: string;
  how: NominationHow;
  signedOn: string;
  agreementId: string | null;
  templateVersionId: string | null;
  recordedBy: string | null;
  recordedAt: Date;
  paper: { nominationId: string } | null;
  nominees: {
    name: string;
    relation: string | null;
    phone: string | null;
    bornOn: string | null;
    sharePercent: number;
    receiverName: string | null;
    receiverRelation: string | null;
    receiverPhone: string | null;
  }[];
}): NominationOnFile => ({
  id: row.id,
  how: row.how,
  signedOn: row.signedOn,
  agreementId: row.agreementId,
  templateVersionId: row.templateVersionId,
  recordedBy: row.recordedBy,
  recordedAt: row.recordedAt,
  hasPhoto: row.paper !== null,
  nominees: row.nominees.map((one) => ({
    name: one.name,
    relation: one.relation,
    phone: one.phone,
    bornOn: one.bornOn,
    sharePercent: one.sharePercent,
    receiver: one.receiverName
      ? {
          name: one.receiverName,
          relation: one.receiverRelation,
          phone: one.receiverPhone,
        }
      : null,
  })),
});

const WITH_NOMINEES = {
  nominees: { orderBy: { place: "asc" } },
  paper: { columns: { nominationId: true } },
} as const;

/** Every Nomination an Investor has on file, newest first. */
export const nominationsOf = async (
  db: Reader,
  farmId: string,
  investorId: string
): Promise<NominationOnFile[]> => {
  const rows = await db.query.nomination.findMany({
    where: { farmId, investorId },
    orderBy: NEWEST_FIRST,
    with: WITH_NOMINEES,
  });
  return rows.map(onFile);
};

/**
 * The list in force for an Investor: their latest Nomination, whichever paper it was — the only way anything reads
 * who their Nominees are. Null for an Investor who has never had one on file.
 */
export const nominationInForce = async (
  db: Reader,
  farmId: string,
  investorId: string
): Promise<NominationOnFile | null> => {
  const row = await db.query.nomination.findFirst({
    where: { farmId, investorId },
    orderBy: NEWEST_FIRST,
    with: WITH_NOMINEES,
  });
  return row ? onFile(row) : null;
};

/** The list in force for each of several Investors at once, for a list of them; one who has none is not in it. */
export const nominationsInForceFor = async (
  db: Reader,
  farmId: string,
  investorIds: readonly string[]
): Promise<Map<string, NominationOnFile>> => {
  if (investorIds.length === 0) {
    return new Map();
  }
  const rows = await db.query.nomination.findMany({
    where: { farmId, investorId: { in: [...investorIds] } },
    orderBy: NEWEST_FIRST,
    with: WITH_NOMINEES,
  });
  const inForce = new Map<string, NominationOnFile>();
  for (const row of rows) {
    if (!inForce.has(row.investorId)) {
      inForce.set(row.investorId, onFile(row));
    }
  }
  return inForce;
};

/** The Nominees a paper for `onDay` prints: each marked a minor or not on that day. None, for no Nomination. */
export const paperNominees = (
  nomination: Pick<NominationOnFile, "nominees"> | null,
  onDay: string
): PaperNominee[] =>
  (nomination?.nominees ?? []).map((one) => ({
    ...one,
    minor: one.bornOn ? isMinorOn(one.bornOn, onDay) : false,
  }));
