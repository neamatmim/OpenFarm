import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, isNull } from "@OpenFarm/db/operators";
import { alert } from "@OpenFarm/db/schema/alert";
import type { StampKind } from "@OpenFarm/db/schema/venture";
import { VENTURE_STATES } from "@OpenFarm/db/schema/venture";
import {
  PAY_IN_WAYS,
  payInNote,
  payInNoteChange,
  payInNotePhoto,
} from "@OpenFarm/db/schema/venture-account";
import type { NoticeFacts, PayInCloseReason } from "@OpenFarm/domain";
import {
  PAY_IN_LINE_MOST,
  PAY_IN_REFERENCE_MOST,
  capitalItMayHold,
  farmDayOf,
  isWaitingNote,
  roomForANote,
  takesCapital,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Trail, Tx } from "./audit";
import { audited } from "./audit";
import type { Context } from "./context";
import { farmDay } from "./farm-clock";
import { paperOnFile } from "./investor-store";
import type { Raised } from "./notice";
import { tell } from "./notice";
import { photoInput } from "./photo-input";
import { pushRaised } from "./push-send";
import type { VentureRow } from "./venture-act";
import { actOnVenture } from "./venture-act";
import { accountOf, takenAgainst } from "./venture-store";

// A Pay-in Note (ADR 0018): an Investor's word, from the portal, that they sent money towards one of their Agreements
// outside it. It moves no money and records no capital. The Investor changes it or withdraws it until the Owner
// answers; the Owner records the capital from it — which answers it received — or answers not found with a line. Each
// thing the Investor did is kept beneath it, and is in the trail as their own act. Nobody but the Owner reads anybody
// else's, and the Manager reads none.

/** Who acts on a note: somebody signed in to this farm, with its clock and a trail to write. */
type Acting = Context & {
  farm: NonNullable<Context["farm"]>;
  actor: NonNullable<Context["actor"]>;
};

/** What an Investor says about the money they sent. */
const said = {
  /** Whole taka or with paisa, as the bank printed it; something, and never more than the capital form takes. */
  amountMoney: z.number().positive().max(1_000_000_000),
  /** The day it went, on the farm's own clock. */
  sentOn: farmDay,
  way: z.enum(PAY_IN_WAYS),
  /** The transfer's reference, the cheque's number, the slip's, or the TrxID. */
  reference: z.string().trim().min(1).max(PAY_IN_REFERENCE_MOST),
};

/** A new note, against one of their own Agreements, with a photo of the slip if they like. */
export const payInNoteInput = z.object({
  agreementId: z.string(),
  ...said,
  photo: photoInput.nullable().default(null),
});

/** A note changed while it waits: what it says now. A photo given replaces the one kept; null takes it away; left
 *  out, the one kept stays. */
export const payInNoteChangeInput = z.object({
  noteId: z.string(),
  ...said,
  photo: photoInput.nullable().optional(),
});

/** The Owner's line to the Investor, for a note the Venture Account does not show. */
export const notFoundInput = z.object({
  noteId: z.string(),
  line: z.string().trim().min(1).max(PAY_IN_LINE_MOST),
});

const refused = (refusal: string, message: string, data = {}) =>
  new ORPCError("BAD_REQUEST", { message, data: { refusal, ...data } });

/** Somebody else's note, or none at all: no such note to anybody who asks. */
const noSuchNote = () =>
  new ORPCError("NOT_FOUND", {
    message: "No such note",
    data: { refusal: "no_such_pay_in_note" },
  });

/** A note answered, withdrawn or closed: nothing is left to do to it. */
const noteNotWaiting = () =>
  refused("pay_in_note_not_waiting", "This note is not waiting any more");

/** Off until the Owner turns it on, once the lawyer and the Shariah scholar have seen it. */
const assertSwitchedOn = (farm: { payInNotes: boolean }) => {
  if (!farm.payInNotes) {
    throw refused(
      "pay_in_notes_off",
      "The farm is not taking Pay-in Notes in the portal"
    );
  }
};

/** A day still to come is money not yet sent. */
const assertNotAhead = (sentOn: string, now: Date) => {
  if (sentOn > farmDayOf(now)) {
    throw refused("pay_in_day_ahead", "That day has not come yet");
  }
};

/** A note as the trail keeps it, either side of an act — never its photo. */
const readNote = async (tx: Pick<Tx, "query">, farmId: string, id: string) =>
  (await tx.query.payInNote.findFirst({
    where: { id, farmId },
    columns: {
      agreementId: true,
      amountMoney: true,
      sentOn: true,
      way: true,
      reference: true,
      state: true,
      movementId: true,
      answerLine: true,
      answeredAt: true,
      closedBecause: true,
      closedAt: true,
    },
  })) ?? null;

