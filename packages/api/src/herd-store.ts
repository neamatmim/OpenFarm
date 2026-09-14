import type { Database } from "@OpenFarm/db";
import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, inArray, like, sql } from "@OpenFarm/db/operators";
import { animal, animalMove, tagSequence } from "@OpenFarm/db/schema/herd";
import { sopInstance } from "@OpenFarm/db/schema/instance";
import type {
  AnimalState,
  CalvingLead,
  ExitState,
  Side,
} from "@OpenFarm/domain";
import {
  OPEN_INSTANCE_STATES,
  formatTagNumber,
  isExitState,
  prefixForOrigin,
  stateAfterSideChange,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import { followExpectedCalving } from "./breeding-store";

/** What every way of arriving has to say about the Animal it makes. */
export interface NewAnimalRows {
  sex: (typeof animal.$inferInsert)["sex"];
  side: Side;
  state: (typeof animal.$inferInsert)["state"];
  penId: string;
  source: (typeof animal.$inferInsert)["source"];
  breed?: string;
  birthDate?: Date;
  officialTag?: string;
  aliases?: string[];
}

/** Takes the next Tag Number for a prefix. Row-locked inside the caller's transaction, so
 *  two concurrent registrations cannot take the same number, and numbers never rewind. */
export const nextTagNumber = async (
  tx: Tx,
  farmId: string,
  origin: Side
): Promise<string> => {
  const prefix = prefixForOrigin(origin);
  const [row] = await tx
    .insert(tagSequence)
    .values({ farmId, prefix, next: 2 })
    .onConflictDoUpdate({
      target: [tagSequence.farmId, tagSequence.prefix],
      set: { next: sql`${tagSequence.next} + 1` },
    })
    .returning({ next: tagSequence.next });
  if (!row) {
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: "Could not allocate a tag number",
    });
  }
  return formatTagNumber(prefix, row.next - 1);
};

/** The Animal with this Tag Number, whatever State it is in. */
export const requireAnimal = async (
  db: Pick<Database, "query">,
  farmId: string,
  tagNumber: string
) => {
  const row = await db.query.animal.findFirst({ where: { farmId, tagNumber } });
  if (!row) {
    throw new ORPCError("NOT_FOUND", {
      message: `No animal with tag ${tagNumber}`,
    });
  }
  return row;
};

/** What the trail and the herd's lists say about an Animal. */
export const animalSummaryColumns = {
  id: true,
  tagNumber: true,
  officialTag: true,
  aliases: true,
  sex: true,
  side: true,
  state: true,
  penId: true,
  source: true,
  breed: true,
  birthDate: true,
  photoUpdatedAt: true,
  lactationNumber: true,
  lactationStartedAt: true,
  expectedCalvingAt: true,
  milkWithdrawalUntil: true,
  meatWithdrawalUntil: true,
  milkWithdrawalFromDoses: true,
  meatWithdrawalFromDoses: true,
  withdrawalShortenedAt: true,
  withdrawalShortenedReason: true,
} as const;

/** The Animal as the audit trail records it. Every animal-scoped event is keyed on the
 *  Animal's id — the same key `register` used — so its history reads back whole. */
export const readAnimal = async (tx: Tx, animalId: string) => {
  const row = await tx.query.animal.findFirst({
    where: { id: animalId },
    columns: animalSummaryColumns,
  });
  return row ?? null;
};

/** Every Animal read for a write: refuses an unknown tag, or one that has already left —
 *  an exited Animal's history stays and nothing may change it further. */
export const loadLiveAnimal = async (
  tx: Tx,
  farmId: string,
  tagNumber: string
) => {
  const row = await requireAnimal(tx, farmId, tagNumber);
  if (isExitState(row.state)) {
    throw new ORPCError("BAD_REQUEST", {
      message: `Animal ${tagNumber} has left the farm (${row.state}) and cannot be changed`,
    });
  }
  return row;
};

/** A Staff member may only act on the Pens they are assigned to. */
export const assertPenIsTheirs = (
  context: { roleUsed: string | null; penIds: string[] },
  penId: string
) => {
  if (context.roleUsed === "staff" && !context.penIds.includes(penId)) {
    throw new ORPCError("FORBIDDEN", { message: "That pen is not yours" });
  }
};

export const requirePen = async (tx: Tx, farmId: string, penId: string) => {
  const row = await tx.query.pen.findFirst({ where: { id: penId, farmId } });
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "No such pen" });
  }
  return row;
};

/**
 * The rows that make an Animal: the Animal itself and the Move that put it in its Pen.
 *
 * Takes a transaction rather than opening one, because an arrival writes more than an Animal —
 * an Intake records what the farm paid on the same day — and an Animal without the record of how
 * it arrived is exactly the thing a half-written transaction would leave behind.
 */
