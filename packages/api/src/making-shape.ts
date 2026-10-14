/**
 * A Feed Making as every reader loads it (CONTEXT.md **Feed Making**, ADR 0031): its inputs with their feeds, and its
 * made feed once it came out. One shape, so the store, the Correction, the trail and the lists read the same Making.
 */
import type { Database } from "@OpenFarm/db";
import type { MakingRead } from "@OpenFarm/domain";
import { startOfFarmDay } from "@OpenFarm/domain";
import { cameInAt } from "@OpenFarm/domain/lots";

import type { Tx } from "./audit";

/** What of a Making's relations are read with it. */
export const MAKING_WITH = {
  inputs: {
    columns: { feedItemId: true, quantity: true },
    with: {
      feedItem: { columns: { nameBn: true, nameEn: true, unit: true } },
    },
    orderBy: { feedItemId: "asc" },
  },
  madeFeed: {
    columns: {
      id: true,
      feedItemId: true,
      quantity: true,
      receivedOn: true,
      recordedAt: true,
      recordedBy: true,
    },
  },
} as const;

type Db = Pick<Database, "query"> | Tx;

/** One Making on this farm, as `MAKING_WITH` reads it; nothing for one that is not. */
export const loadMaking = (db: Db, farmId: string, id: string) =>
  db.query.feedMaking.findFirst({ where: { id, farmId }, with: MAKING_WITH });

export type LoadedMaking = NonNullable<Awaited<ReturnType<typeof loadMaking>>>;

/** Every Making on this farm, as `MAKING_WITH` reads it — but the one being put right, judged as if it were not. */
export const loadMakings = (
  db: Db,
  farmId: string,
  excludingMaking?: string
): Promise<LoadedMaking[]> =>
  db.query.feedMaking.findMany({
    where: {
      farmId,
      ...(excludingMaking ? { id: { ne: excludingMaking } } : {}),
    },
    with: MAKING_WITH,
  });

/** What went into a Making, as a list says it: each feed by its names and unit, and how much. */
export const inputsSaid = (inputs: LoadedMaking["inputs"]) =>
  inputs.map((one) => ({
    feedItemId: one.feedItemId,
    nameBn: one.feedItem.nameBn,
    nameEn: one.feedItem.nameEn,
    unit: one.feedItem.unit,
    quantity: Number(one.quantity),
  }));

/** When a Making's inputs left the store: its day, at the moment it was written down where that was the same day. */
export const madeAtOf = (making: { madeOn: string; recordedAt: Date }): Date =>
  cameInAt(startOfFarmDay(making.madeOn), making.recordedAt);

/** A Making as the store reads it: when, what went in, and what came out when. */
export const makingRead = (making: LoadedMaking): MakingRead => ({
  id: making.id,
  madeAt: madeAtOf(making),
  outputFeedItemId: making.outputFeedItemId,
  inputs: making.inputs.map((one) => ({
    feedItemId: one.feedItemId,
    quantity: Number(one.quantity),
  })),
  madeFeed: making.madeFeed
    ? {
        arrivalId: making.madeFeed.id,
        at: cameInAt(making.madeFeed.receivedOn, making.madeFeed.recordedAt),
        quantity: Number(making.madeFeed.quantity),
      }
    : null,
});
