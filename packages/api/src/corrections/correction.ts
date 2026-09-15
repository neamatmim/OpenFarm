import { uuidv7 } from "@OpenFarm/db/ids";
import { sql } from "@OpenFarm/db/operators";
import type { RoleName } from "@OpenFarm/db/schema/farm";
import { PAYMENT_METHODS } from "@OpenFarm/db/schema/money";
import type { ReviewReason } from "@OpenFarm/db/schema/review";
import type { CorrectionRefusal } from "@OpenFarm/domain";
import { mayCorrect } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import { z } from "zod";

import type { SnapshotValue, Tx } from "../audit";
import { audited } from "../audit";
import type { Recorder } from "../completion-store";
import { correctionWindows, reasonInput, refusalData } from "../corrections";
import { raiseNeedsReview } from "../review-store";
import { pickRoleUsed } from "../roles";
import type { Scope } from "../scope";
import { workingAs } from "../scope";

/** A value as a Correction compares it: what the screen showed against what the record holds now. */
export type Comparable = string | number | boolean | Date | null;

/** One value a Correction changes: what the person was shown, and what it should say. */
export interface Change<Shown extends Comparable, Wanted> {
  from: Shown;
  to: Wanted;
}

/** The input for one value a Correction may change: the value shown, and the value it should hold. */
export const changeOf = <
  ToSchema extends z.ZodType,
  FromSchema extends z.ZodType,
>(
  to: ToSchema,
  from: FromSchema
): z.ZodOptional<z.ZodObject<{ from: FromSchema; to: ToSchema }>> =>
  z.object({ from, to }).optional();

const paymentMethod = z.enum(PAYMENT_METHODS);

/** How the money of a record changed hands, put right: shown as nothing for a record that booked no money. */
export const paymentMethodChange = changeOf(
  paymentMethod,
  paymentMethod.nullable()
);

/** What a Correction is asked to do: which record, why, and each value it changes. */
export const correctionInput = <Shape extends z.ZodRawShape>(changes: Shape) =>
  z.object({
    id: z.string(),
    reason: reasonInput,
    // A receipt that came later changes no value.
    changes: z.object(changes).default({} as never),
  });

type ChangeSet = Record<string, Change<Comparable, unknown> | undefined>;

type ShownValues<C extends ChangeSet> = {
  [K in keyof C]-?: NonNullable<C[K]>["from"];
};
type NewValues<C extends ChangeSet> = {
  [K in keyof C]?: NonNullable<C[K]>["to"];
};

/** Somebody putting a record right, under the Role that lets them. */
export type Corrector = Recorder & { roleUsed: RoleName; scope: Scope };

/** An effect of the record this Correction cannot walk back on its own, for the Manager to look at. */
export interface CannotUndo {
  reason: ReviewReason;
  params: Record<string, unknown>;
}

/**
 * One kind of record a person can put right (the glossary's Correction): the facts the rules need from it, the values
 * it shows, and how it takes a change. `correct` does everything else, the same way for every kind.
 */
export interface CorrectionKind<
  Row,
  C extends ChangeSet,
  Outcome = unknown,
  Extra extends object = Record<never, never>,
> {
  /** The entity its Audit Events are filed under. */
  entity: string;
  /** Its table, for the row to be held while it is put right. */
  table: PgTable & { id: AnyPgColumn };
  /** The Roles that may put it right — the procedure's Role check, and the only Roles whose windows are asked about. */
  roles: readonly RoleName[];
  /** Whether a Vet called in for a visit may put it right as the Vet. */
  visitingVet?: boolean;
  /** Said when there is no such record on this farm. */
  missing: string;
  load: (tx: Tx, farmId: string, id: string) => Promise<Row | undefined>;
  /** The Audit Event's entity id, when it is not the record's own. */
  entityIdOf?: (row: Row) => string;
  /**
   * When it reached the farm, by the farm's clock, and who entered it — what its Correction Window runs from. Null for
   * a fact that was never an entry, which has no window: only the Roles that may correct it.
   */
  entry: ((row: Row) => EntryFacts) | null;
  /** Refuses a record outside the Scope of the Role the Correction is made under. */
  requireInScope?: (scope: Scope, row: Row) => void;
  /** The values it holds, as a screen shows them. */
  shown: (tx: Tx, row: Row) => Promise<ShownValues<C>>;
  /** A value it is asked to hold, as a screen would show it, when the two are not the same shape. */
  shownAs?: { [K in keyof C]?: (to: NonNullable<C[K]>["to"]) => Comparable };
  /** The record as the trail keeps it, either side of the Correction. */
  trail: (tx: Tx, row: Row) => Promise<SnapshotValue>;
  /** Whether what it was asked beyond its values changes the record — a receipt that came later — so a Correction
   *  that changes no value is still one. */
  changesBeyondValues?: (extra: Extra) => boolean;
  /** Puts the values right, telling `cannotUndo` what it could not walk back, and says what the screen needs to know. */
  apply: (
    tx: Tx,
    row: Row,
    to: NewValues<C>,
    how: {
      context: Corrector;
      now: Date;
      eventId: string;
      extra: Extra;
      cannotUndo: (one: CannotUndo) => void;
    }
  ) => Promise<Outcome>;
  /** What it does once the Correction is kept, outside the transaction: a push is a call to somebody else's server. */
  afterwards?: (context: Corrector, outcome: Outcome) => Promise<void>;
}

export interface EntryFacts {
  enteredAt: Date;
  enteredBy: string | null;
  isHealthEntry?: boolean;
}