export const insertAnimal = async (
  tx: Tx,
  {
    id,
    farmId,
    actorId,
    input,
    now,
    reason,
    extra = {},
    arrivedAt = now,
  }: {
    /** Made by the caller, because the Audit Event naming the new Animal is written around
     *  this and has to know what it is naming before the row exists. */
    id: string;
    farmId: string;
    actorId: string;
    input: NewAnimalRows;
    now: Date;
    reason: string;
    /** Columns only one kind of arrival sets, such as an opening register's Lactation. */
    extra?: Partial<typeof animal.$inferInsert>;
    /** When she came into the Pen, if not when she was written down: a calf is in it from the hour she was
     *  born, and the movement log dates her by it. */
    arrivedAt?: Date;
  }
): Promise<{ tagNumber: string }> => {
  await requirePen(tx, farmId, input.penId);
  const tagNumber = await nextTagNumber(tx, farmId, input.side);
  await tx.insert(animal).values({
    id,
    farmId,
    tagNumber,
    officialTag: input.officialTag ?? null,
    aliases: input.aliases ?? [],
    sex: input.sex,
    side: input.side,
    state: input.state,
    penId: input.penId,
    source: input.source,
    breed: input.breed ?? null,
    birthDate: input.birthDate ?? null,
    ...extra,
    stateChangedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  await tx.insert(animalMove).values({
    id: uuidv7(now),
    farmId,
    animalId: id,
    fromPenId: null,
    toPenId: input.penId,
    fromSide: null,
    toSide: input.side,
    reason,
    movedBy: actorId,
    movedAt: arrivedAt,
  });
  return { tagNumber };
};

/** Open work raised about one animal moves with her. */
export const moveOpenWorkWith = (
  tx: Tx,
  farmId: string,
  animalId: string,
  penId: string
) =>
  tx
    .update(sopInstance)
    .set({ penId })
    .where(
      and(
        eq(sopInstance.farmId, farmId),
        eq(sopInstance.animalId, animalId),
        inArray(sopInstance.state, [...OPEN_INSTANCE_STATES])
      )
    );

/**
 * Walks an animal to a Pen and records the journey — the one place a Move is written, so a
 * Move the Playbook made and a Move somebody recorded by hand obey the same rules.
 *
 * Open work raised about her follows her. Without that, drying a cow off leaves the checks
 * raised about her standing in the milking pen: the Staff assigned where she now is never
 * see them, and the ones assigned where she was are sent to fetch a cow who is not there.
 *
 * A Pen belongs to a Shed, not to a Side, so the Move says which Side she lands on. Crossing is a
 * Move like any other (the glossary, and the Owner's lifecycle decision): she takes the State the
 * other Side gives her, reached when she was walked across, and a Dairy forecast she no longer has
 * any use for goes — her Expected Calving, and the calving work it had raised.
 */
export const walkTo = async (
  tx: Tx,
  entry: {
    farmId: string;
    beast: {
      id: string;
      penId: string;
      side: Side;
      state: AnimalState;
      lactationNumber: number;
      expectedCalvingAt: Date | null;
    };
    toPenId: string;
    /** The Side she lands on; her own, unless she is crossing. */
    toSide?: Side;
    reason?: string | null;
    /** The Step that walked her, when the Playbook was what moved her. */
    completionId?: string | null;
    movedBy: string | null;
    movedAt: Date;
    /** The client's own id for the Move, so an outbox replay is the same fact rather than a
     *  second journey. */
    id?: string;
    now: Date;
    /** How far before her Expected Calving each piece of calving work falls, for the work to close by. */
    calvingLeadDays: Record<CalvingLead, number>;
  }
): Promise<void> => {
  const { beast } = entry;
  const toSide = entry.toSide ?? beast.side;
  const crossing = toSide !== beast.side;
  const state = crossing
    ? stateAfterSideChange(beast.state, toSide)
    : beast.state;
  if (!state) {
    throw new ORPCError("BAD_REQUEST", {
      message: `An animal in state ${beast.state} cannot move to the ${toSide} side`,
    });
  }
  // Expected Calving is a forecast of Dairy work, and Fattening has none for her to do.
  const forecastGoes =
    toSide === "fattening" && beast.expectedCalvingAt !== null;
  await tx
    .update(animal)
    .set({
      penId: entry.toPenId,
      side: toSide,
      state,
      ...(state === beast.state ? {} : { stateChangedAt: entry.movedAt }),
      ...(forecastGoes
        ? { expectedCalvingAt: null, expectedCalvingServiceId: null }
        : {}),
      updatedAt: entry.now,
    })
    .where(and(eq(animal.farmId, entry.farmId), eq(animal.id, beast.id)));
  await tx
    .insert(animalMove)
    .values({
      id: entry.id ?? uuidv7(entry.movedAt),
      farmId: entry.farmId,
      animalId: beast.id,
      fromPenId: beast.penId,
      toPenId: entry.toPenId,
      fromSide: beast.side,
      toSide,
      reason: entry.reason ?? null,
      completionId: entry.completionId ?? null,
      movedBy: entry.movedBy,
      movedAt: entry.movedAt,
    })
    .onConflictDoNothing();
  await moveOpenWorkWith(tx, entry.farmId, beast.id, entry.toPenId);
  if (forecastGoes) {
    await followExpectedCalving(
      tx,
      { ...beast, farmId: entry.farmId, expectedCalvingAt: null },
      entry.calvingLeadDays,
      { expectedAgain: false }
    );
  }
};

/**
 * Work raised about an animal who has left the herd is work nobody can do: she is not in the
 * Pen to be dosed or looked at, and the Instance would sit there going late and telling people
 * about a cow who is dead.
 *
 * Closed as missed, which is the farm's word for work that will not happen — settled, but not
 * finished, and the reason is in the Audit Event that closed it.
 */
export const closeOpenWorkAboutHer = (
  tx: Tx,
  farmId: string,
  animalId: string
) =>
  tx
    .update(sopInstance)
    .set({ state: "missed" })
    .where(
      and(
        eq(sopInstance.farmId, farmId),
        eq(sopInstance.animalId, animalId),
        inArray(sopInstance.state, [...OPEN_INSTANCE_STATES])
      )
    )
    .returning({ id: sopInstance.id });

/**
 * Shuts the work a happening raised, when the farm no longer believes the happening.
 *
 * A Heat a Correction withdrew is the case: its AI work would still send somebody to serve a cow
 * who was not in heat. Only open work — anything already done was done. Closed as missed, the
 * word the farm already uses for work that can no longer sensibly be done; why it was closed is
 * the Correction's own reason, in the trail beside it.
 */
export const closeWorkRaisedBy = (
  tx: Tx,
  farmId: string,
  happeningKey: string
) =>
  tx
    .update(sopInstance)
    .set({ state: "missed" })
    .where(
      and(
        eq(sopInstance.farmId, farmId),
        // The cause is `<happening key>:+<days>`; the key alone is the happening.
        like(sopInstance.cause, `${happeningKey}:%`),
        inArray(sopInstance.state, [...OPEN_INSTANCE_STATES])
      )
    )
    .returning({ id: sopInstance.id });

/**
 * Takes an Animal out of the herd: the exit State, when she went, and the work about her shut.
 *
 * One place for both ways out, because they are the same act with different paperwork — a
 * Mortality has a cause and a disposal, a Sale has a buyer and a lorry, and the herd should not
 * be able to tell the difference in how it lets go of her. Anything that only one of them does
 * belongs in its own procedure, not here.
 *
 * `at` is when she actually went, not when somebody wrote it down: a cow found dead at dawn and
 * recorded at noon reached that State at dawn, and a State-triggered SOP counts from there.
 */
export const recordExit = async (
  tx: Tx,
  farmId: string,
  her: { id: string },
  { state, at, now }: { state: ExitState; at: Date; now: Date }
): Promise<{ workClosed: number }> => {
  await tx
    .update(animal)
    .set({ state, stateChangedAt: at, updatedAt: now })
    .where(and(eq(animal.id, her.id), eq(animal.farmId, farmId)));
  // Work about her outlives her otherwise: a dose due tomorrow, a weigh-in raised last week,
  // both going late and sending somebody to fetch an animal who is not there.
  const settled = await closeOpenWorkAboutHer(tx, farmId, her.id);
  return { workClosed: settled.length };
};

/**
 * Has anything moved her since this entry was recorded? A Correction can put her back only
 * while the farm has learned nothing newer about where she is; once it has, the Correction
 * is a fact about the past and where she stands is a fact about now.
 */
export const movedSince = async (
  tx: Tx,
  animalId: string,
  recordedAt: Date,
  /** The Step whose own Move this would be, when a Step walked her. */
  completionId?: string
): Promise<boolean> => {
  const later = await tx.query.animalMove.findMany({
    where: { animalId, movedAt: { gt: recordedAt } },
    columns: { completionId: true },
  });
  // Its own Move is not news. The comparison is made here rather than in the query because
  // a Move nobody recorded through a Step has no Completion at all, and "not this one" in
  // SQL quietly means "not null and not this one" — which is every manual Move on the farm.
  return later.some((move) => move.completionId !== completionId);
};

export const touchAnimal = (
  tx: Tx,
  farmId: string,
  animalId: string,
  now: Date
) =>
  tx
    .update(animal)
    .set({ updatedAt: now })
    .where(and(eq(animal.farmId, farmId), eq(animal.id, animalId)));