/** What a note's Notice is filed under: the Venture, then the note, so the Owner's list can be asked for one Venture's. */
const noticeIdOf = (note: { ventureId: string; noteId: string }) =>
  `${note.ventureId}:${note.noteId}`;

/**
 * Tells the Owner of a note, at once — or, for one already told of, makes the Notice say what the note says now and
 * brings it back to her list. What was raised, for the caller to push once the write has closed: a changed note is
 * not pushed again, since the Owner has been told there is money to look for.
 */
const tellTheOwnerOfANote = async (
  tx: Tx,
  farmId: string,
  facts: NoticeFacts["pay_in_note_sent"],
  isNew: boolean,
  now: Date
): Promise<Raised[]> => {
  const id = noticeIdOf(facts);
  if (isNew) {
    return await tell(
      tx,
      farmId,
      { kind: "pay_in_note_sent", about: { id }, facts },
      now
    );
  }
  await tx
    .update(alert)
    .set({ params: facts, dismissedAt: null, carriedAt: null })
    .where(
      and(
        eq(alert.farmId, farmId),
        eq(alert.kind, "pay_in_note_sent"),
        eq(alert.entityId, id)
      )
    );
  return [];
};

/** Takes a note's Notice off the Owner's list once there is nothing left to look for. */
const settleTheNoteNotice = async (
  tx: Tx,
  farmId: string,
  note: { ventureId: string; noteId: string },
  now: Date
): Promise<void> => {
  await tx
    .update(alert)
    .set({ dismissedAt: now })
    .where(
      and(
        eq(alert.farmId, farmId),
        eq(alert.kind, "pay_in_note_sent"),
        eq(alert.entityId, noticeIdOf(note)),
        isNull(alert.dismissedAt)
      )
    );
};

/** What the notes still waiting on an Agreement say altogether, one being changed left out. */
const waitingMoneyOn = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  agreementId: string,
  leavingOut: string | null
): Promise<number> => {
  const rows = await tx.query.payInNote.findMany({
    where: { farmId, agreementId, state: "waiting" },
    columns: { id: true, amountMoney: true },
  });
  return rows
    .filter((one) => one.id !== leavingOut)
    .reduce((sum, one) => sum + one.amountMoney, 0);
};

/**
 * What a new note on one Agreement may say: whether its stamped paper is on file — a note on one that is not is
 * refused — and how much it may still tell of, being what is owed less the notes already waiting. The one answer the
 * portal offers the form by and a note is refused by, so the portal never offers what it would refuse.
 */
export const whatANoteMaySay = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  agreement: { id: string; stampKind: StampKind },
  owedMoney: number,
  leavingOut: string | null = null
): Promise<{ paperOnFile: boolean; roomMoney: number }> => {
  const photo = await tx.query.agreementPaper.findFirst({
    where: { agreementId: agreement.id, farmId },
    columns: { agreementId: true },
  });
  return {
    paperOnFile: paperOnFile(agreement, photo !== undefined),
    roomMoney: roomForANote({
      owedMoney,
      waitingMoney: await waitingMoneyOn(tx, farmId, agreement.id, leavingOut),
    }),
  };
};

/**
 * Whether a note may say this much now, behind the lock: the Investor is not retired, the Venture still takes capital,
 * the stamped paper is on file — no capital is taken without it, so none is looked for — and the amount fits what the
 * Agreement still owes, less what its other notes still waiting say. Answers with the Investor's name, for the
 * Owner's Notice.
 */