const same = (a: Comparable, b: Comparable): boolean =>
  a instanceof Date && b instanceof Date
    ? a.getTime() === b.getTime()
    : a === b;

/** A Correction no Role they hold may make, or one whose window has closed. */
const refused = (refusal: CorrectionRefusal) =>
  new ORPCError("FORBIDDEN", {
    message:
      refusal.role === null
        ? "That is not yours to correct"
        : "The correction window for that entry has closed",
    data: {
      refusal: {
        word: refusal.role === null ? "not_theirs" : "window_closed",
        ...refusalData(refusal),
      },
    },
  });

const NOT_THEIRS: CorrectionRefusal = {
  role: null,
  windowHours: 0,
  ownEntriesOnly: true,
};

/**
 * The Role this Correction is made under: of the Roles that may correct the kind, the one whose standing and window
 * let them — the widest, so someone who is Manager and Staff corrects as the Manager.
 */
const roleToCorrect = <Row, C extends ChangeSet, Outcome, Extra extends object>(
  context: Recorder,
  kind: CorrectionKind<Row, C, Outcome, Extra>,
  row: Row,
  now: Date
): RoleName => {
  const theirs = context.roles.filter(
    (role) =>
      kind.roles.includes(role) &&
      !(role === "vet" && context.visiting && !kind.visitingVet)
  );
  if (!kind.entry) {
    const role = pickRoleUsed(theirs, kind.roles);
    if (!role) {
      throw refused(NOT_THEIRS);
    }
    return role;
  }
  const entry = kind.entry(row);
  const verdict = mayCorrect({
    roles: theirs,
    isOwnEntry: entry.enteredBy === context.actor.id,
    isHealthEntry: entry.isHealthEntry,
    recordedAt: entry.enteredAt,
    now,
    windows: correctionWindows(context.farm),
  });
  if (!verdict.allowed) {
    throw refused(verdict.refusal);
  }
  return verdict.role;
};

/**
 * Puts a record right (the glossary's Correction). On one transaction, holding the record: it finds the Role that may
 * correct it and works under that Role's Scope; refuses a value the record no longer holds, with the values it holds
 * now (ADR 0005), and a Correction that changes nothing; applies the change; raises Needs Review for what the change
 * could not walk back; and writes the Audit Event with the reason, the Role, what it said before, and the event it
 * supersedes.
 */
export const correct = async <
  Row,
  C extends ChangeSet,
  Outcome = unknown,
  Extra extends object = Record<never, never>,
>(
  context: Recorder,
  kind: CorrectionKind<Row, C, Outcome, Extra>,
  {
    id,
    reason,
    changes,
    ...rest
  }: { id: string; reason: string; changes: C } & Extra
): Promise<Outcome & { id: string }> => {
  const extra = rest as unknown as Extra;
  const input = { id, reason, changes };
  const now = context.clock.now();
  const changed = Object.entries(input.changes).flatMap(([field, change]) =>
    change ? [{ field: field as keyof C & string, ...change }] : []
  );
  const eventId = uuidv7(now);
  let corrector: Corrector | undefined;
  const outcome = await context.db.transaction(async (tx) => {
    await tx.execute(
      sql`select 1 from ${kind.table} where ${kind.table.id} = ${input.id} for update`
    );
    const row = await kind.load(tx, context.farm.id, input.id);
    if (!row) {
      throw new ORPCError("NOT_FOUND", { message: kind.missing });
    }
    const role = roleToCorrect(context, kind, row, now);
    const working: Corrector = { ...context, ...workingAs(context, role) };
    corrector = working;
    kind.requireInScope?.(working.scope, row);

    const shown = await kind.shown(tx, row);
    if (changed.some(({ field, from }) => !same(from, shown[field]))) {
      throw new ORPCError("CONFLICT", {
        message: "That was corrected by someone else since you opened it",
        data: { refusal: "changed_since", now: shown },
      });
    }
    const asShown = (field: keyof C, to: unknown): Comparable =>
      kind.shownAs?.[field]?.(to as never) ?? (to as Comparable);
    const changesAValue = changed.some(
      ({ field, to }) => !same(asShown(field, to), shown[field])
    );
    if (!(changesAValue || kind.changesBeyondValues?.(extra))) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Nothing to correct",
        data: { refusal: "nothing_to_correct" },
      });
    }

    const entityId = kind.entityIdOf?.(row) ?? input.id;
    const audit = audited(working);
    const previous = await audit.latestEventFor(tx, kind.entity, entityId);
    const before = await kind.trail(tx, row);
    const to = Object.fromEntries(
      changed.map(({ field, to: value }) => [field, value])
    ) as NewValues<C>;
    const cannotUndo: CannotUndo[] = [];
    const applied = await kind.apply(tx, row, to, {
      context: working,
      now,
      eventId,
      extra,
      cannotUndo: (one) => cannotUndo.push(one),
    });
    const after = await kind.trail(tx, row);
    for (const one of cannotUndo) {
      // oxlint-disable-next-line no-await-in-loop
      await raiseNeedsReview(
        tx,
        context.farm.id,
        {
          entity: kind.entity,
          entityId,
          reason: one.reason,
          auditEventId: eventId,
          params: one.params,
        },
        now
      );
    }
    await audit.recordEvent(
      tx,
      {
        entity: kind.entity,
        entityId,
        action: "correct",
        reason: input.reason,
        roleUsed: role,
        supersedesId: previous?.id,
      },
      { before, after, eventId, receivedAt: now }
    );
    return applied;
  });
  if (corrector && kind.afterwards) {
    await kind.afterwards(corrector, outcome);
  }
  return { ...(outcome as object), id: input.id } as Outcome & { id: string };
};
