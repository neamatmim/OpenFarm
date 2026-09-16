import type { Database } from "@OpenFarm/db";
import type {
  Arrival,
  Disposal,
  Exit,
  MortalityKind,
  PenSpellOf,
  WithdrawalView,
} from "@OpenFarm/domain";
import {
  arrivalOf,
  daysOnFeedOf,
  exitOf,
  penSpellsOf,
  withdrawalView,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

/**
 * How much of her record to read. Her page shows a screenful; her Animal Passport shows what a buyer or a
 * slaughter vet is entitled to see, which is a great deal more. Whatever is asked for, the record says whether
 * there was more than it showed.
 */
export interface HowMuch {
  moves?: number;
  doses?: number;
  weighIns?: number;
}

/**
 * What a paper reads, and what her record reads when a caller says nothing: long enough to carry the last
 * thirty days and the stay before them; a legal course of thirty days at four doses a day, so a paper can claim
 * to have shown the last thirty days' worth; and two years of fortnightly weighings.
 */
const PAPER_DEPTH = { moves: 40, doses: 200, weighIns: 52 } as const;

/** Where she stood, by the Pen's name. */
export type HerPenSpell = PenSpellOf<{ name: string }>;

/** How she came to be here, with what the Intake recorded of it for an animal the farm bought. */
export type HerArrival = Arrival & {
  intake: {
    arrivedAt: Date;
    estimatedAgeMonths: number;
    seller: { name: string } | null;
  } | null;
};

/** How she left, with what belongs to that way of going: who took her and where she went, or what she died of
 *  and what was done with her. */
export type HerExit = Exit & {
  sale: { destination: string | null; buyer: { name: string } | null } | null;
  death: {
    kind: MortalityKind;
    cause: string;
    disposal: Disposal | null;
  } | null;
};

/**
 * Everything the farm's record says about one animal, whether she is standing in the shed or gone: what she is,
 * how she arrived, where she has stood, what she has had, what she has weighed, and how she left.
 *
 * Deliberately not one of the loaders that insist she is still here: a passport is asked for *because* she has
 * left, by whoever is holding her now, and a record that stopped being readable the moment she went would be no
 * use to the person who most needs it.
 *
 * Values, not words: her page, her papers and the registers each say them in their own way, and the reader's
 * language belongs with whoever is doing the saying. What is derived — where she stood, how she arrived, how
 * she left, how long she has been on feed, what she is held for — is derived here, once, so no two readers of
 * her record can tell a buyer different things.
 */
export const herRecord = async (
  db: Pick<Database, "query">,
  farmId: string,
  tagNumber: string,
  now: Date,
  howMuch: HowMuch = {}
) => {
  const depth = { ...PAPER_DEPTH, ...howMuch };
  const row = await db.query.animal.findFirst({
    where: { farmId, tagNumber: tagNumber.toUpperCase() },
    columns: {
      id: true,
      tagNumber: true,
      sex: true,
      breed: true,
      birthDate: true,
      source: true,
      side: true,
      state: true,
      // When she reached it: for an animal who has left, the moment she went, however she went.
      stateChangedAt: true,
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
        // ids are UUIDv7: time-ordered, so they break the tie when two Moves share an instant.
        orderBy: { movedAt: "desc", id: "desc" },
        limit: depth.moves + 1,
        columns: { id: true, movedAt: true, fromPenId: true, reason: true },
        with: {
          fromPen: { columns: { name: true } },
          toPen: { columns: { name: true } },
        },
      },
      treatments: {
        where: { givenAt: { isNotNull: true } },
        orderBy: { givenAt: "desc", id: "desc" },
        limit: depth.doses + 1,
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
        limit: depth.weighIns + 1,
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
      mortality: { columns: { kind: true, cause: true, disposal: true } },
    },
  });
  if (!row) {
    throw new ORPCError("NOT_FOUND", {
      message: `No animal with tag ${tagNumber}`,
    });
  }
  // One row past each limit was read so a reader can say it has not shown everything, rather than
  // letting anybody believe a truncated list is the whole of it.
  const moreThanShown =
    row.moves.length > depth.moves ||
    row.treatments.length > depth.doses ||
    row.weighIns.length > depth.weighIns;
  const moves = row.moves.slice(0, depth.moves);
  const arrival = arrivalOf(row.moves);
  const exit = exitOf(row);
  return {
    ...row,
    moves,
    // Narrowed here rather than at every reader: the query already asked for doses that were
    // given, and `givenAt` being nullable in the row type is about doses still owed.
    doses: row.treatments
      .slice(0, depth.doses)
      .flatMap((dose) =>
        dose.givenAt === null ? [] : [{ ...dose, givenAt: dose.givenAt }]
      ),
    weighIns: row.weighIns.slice(0, depth.weighIns),
    /** How she came to be on the farm, and what the Intake said of it. */
    arrival: arrival && { ...arrival, intake: row.intake ?? null },
    /** How she left, or nothing while she is still here. */
    exit: exit && {
      ...exit,
      sale: row.sale ?? null,
      death: row.mortality ?? null,
    },
    /** Where she stood, oldest first, her last spell ending when she left. */
    penSpells: penSpellsOf(moves, exit?.at ?? null),
    /** How long a bought-in animal has been on the farm being fed; null for one born here. */
    daysOnFeed: row.intake ? daysOnFeedOf(row.intake.arrivedAt, now) : null,
    /** What she is held for today, and whether a Vet cut the hold short. */
    withdrawal: withdrawalView(row, now),
    moreThanShown,
  };
};

/** One animal's record, as her readers have it. */
export type HerRecord = Awaited<ReturnType<typeof herRecord>>;

/** What her record says she is held for, as the papers and the herd's gates read it. */
export type HerWithdrawal = WithdrawalView;