const mayNoteSay = async (
  tx: Tx,
  farmId: string,
  agreement: {
    id: string;
    investorId: string;
    units: number;
    stampKind: StampKind;
  },
  standing: VentureRow,
  amountMoney: number,
  leavingOut: string | null
): Promise<string> => {
  const them = await tx.query.investor.findFirst({
    where: { id: agreement.investorId, farmId },
    columns: { name: true, retiredAt: true },
  });
  if (!them || them.retiredAt) {
    throw refused(
      "investor_retired",
      "A retired Investor's notes are not taken"
    );
  }
  if (!takesCapital(standing)) {
    throw refused(
      "venture_takes_no_capital",
      "This Venture takes no more capital"
    );
  }
  // The portal tells an Investor never to pay anywhere it does not show: with no Venture Account written, there is
  // nowhere they should have sent it.
  if (!accountOf(standing)) {
    throw refused(
      "venture_has_no_account",
      "The farm has not written this Venture's account yet"
    );
  }
  const owedMoney =
    capitalItMayHold(agreement.units, standing) -
    (await takenAgainst(tx, farmId, agreement.id));
  const { paperOnFile: onFile, roomMoney } = await whatANoteMaySay(
    tx,
    farmId,
    agreement,
    owedMoney,
    leavingOut
  );
  if (!onFile) {
    throw refused(
      "agreement_has_no_paper",
      "The stamped Agreement is not on file yet"
    );
  }
  if (amountMoney > roomMoney) {
    throw refused(
      "pay_in_over_owed",
      `This Agreement is owed ${roomMoney} more, counting the notes still waiting`,
      { roomMoney }
    );
  }
  return them.name;
};

/** This Investor's own Agreement on this farm, or none they may say anything about. */
const theirAgreement = async (
  context: Acting,
  investorId: string,
  agreementId: string
) => {
  const row = await context.db.query.investmentAgreement.findFirst({
    where: { id: agreementId, farmId: context.farm.id, investorId },
    columns: {
      id: true,
      ventureId: true,
      investorId: true,
      units: true,
      stampKind: true,
    },
  });
  if (!row) {
    throw new ORPCError("NOT_FOUND", {
      message: "No such Agreement",
      data: { refusal: "no_such_agreement" },
    });
  }
  return row;
};

/** Keeps, replaces or takes away the photo with a note. */
const keepPhoto = async (
  tx: Tx,
  farmId: string,
  noteId: string,
  photo: z.infer<typeof photoInput> | null | undefined,
  now: Date
) => {
  if (photo === undefined) {
    return;
  }
  if (photo === null) {
    await tx.delete(payInNotePhoto).where(eq(payInNotePhoto.noteId, noteId));
    return;
  }
  await tx
    .insert(payInNotePhoto)
    .values({
      noteId,
      farmId,
      contentType: photo.contentType,
      data: photo.data,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: payInNotePhoto.noteId,
      set: { contentType: photo.contentType, data: photo.data, updatedAt: now },
    });
};

/**
 * An Investor says they sent money towards one of their own Agreements: how much, the day, the way, the reference, and
 * a photo of the slip if they like. The Owner is told at once. Refused while the farm's switch is off, for a day still
 * to come, and for more than the Agreement still owes once the notes still waiting are counted. Answers with the
 * note's id.
 */
export const sendPayInNote = async (
  context: Acting,
  investorId: string,
  input: z.infer<typeof payInNoteInput>
): Promise<{ id: string }> => {
  assertSwitchedOn(context.farm);
  const farmId = context.farm.id;
  const now = context.clock.now();
  assertNotAhead(input.sentOn, now);
  const agreement = await theirAgreement(
    context,
    investorId,
    input.agreementId
  );
  const id = uuidv7(now);
  let raised: Raised[] = [];
  await actOnVenture(context, {
    ventureId: agreement.ventureId,
    // Where it stands is asked of what it takes, not of its state alone: one paid by the month takes its sums while
    // it buys and fattens.
    from: VENTURE_STATES,
    wrongState: "This Venture is gone",
    trail: {
      entity: "pay_in_note",
      entityId: id,
      action: "create",
      after: (tx) => readNote(tx, farmId, id),
    },
    apply: async (tx, standing) => {
      const investor = await mayNoteSay(
        tx,
        farmId,
        agreement,
        standing,
        input.amountMoney,
        null
      );
      const row = {
        amountMoney: input.amountMoney,
        sentOn: input.sentOn,
        way: input.way,
        reference: input.reference,
      };
      await tx.insert(payInNote).values({
        id,
        farmId,
        ventureId: standing.id,
        agreementId: agreement.id,
        investorId,
        ...row,
        state: "waiting",
        sentBy: context.actor.id,
        createdAt: now,
      });
      await tx.insert(payInNoteChange).values({
        id: uuidv7(now),
        farmId,
        noteId: id,
        kind: "sent",
        ...row,
        madeBy: context.actor.id,
        createdAt: now,
      });
      await keepPhoto(tx, farmId, id, input.photo, now);
      raised = await tellTheOwnerOfANote(
        tx,
        farmId,
        {
          noteId: id,
          ventureId: standing.id,
          venture: standing.name,
          investor,
          ...row,
        },
        true,
        now
      );
    },
  });
  await pushRaised(context, raised, now);
  return { id };
};

