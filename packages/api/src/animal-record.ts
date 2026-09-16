import type { Database } from "@OpenFarm/db";
import type { PenSpellOf } from "@OpenFarm/domain";
import {
  arrivalOf,
  daysOnFeedOf,
  exitOf,
  penSpellsOf,
  withdrawalView,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import { animalSummaryColumns } from "./herd-store";

/**
 * How much of her record to read. Her page shows a screenful; her Animal Passport shows what a buyer or a
 * slaughter vet is entitled to see, which is a great deal more. Whatever is asked for, the record says whether
 * there was more than it showed.
 */
export interface HowDeep {
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
  howDeep: HowDeep = {}
) => {
  const depth = { ...PAPER_DEPTH, ...howDeep };
  const row = await db.query.animal.findFirst({
    where: { farmId, tagNumber: tagNumber.toUpperCase() },
    // What she is, as every list of her says it — her whole withdrawal record included, the shortening with
    // it: a hold a Vet cut short is the one thing a slaughter vet asks about, and a paper that did not say so
    // would be the farm asking to be taken at its word exactly where its word is not enough.
    columns: {
      ...animalSummaryColumns,
      // When she reached her State: for an animal who has left, the moment she went, however she went.
      stateChangedAt: true,
    },
    with: {
      moves: {
        // ids are UUIDv7: time-ordered, so they break the tie when two Moves share an instant —
        // registering an animal walks her to her first Pen in the same transaction as a Move recorded a
        // moment later, and her history should not depend on which row the database hands back first.
        orderBy: { movedAt: "desc", id: "desc" },
        limit: depth.moves + 1,
        // Both ends of the journey and the work that walked her, so her history reads as one story rather
        // than as a Move nobody can account for.
        with: {
          completion: { columns: { instanceId: true } },
          fromPen: { columns: { name: true } },
          toPen: { columns: { name: true } },
        },
      },
      treatments: {
        where: { givenAt: { isNotNull: true } },
        orderBy: { givenAt: "desc", id: "desc" },
        limit: depth.doses + 1,
        with: {
          product: {
            columns: { nameBn: true, nameEn: true, meatWithdrawalDays: true },
          },
          giver: { columns: { name: true } },
          /** Whose prescription it was. A buyer and a slaughter vet are both entitled to ask,
           *  and "prescribed" without a name is not an answer. */
          prescription: { with: { vet: { columns: { name: true } } } },
        },
      },
      weighIns: {
        orderBy: { weighedAt: "desc", id: "desc" },
        limit: depth.weighIns + 1,
        columns: {
          id: true,
          weightKg: true,
          weighedAt: true,
          method: true,
          // What the farm found doubtful about a reading, and null for one it did not doubt.
          flaggedNote: true,
        },
        with: { weigher: { columns: { name: true } } },
      },
      // What she cost and what she fetched are here because the farm knows them; who may read them is the
      // reader's to decide (CONTEXT: Scope). A paper for a buyer prints neither.
      intake: { with: { seller: { columns: { name: true, address: true } } } },
      sale: { with: { buyer: { columns: { name: true } } } },
      mortality: {
        columns: {
          kind: true,
          happenedAt: true,
          cause: true,
          disposal: true,
          disposalNote: true,
        },
        with: {
          recorder: { columns: { name: true } },
          // What she is said to have died of, and the reference the office filed the report under.
          diagnosis: {
            columns: { disease: true },
            with: { report: { columns: { reference: true } } },
          },
        },
      },
    },
  });
  if (!row) {
    throw new ORPCError("NOT_FOUND", {
      message: `No animal with tag ${tagNumber}`,
    });
  }
  // The Move that brought her onto the farm, read on its own: how she arrived is a fact about her, and a caller
  // asking for one screenful of her Moves should not be able to lose it.
  const cameIn = await db.query.animalMove.findFirst({
    where: { animalId: row.id, fromPenId: { isNull: true } },
    orderBy: { movedAt: "asc", id: "asc" },
    columns: { movedAt: true, fromPenId: true, reason: true },
  });
  // One row past each limit was read so a reader can say it has not shown everything, rather than
  // letting anybody believe a truncated list is the whole of it.
  const moreThanShown =
    row.moves.length > depth.moves ||
    row.treatments.length > depth.doses ||
    row.weighIns.length > depth.weighIns;
  const { moves: allMoves, treatments, intake, sale, mortality, ...her } = row;
  const moves = allMoves.slice(0, depth.moves);
  const arrival = arrivalOf(cameIn ? [cameIn] : []);
  const exit = exitOf(row);
  return {
    ...her,
    moves,
    // Narrowed here rather than at every reader: the query already asked for doses that were
    // given, and `givenAt` being nullable in the row type is about doses still owed.
    doses: treatments
      .slice(0, depth.doses)
      .flatMap((dose) =>
        dose.givenAt === null ? [] : [{ ...dose, givenAt: dose.givenAt }]
      ),
    weighIns: her.weighIns.slice(0, depth.weighIns),
    /** How she came to be on the farm. */
    arrival,
    /** How she left, or nothing while she is still here. */
    exit,
    /** What the farm bought her at and from whom; nothing for one born here. Kept beside how she arrived
     *  rather than inside it: an Intake is a row the farm wrote, and a reader of it should not have to go
     *  through a fact worked out from her Moves to reach one. */
    intake: intake ?? null,
    /** What she fetched and who took her; nothing while she is here. */
    sale: sale ?? null,
    /** How she died or was culled, what was done with her, and who wrote it down. */
    mortality: mortality ?? null,
    /** Where she stood, oldest first, her last spell ending when she left. */
    penSpells: penSpellsOf(moves, exit?.at ?? null),
    /** How long a bought-in animal has been on the farm being fed; null for one born here. */
    daysOnFeed: intake ? daysOnFeedOf(intake.arrivedAt, now) : null,
    /** What she is held for today, and whether a Vet cut the hold short. */
    withdrawal: withdrawalView(row, now),
    moreThanShown,
  };
};
