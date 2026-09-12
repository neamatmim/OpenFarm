import type { Database } from "@OpenFarm/db";
import type { DoseGiven, PenSpell, ShortenedHold } from "@OpenFarm/domain";
import { withdrawalEndsAt, withdrawalView } from "@OpenFarm/domain";
import type { Language } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { ORPCError } from "@orpc/server";

/** Long enough to carry the last thirty days and the stay before them. A row count, not a number
 *  of days, and the paper says so when there were more. */
const PEN_ROWS = 40;
/** A legal course runs to thirty days at four doses a day, so a paper has to hold more than a
 *  hundred before it can claim to have shown the last thirty days' worth. */
const DOSE_ROWS = 200;
/** Two years of fortnights. */
const READING_ROWS = 52;

/**
 * Everything one animal's papers are made from, whether she is standing in the shed or gone.
 *
 * Deliberately not one of the loaders that insist she is still here: a passport is asked for
 * *because* she has left, by whoever is holding her now, and a record that stopped being readable
 * the moment she went would be no use to the person who most needs it.
 */
export const herWholeRecord = async (
  db: Database,
  farmId: string,
  tagNumber: string
) => {
  const row = await db.query.animal.findFirst({
    where: { farmId, tagNumber: tagNumber.toUpperCase() },
    columns: {
      id: true,
      tagNumber: true,
      sex: true,
      breed: true,
      birthDate: true,
      source: true,
      state: true,
      // Her whole withdrawal record, the shortening included: a hold a Vet cut short is the one
      // thing a slaughter vet asks about, and a paper that did not say so would be the farm
      // asking to be taken at its word exactly where its word is not enough.
      meatWithdrawalUntil: true,
      meatWithdrawalFromDoses: true,
      milkWithdrawalUntil: true,
      milkWithdrawalFromDoses: true,
      withdrawalShortenedAt: true,
      withdrawalShortenedReason: true,
    },
    with: {
      moves: {
        orderBy: { movedAt: "desc", id: "desc" },
        limit: PEN_ROWS + 1,
        with: { toPen: { columns: { name: true } } },
      },
      treatments: {
        where: { givenAt: { isNotNull: true } },
        orderBy: { givenAt: "desc", id: "desc" },
        limit: DOSE_ROWS + 1,
        with: {
          product: { columns: { nameBn: true, meatWithdrawalDays: true } },
          giver: { columns: { name: true } },
          /** Whose prescription it was. A buyer and a slaughter vet are both entitled to ask,
           *  and "prescribed" without a name is not an answer. */
          prescription: { with: { vet: { columns: { name: true } } } },
        },
      },
      weighIns: {
        orderBy: { weighedAt: "desc", id: "desc" },
        limit: READING_ROWS + 1,
        columns: { weightKg: true, weighedAt: true },
      },
      intake: {
        columns: { arrivedAt: true, estimatedAgeMonths: true },
        with: { seller: { columns: { name: true } } },
      },
      sale: {
        columns: { soldAt: true, destination: true },
        with: { buyer: { columns: { name: true } } },
      },
    },
  });
  if (!row) {
    throw new ORPCError("NOT_FOUND", {
      message: `No animal with tag ${tagNumber}`,
    });
  }
  // One row past each limit was read so the paper can say it has not shown everything, rather
  // than letting a reader believe a truncated list is the whole of it.
  const moreThanShown =
    row.moves.length > PEN_ROWS ||
    row.treatments.length > DOSE_ROWS ||
    row.weighIns.length > READING_ROWS;
  return {
    ...row,
    moves: row.moves.slice(0, PEN_ROWS),
    // Narrowed here rather than at every reader: the query already asked for doses that were
    // given, and `givenAt` being nullable in the row type is about doses still owed.
    treatments: row.treatments
      .slice(0, DOSE_ROWS)
      .flatMap((dose) =>
        dose.givenAt === null ? [] : [{ ...dose, givenAt: dose.givenAt }]
      ),
    weighIns: row.weighIns.slice(0, READING_ROWS),
    moreThanShown,
  };
};

/** What the farm says about her hold today, and whether a Vet cut it short. */
export const herWithdrawal = (
  her: Parameters<typeof withdrawalView>[0],
  now: Date,
  language: Language
): {
  clear: boolean;
  clearOn: string | null;
  shortened: ShortenedHold | null;
} => {
  const view = withdrawalView(her, now);
  return {
    clear: !view.underMeatWithdrawal,
    clearOn: view.meatWithdrawalUntil
      ? formatDate(view.meatWithdrawalUntil, language, "date")
      : null,
    shortened: view.shortened
      ? {
          on: formatDate(view.shortened.at, language, "date"),
          reason: view.shortened.reason,
          wouldHaveRunTo: view.shortened.wasMeatUntil
            ? formatDate(view.shortened.wasMeatUntil, language, "date")
            : null,
        }
      : null,
  };
};

/** Where she came from, in words rather than a column value. */
export const sourceOf = (her: {
  source: string;
  intake?: { seller: { name: string } | null } | null;
}): string => {
  if (her.source !== "bought") {
    return "খামারে জন্ম / born here";
  }
  // Bought, and the farm may or may not have written down from whom.
  return her.intake?.seller
    ? `${her.intake.seller.name} থেকে কেনা / bought from`
    : "কেনা / bought";
};

/** Her age as the farm can say it: from her birth date if it knows one, and otherwise from what
 *  the seller said at Intake, which is a judgement and is labelled as one. */
export const ageOf = (
  her: {
    birthDate: Date | null;
    intake?: { estimatedAgeMonths: number } | null;
  },
  language: Language
): string | null => {
  if (her.birthDate) {
    return formatDate(her.birthDate, language, "date");
  }
  return her.intake
    ? `আনুমানিক ${formatNumber(her.intake.estimatedAgeMonths, language)} মাস (আসার সময়) / estimated at intake`
    : null;
};

/** Her pen history as spells: where she stood, from when, and until the next Move took her. */
export const penSpells = (
  moves: { movedAt: Date; toPen: { name: string } }[],
  /** When she left the farm, if she has: her last pen ended then, and a paper saying she is
   *  still standing in it would be wrong on the very document that exists because she has gone. */
  leftAt: Date | null,
  language: Language
): PenSpell[] =>
  moves.map((move, index) => {
    // The Move before it in this newest-first list is the one that took her away again.
    const takenAway = index === 0 ? leftAt : moves[index - 1]?.movedAt;
    return {
      penName: move.toPen.name,
      from: formatDate(move.movedAt, language, "date"),
      until: takenAway ? formatDate(takenAway, language, "date") : null,
    };
  });

/** One dose, as either paper reports it. */
export const doseGiven = (
  dose: {
    givenAt: Date;
    product: { nameBn: string; meatWithdrawalDays: number | null };
    giver: { name: string } | null;
    prescription: { vet: { name: string } | null } | null;
  },
  language: Language
): DoseGiven => ({
  productName: dose.product.nameBn,
  givenOn: formatDate(dose.givenAt, language, "date"),
  // What this dose alone held her for, which is not the same as what she is held for today: a
  // Vet may have cut the hold short, and the papers say so where they say she is clear.
  meatClearOn: dose.product.meatWithdrawalDays
    ? formatDate(
        withdrawalEndsAt(dose.givenAt, dose.product.meatWithdrawalDays),
        language,
        "date"
      )
    : null,
  prescribedBy: dose.prescription?.vet?.name ?? null,
  givenBy: dose.giver?.name ?? null,
});