/** One of this Investor's own notes, still waiting, or none they may change. */
const theirWaitingNote = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  investorId: string,
  noteId: string
) => {
  const row = await tx.query.payInNote.findFirst({
    where: { id: noteId, farmId, investorId },
  });
  if (!row) {
    throw noSuchNote();
  }
  if (!isWaitingNote(row.state)) {
    throw noteNotWaiting();
  }
  return row;
};

/**
 * An Investor changes their own note while it waits — a figure typed wrong, the reference they had not to hand — and
 * the Owner's Notice says what it says now. The same checks as sending it, the note itself left out of what is
 * waiting.
 */
export const changePayInNote = async (
  context: Acting,
  investorId: string,
  input: z.infer<typeof payInNoteChangeInput>
): Promise<{ id: string }> => {
  assertSwitchedOn(context.farm);
  const farmId = context.farm.id;
  const now = context.clock.now();
  assertNotAhead(input.sentOn, now);
  const before = await theirWaitingNote(
    context.db,
    farmId,
    investorId,
    input.noteId
  );
  const agreement = await theirAgreement(
    context,
    investorId,
    before.agreementId
  );
  await actOnVenture(context, {
    ventureId: agreement.ventureId,
    from: VENTURE_STATES,
    wrongState: "This Venture is gone",
    trail: {
      entity: "pay_in_note",
      entityId: input.noteId,
      action: "update",
      before: (tx) => readNote(tx, farmId, input.noteId),
      after: (tx) => readNote(tx, farmId, input.noteId),
    },
    apply: async (tx, standing) => {
      // Asked again behind the lock: the Owner may have answered it a moment ago.
      await theirWaitingNote(tx, farmId, investorId, input.noteId);
      const investor = await mayNoteSay(
        tx,
        farmId,
        agreement,
        standing,
        input.amountMoney,
        input.noteId
      );
      const row = {
        amountMoney: input.amountMoney,
        sentOn: input.sentOn,
        way: input.way,
        reference: input.reference,
      };
      await tx.update(payInNote).set(row).where(eq(payInNote.id, input.noteId));
      await tx.insert(payInNoteChange).values({
        id: uuidv7(now),
        farmId,
        noteId: input.noteId,
        kind: "changed",
        ...row,
        madeBy: context.actor.id,
        createdAt: now,
      });
      await keepPhoto(tx, farmId, input.noteId, input.photo, now);
      await tellTheOwnerOfANote(
        tx,
        farmId,
        {
          noteId: input.noteId,
          ventureId: standing.id,
          venture: standing.name,
          investor,
          ...row,
        },
        false,
        now
      );
    },
  });
  return { id: input.noteId };
};

/**
 * An Investor withdraws their own note while it waits — sent twice, or the money never went. Never refused for where
 * the Venture stands, nor while the switch is off: nobody should be held to a note.
 */
export const withdrawPayInNote = async (
  context: Acting,
  investorId: string,
  noteId: string
): Promise<{ id: string }> => {
  const farmId = context.farm.id;
  const now = context.clock.now();
  const before = await theirWaitingNote(context.db, farmId, investorId, noteId);
  await actOnVenture(context, {
    ventureId: before.ventureId,
    from: VENTURE_STATES,
    wrongState: "This Venture is gone",
    trail: {
      entity: "pay_in_note",
      entityId: noteId,
      action: "update",
      before: (tx) => readNote(tx, farmId, noteId),
      after: (tx) => readNote(tx, farmId, noteId),
    },
    apply: async (tx) => {
      const standing = await theirWaitingNote(tx, farmId, investorId, noteId);
      await tx
        .update(payInNote)
        .set({ state: "withdrawn" })
        .where(eq(payInNote.id, noteId));
      await tx.insert(payInNoteChange).values({
        id: uuidv7(now),
        farmId,
        noteId,
        kind: "withdrawn",
        amountMoney: standing.amountMoney,
        sentOn: standing.sentOn,
        way: standing.way,
        reference: standing.reference,
        madeBy: context.actor.id,
        createdAt: now,
      });
      await settleTheNoteNotice(
        tx,
        farmId,
        { ventureId: standing.ventureId, noteId },
        now
      );
    },
  });
  return { id: noteId };
};

/**
 * Closes the notes still waiting that the act causing it has made pointless, in that act's own transaction: each
 * marked closed with why, its Notice taken off the Owner's list, and an Audit Event beside it under whoever did the act.
 * Kept, never deleted.
 */
