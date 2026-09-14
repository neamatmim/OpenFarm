import type { Database } from "@OpenFarm/db";
import { uuidv7 } from "@OpenFarm/db/ids";
import {
  and,
  eq,
  inArray,
  isNull,
  like,
  notInArray,
  sql,
} from "@OpenFarm/db/operators";
import { animal, animalMove, tagSequence } from "@OpenFarm/db/schema/herd";
import { sopInstance } from "@OpenFarm/db/schema/instance";
import type {
  AnimalState,
  CalvingLead,
  ExitState,
  Side,
} from "@OpenFarm/domain";
import {
  EXIT_STATES,
  MAY_CALVE_FROM,
  OPEN_INSTANCE_STATES,
  formatTagNumber,
  isExitState,
  canTransition,
  prefixForOrigin,
  sideOfState,
  stateAfterSideChange,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";
import type { CalvingWorkFollowed } from "./calving-work";
import { followExpectedCalving } from "./calving-work";
import { lateEntry } from "./late";

/** What every way of arriving has to say about the Animal it makes. */
interface NewAnimalRows {
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
const nextTagNumber = async (
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

/**
 * Has anything moved her since this entry was recorded? A Correction can put her back only
 * while the farm has learned nothing newer about where she is; once it has, the Correction
 * is a fact about the past and where she stands is a fact about now.
 */
const movedSince = async (
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

/** Open work raised about one animal moves with her. */
const moveOpenWorkWith = (
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

/** Nothing she has left may move her: a Move of her is the world having moved under it, so it is late (ADR 0004). */
const refuseOnceSheHasLeft = (her: { state: AnimalState }) => {
  if (isExitState(her.state)) {
    throw lateEntry(`This animal has left the farm (${her.state})`);
  }
};

/** No Expected Calving: what a calved, aborted, crossed or departed cow's row says about the calving that no longer
 *  applies. */
const NO_EXPECTED_CALVING = {
  expectedCalvingAt: null,
  expectedCalvingServiceId: null,
} as const;

/**
 * The calving the farm expected no longer applies to her — she calved, lost it, or is on a Side with no calving to
 * prepare for — so the date goes, and the calving work still owed goes with it. Whether she was carrying stays in her
 * Pregnancy Checks; working out a new date, when there is one, is breeding's.
 */
export const forgetExpectedCalving = async (
  tx: Tx,
  farmId: string,
  her: { id: string; lactationNumber: number },
  {
    now,
    calvingLeadDays,
  }: {
    now: Date;
    /** How far before her Expected Calving each piece of calving work falls, for the work to close by. */
    calvingLeadDays: Record<CalvingLead, number>;
  }
): Promise<CalvingWorkFollowed> => {
  await tx
    .update(animal)
    .set({ ...NO_EXPECTED_CALVING, updatedAt: now })
    .where(and(eq(animal.id, her.id), eq(animal.farmId, farmId)));
  return followExpectedCalving(
    tx,
    {
      id: her.id,
      farmId,
      lactationNumber: her.lactationNumber,
      expectedCalvingAt: null,
    },
    calvingLeadDays,
    { expectedAgain: false }
  );
};

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
  refuseOnceSheHasLeft(beast);
  // Somebody walked her somewhere after this Move was made — a phone held it out of signal, or the Step was recorded
  // late. Walking her now would put her back where she has since left, so it is late, and a person decides.
  if (
    await movedSince(
      tx,
      beast.id,
      entry.movedAt,
      entry.completionId ?? undefined
    )
  ) {
    throw lateEntry("This animal has been moved since");
  }
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
    await forgetExpectedCalving(tx, entry.farmId, beast, entry);
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
const closeOpenWorkAboutHer = (tx: Tx, farmId: string, animalId: string) =>
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

/** Only from the State this was decided on: she has not left, and nothing has moved her on meanwhile. */
const stillIn = (farmId: string, her: { id: string; state: AnimalState }) =>
  and(
    eq(animal.id, her.id),
    eq(animal.farmId, farmId),
    eq(animal.state, her.state)
  );

/**
 * She reaches a State on her own Side because of something the farm recorded: she was found in calf, she was dried
 * off, she lost the calf, she was confirmed ready for sale. When she reached it is `at`, not when somebody wrote it
 * down — anything a State raises counts from there. Every date about a pregnancy is breeding's to work out.
 *
 * Not calving, which is `calves`; not a way across to the other Side, which is a Move (`walkTo`); not out of the herd,
 * which is `leaves`. And nothing she has left may enter anything.
 */
export const entersState = async (
  tx: Tx,
  farmId: string,
  her: { id: string; side: Side; state: AnimalState },
  { state, at, now }: { state: AnimalState; at: Date; now: Date }
): Promise<void> => {
  if (state === her.state) {
    return;
  }
  if (
    state === "milking" ||
    isExitState(state) ||
    sideOfState(state) !== her.side
  ) {
    throw new ORPCError("BAD_REQUEST", {
      message: `An animal reaches ${state} by a record of it — a calving, a Move, a sale or a death — not by a change of State`,
    });
  }
  if (!canTransition(her.state, state)) {
    throw new ORPCError("BAD_REQUEST", {
      message: `An animal cannot go from ${her.state} to ${state}`,
    });
  }
  const [reached] = await tx
    .update(animal)
    .set({ state, stateChangedAt: at, updatedAt: now })
    .where(stillIn(farmId, her))
    .returning({ id: animal.id });
  if (!reached) {
    throw new ORPCError("BAD_REQUEST", {
      message: "This animal is no longer where this was decided on",
    });
  }
};

/**
 * She calved: in milk from the hour she calved, her next Lactation begun, and the calving the farm expected behind
 * her — left standing, its date would read as her next calving and the work before it would come round again, so it
 * goes with the calving work still owed. A cow still in milk may calve again, and that begins a Lactation too.
 */
export const calves = async (
  tx: Tx,
  farmId: string,
  her: { id: string; side: Side; state: AnimalState; lactationNumber: number },
  {
    at,
    now,
    calvingLeadDays,
  }: {
    at: Date;
    now: Date;
    /** How far before her Expected Calving each piece of calving work falls, for the work to close by. */
    calvingLeadDays: Record<CalvingLead, number>;
  }
): Promise<{ lactationNumber: number; calvingWork: CalvingWorkFollowed }> => {
  if (!(MAY_CALVE_FROM as readonly string[]).includes(her.state)) {
    throw new ORPCError("BAD_REQUEST", {
      message: `A ${her.state.replace("_", " ")} does not calve`,
      data: { refusal: "calving_of_a_cow_not_in_calf" },
    });
  }
  const lactationNumber = her.lactationNumber + 1;
  const [calved] = await tx
    .update(animal)
    .set({
      state: "milking",
      stateChangedAt: at,
      lactationNumber,
      lactationStartedAt: at,
      updatedAt: now,
    })
    .where(stillIn(farmId, her))
    .returning({ id: animal.id });
  if (!calved) {
    throw new ORPCError("BAD_REQUEST", {
      message: "This animal is no longer where this was decided on",
    });
  }
  const calvingWork = await forgetExpectedCalving(
    tx,
    farmId,
    { id: her.id, lactationNumber },
    { now, calvingLeadDays }
  );
  return { lactationNumber, calvingWork };
};

/**
 * Takes an Animal out of the herd: the exit State, when she went, and the work about her shut.
 *
 * One place for every way out, because they are the same act with different paperwork — a
 * Mortality has a cause and a disposal, a Sale has a buyer and a lorry, and the herd should not
 * be able to tell the difference in how it lets go of her. Anything that only one of them does
 * belongs in its own procedure, not here.
 *
 * `at` is when she actually went, not when somebody wrote it down: a cow found dead at dawn and
 * recorded at noon reached that State at dawn, and a State-triggered SOP counts from there.
 *
 * She leaves once. And a forecast of Dairy work goes with her: her Expected Calving would
 * otherwise go on being re-timed, and raising calving work, for a cow who is not here.
 */
export const leaves = async (
  tx: Tx,
  farmId: string,
  her: { id: string },
  { state, at, now }: { state: ExitState; at: Date; now: Date }
): Promise<{ workClosed: number }> => {
  const [left] = await tx
    .update(animal)
    .set({
      state,
      stateChangedAt: at,
      ...NO_EXPECTED_CALVING,
      updatedAt: now,
    })
    .where(
      and(
        eq(animal.id, her.id),
        eq(animal.farmId, farmId),
        notInArray(animal.state, [...EXIT_STATES])
      )
    )
    .returning({ id: animal.id });
  if (!left) {
    // Recording a second exit over the first would lose which one the farm stands behind.
    throw new ORPCError("BAD_REQUEST", {
      message: "This animal has already left the farm",
    });
  }
  // Work about her outlives her otherwise: a dose due tomorrow, a weigh-in raised last week,
  // both going late and sending somebody to fetch an animal who is not there. The calving work
  // her forecast raised is among it.
  const settled = await closeOpenWorkAboutHer(tx, farmId, her.id);
  return { workClosed: settled.length };
};

/** What walking her as a Step said did: where from and to, whether she went, and whether it could not be put right. */
export interface WalkedByStep {
  fromPenId: string | null;
  toPenId: string;
  moved: boolean;
  /** She has been walked on since, so she stays where the farm last saw her and a person is asked. */
  cannotUndo: boolean;
}

/**
 * Walks her as a Step says, keyed on its Step Completion — first time, again, or put right. One Move per Completion:
 * a replayed entry or a Correction changes where she went rather than sending her on a second journey, and a Step
 * corrected to a skip takes the journey back.
 *
 * What it will not do is rewrite where she is when anything has moved her since the Step was recorded — that is a fact
 * the farm has and this Step does not, so the Move says what the Step now says and she stays where she was last seen.
 * Asked of the Moves themselves, not of where she is standing: a cow walked away and back again is standing where the
 * Step left her, and is still a cow the farm has learned something newer about.
 */
export const walkByStep = async (
  tx: Tx,
  entry: {
    farmId: string;
    beast: Parameters<typeof walkTo>[1]["beast"];
    completionId: string;
    /** Where the Step says she went, or nothing for a Step now saying she was not walked. */
    toPenId: string | null;
    movedBy: string;
    movedAt: Date;
    now: Date;
    calvingLeadDays: Record<CalvingLead, number>;
  }
): Promise<WalkedByStep | null> => {
  const { beast, completionId } = entry;
  refuseOnceSheHasLeft(beast);
  const already = await tx.query.animalMove.findFirst({
    where: { completionId },
    columns: { id: true, fromPenId: true, toPenId: true },
  });
  const somethingMovedHer = await movedSince(
    tx,
    beast.id,
    entry.movedAt,
    completionId
  );

  if (entry.toPenId === null) {
    if (!already) {
      return null;
    }
    if (somethingMovedHer) {
      return {
        fromPenId: already.fromPenId,
        toPenId: already.toPenId,
        moved: false,
        cannotUndo: true,
      };
    }
    await tx
      .delete(animalMove)
      .where(eq(animalMove.completionId, completionId));
    if (already.fromPenId) {
      await tx
        .update(animal)
        .set({ penId: already.fromPenId, updatedAt: entry.now })
        .where(eq(animal.id, beast.id));
      await moveOpenWorkWith(tx, entry.farmId, beast.id, already.fromPenId);
    }
    return null;
  }

  const { toPenId } = entry;
  const fromPenId = already?.fromPenId ?? beast.penId;
  if (already) {
    // What the Step now says, whatever becomes of her.
    await tx
      .update(animalMove)
      .set({ toPenId })
      .where(eq(animalMove.completionId, completionId));
  }
  if (somethingMovedHer) {
    return { fromPenId, toPenId, moved: false, cannotUndo: true };
  }
  if (already) {
    await tx
      .update(animal)
      .set({ penId: toPenId, updatedAt: entry.now })
      .where(eq(animal.id, beast.id));
    await moveOpenWorkWith(tx, entry.farmId, beast.id, toPenId);
  } else if (fromPenId !== toPenId) {
    await walkTo(tx, {
      farmId: entry.farmId,
      beast,
      toPenId,
      completionId,
      movedBy: entry.movedBy,
      movedAt: entry.movedAt,
      now: entry.now,
      calvingLeadDays: entry.calvingLeadDays,
    });
  }
  return {
    fromPenId,
    toPenId,
    moved: fromPenId !== toPenId,
    cannotUndo: false,
  };
};

/**
 * Puts right the hour a calving happened, for what it dated in the herd: the Lactation it began and the moment she
 * reached Milking — while that is still the Lactation and the Milking it began — and each calf's birth and her arrival
 * in the Pen. A stillborn calf's death moves with her hour too, which is the mortality's to put right.
 */
export const redateCalving = async (
  tx: Tx,
  farmId: string,
  calving: {
    damId: string;
    lactationNumber: number;
    from: Date;
    to: Date;
    calfIds: string[];
  },
  now: Date
): Promise<void> => {
  const dam = await tx.query.animal.findFirst({
    where: { id: calving.damId, farmId },
    columns: { lactationNumber: true, state: true, stateChangedAt: true },
  });
  if (dam?.lactationNumber === calving.lactationNumber) {
    const stillFromThisCalving =
      dam.state === "milking" &&
      dam.stateChangedAt.getTime() === calving.from.getTime();
    await tx
      .update(animal)
      .set({
        lactationStartedAt: calving.to,
        ...(stillFromThisCalving ? { stateChangedAt: calving.to } : {}),
        updatedAt: now,
      })
      .where(and(eq(animal.id, calving.damId), eq(animal.farmId, farmId)));
  }
  for (const calfId of calving.calfIds) {
    // oxlint-disable-next-line no-await-in-loop
    await tx
      .update(animal)
      .set({ birthDate: calving.to, updatedAt: now })
      .where(and(eq(animal.id, calfId), eq(animal.farmId, farmId)));
    // She came into the Pen the hour she was born, so her arrival moves with it.
    // oxlint-disable-next-line no-await-in-loop
    await tx
      .update(animalMove)
      .set({ movedAt: calving.to })
      .where(
        and(eq(animalMove.animalId, calfId), isNull(animalMove.fromPenId))
      );
  }
};

/**
 * Puts right how she left: the way she went, or the moment. Only for an animal who has left — an animal still on the
 * farm has no leaving to correct — and never a way back into the herd: whichever State it says, it is an exit State.
 * Whether it may be put right, and why, is the Correction's to settle before it gets here.
 */
export const correctHowSheLeft = async (
  tx: Tx,
  farmId: string,
  her: { id: string },
  { state, at, now }: { state?: ExitState; at?: Date; now: Date }
): Promise<void> => {
  if (!(state || at)) {
    return;
  }
  const [corrected] = await tx
    .update(animal)
    .set({
      ...(state ? { state } : {}),
      ...(at ? { stateChangedAt: at } : {}),
      updatedAt: now,
    })
    .where(
      and(
        eq(animal.id, her.id),
        eq(animal.farmId, farmId),
        inArray(animal.state, [...EXIT_STATES])
      )
    )
    .returning({ id: animal.id });
  if (!corrected) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Only how an animal left the farm can be put right here",
    });
  }
};