export const closePayInNotes = async (
  tx: Tx,
  trail: Trail,
  farmId: string,
  /** Whose: one Agreement's, one Venture's, or one retired Investor's. Never the whole farm's. */
  whose:
    | { agreementId: string }
    | { ventureId: string }
    | { investorId: string },
  because: PayInCloseReason,
  now: Date
): Promise<void> => {
  const waiting = await tx.query.payInNote.findMany({
    where: { farmId, state: "waiting", ...whose },
    columns: { id: true, ventureId: true },
  });
  for (const one of waiting) {
    // One at a time: each is a statement and an Audit Event on the transaction the act holds.
    // oxlint-disable-next-line no-await-in-loop
    const before = await readNote(tx, farmId, one.id);
    // oxlint-disable-next-line no-await-in-loop
    await tx
      .update(payInNote)
      .set({ state: "closed", closedBecause: because, closedAt: now })
      // Only while still waiting: a close must never write over an answer or a withdrawal.
      .where(and(eq(payInNote.id, one.id), eq(payInNote.state, "waiting")));
    // oxlint-disable-next-line no-await-in-loop
    await settleTheNoteNotice(
      tx,
      farmId,
      { ventureId: one.ventureId, noteId: one.id },
      now
    );
    // oxlint-disable-next-line no-await-in-loop
    const after = await readNote(tx, farmId, one.id);
    // oxlint-disable-next-line no-await-in-loop
    await trail(
      tx,
      {
        entity: "pay_in_note",
        entityId: one.id,
        action: "update",
        reason: because,
      },
      { before, after }
    );
  }
};

/** How many Pay-in Notes wait for the Owner to check on each of these Ventures: none answered, withdrawn or closed. */
export const waitingNotesByVenture = async (
  db: Pick<Tx, "query">,
  farmId: string,
  ventureIds: readonly string[]
): Promise<Map<string, number>> => {
  if (ventureIds.length === 0) {
    return new Map();
  }
  const rows = await db.query.payInNote.findMany({
    where: { farmId, state: "waiting", ventureId: { in: [...ventureIds] } },
    columns: { ventureId: true },
  });
  const counted = new Map<string, number>();
  for (const one of rows) {
    counted.set(one.ventureId, (counted.get(one.ventureId) ?? 0) + 1);
  }
  return counted;
};

/** A note as the Investor reads it back, and as the Owner does: never the photo itself, only whether there is one. */
const noteAsRead = (
  row: typeof payInNote.$inferSelect,
  photoed: ReadonlySet<string>
) => ({
  id: row.id,
  ventureId: row.ventureId,
  agreementId: row.agreementId,
  amountMoney: row.amountMoney,
  sentOn: row.sentOn,
  way: row.way,
  reference: row.reference,
  state: row.state,
  hasPhoto: photoed.has(row.id),
  sentAt: row.createdAt,
  answerLine: row.answerLine,
  answeredAt: row.answeredAt,
  closedBecause: row.closedBecause,
  closedAt: row.closedAt,
});

/** Which of these notes have a photo kept with them. */
const photoedOf = async (
  db: Pick<Tx, "query">,
  farmId: string,
  noteIds: readonly string[]
): Promise<Set<string>> => {
  if (noteIds.length === 0) {
    return new Set();
  }
  const rows = await db.query.payInNotePhoto.findMany({
    where: { farmId, noteId: { in: [...noteIds] } },
    columns: { noteId: true },
  });
  return new Set(rows.map((one) => one.noteId));
};

/** Their own notes, the latest first, and where each stands. Never anybody else's. */
export const theirPayInNotes = async (
  db: Pick<Tx, "query">,
  farmId: string,
  investorId: string
) => {
  const rows = await db.query.payInNote.findMany({
    where: { farmId, investorId },
    orderBy: { createdAt: "desc", id: "desc" },
  });
  const photoed = await photoedOf(
    db,
    farmId,
    rows.map((row) => row.id)
  );
  return rows.map((row) => noteAsRead(row, photoed));
};

/**
 * The Owner recorded the capital from a note, inside that capital's own write: the note reads received, names the
 * movement it became, and leaves the Owner's list. Only a note still waiting, and only on the Agreement the capital came
 * against — money received against one paper is not another's.
 */
export const receiveTheNote = async (
  context: Acting,
  tx: Tx,
  received: { noteId: string; agreementId: string; movementId: string }
): Promise<void> => {
  const farmId = context.farm.id;
  const now = context.clock.now();
  const note = await tx.query.payInNote.findFirst({
    where: { id: received.noteId, farmId, agreementId: received.agreementId },
  });
  if (!note) {
    throw noSuchNote();
  }
  if (!isWaitingNote(note.state)) {
    throw noteNotWaiting();
  }
  const before = await readNote(tx, farmId, note.id);
  await tx
    .update(payInNote)
    .set({
      state: "received",
      movementId: received.movementId,
      answeredBy: context.actor.id,
      answeredAt: now,
    })
    .where(and(eq(payInNote.id, note.id), eq(payInNote.state, "waiting")));
  await settleTheNoteNotice(
    tx,
    farmId,
    { ventureId: note.ventureId, noteId: note.id },
    now
  );
  await audited(context).recordEvent(
    tx,
    { entity: "pay_in_note", entityId: note.id, action: "update" },
    { before, after: await readNote(tx, farmId, note.id) }
  );
};

/**
 * The Venture Account does not show the money a note says was sent: the Owner answers not found, with a line to the
 * Investor — "not in the account by the 5th, please send me the slip". The Investor may send a fresh note.
 */
export const answerNotFound = async (
  context: Acting,
  input: z.infer<typeof notFoundInput>
): Promise<{ id: string }> => {
  const farmId = context.farm.id;
  const now = context.clock.now();
  const note = await context.db.query.payInNote.findFirst({
    where: { id: input.noteId, farmId },
    columns: { ventureId: true },
  });
  if (!note) {
    throw noSuchNote();
  }
  await actOnVenture(context, {
    ventureId: note.ventureId,
    from: VENTURE_STATES,
    wrongState: "This Venture is gone",
    trail: {
      entity: "pay_in_note",
      entityId: input.noteId,
      action: "update",
      before: (tx) => readNote(tx, farmId, input.noteId),
      after: (tx) => readNote(tx, farmId, input.noteId),
    },
    apply: async (tx) => {
      const standing = await tx.query.payInNote.findFirst({
        where: { id: input.noteId, farmId },
        columns: { state: true },
      });
      if (!(standing && isWaitingNote(standing.state))) {
        throw noteNotWaiting();
      }
      await tx
        .update(payInNote)
        .set({
          state: "not_found",
          answerLine: input.line,
          answeredBy: context.actor.id,
          answeredAt: now,
        })
        .where(eq(payInNote.id, input.noteId));
      await settleTheNoteNotice(
        tx,
        farmId,
        { ventureId: note.ventureId, noteId: input.noteId },
        now
      );
    },
  });
  return { id: input.noteId };
};

/** Every note on one of this farm's Ventures, the latest first, with whose it is and the Pay-in Code of its paper. */
export const notesOnVenture = async (context: Acting, ventureId: string) => {
  const farmId = context.farm.id;
  const rows = await context.db.query.payInNote.findMany({
    where: { farmId, ventureId },
    orderBy: { createdAt: "desc", id: "desc" },
  });
  const [photoed, people, papers] = await Promise.all([
    photoedOf(
      context.db,
      farmId,
      rows.map((row) => row.id)
    ),
    context.db.query.investor.findMany({
      where: {
        farmId,
        id: { in: [...new Set(rows.map((row) => row.investorId))] },
      },
      columns: { id: true, name: true },
    }),
    context.db.query.investmentAgreement.findMany({
      where: { farmId, ventureId },
      columns: { id: true, payInCode: true },
    }),
  ]);
  const nameOf = new Map(people.map((one) => [one.id, one.name]));
  const codeOf = new Map(papers.map((one) => [one.id, one.payInCode]));
  return rows.map((row) => ({
    ...noteAsRead(row, photoed),
    investorId: row.investorId,
    investor: nameOf.get(row.investorId) ?? "",
    payInCode: codeOf.get(row.agreementId) ?? "",
    movementId: row.movementId,
  }));
};

/** The photo an Investor sent with a note, or nothing; opening it is an Export in the trail, as an Investor's paper is. */
export const notePhoto = async (context: Acting, noteId: string) => {
  const farmId = context.farm.id;
  const photo = await context.db.query.payInNotePhoto.findFirst({
    where: { noteId, farmId },
    columns: { contentType: true, data: true },
  });
  if (!photo) {
    return null;
  }
  await audited(context).write(
    {
      entity: "pay_in_note",
      entityId: noteId,
      action: "export",
      after: { photo: true },
    },
    () => Promise.resolve()
  );
  return photo;
};

export { noteAsRead, photoedOf, readNote, settleTheNoteNotice };
export type { Acting };
