import { and, eq, isNull, not } from "@OpenFarm/db/operators";
import { ORPCError } from "@orpc/server";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

import type { SnapshotValue, Tx } from "./audit";
import { audited } from "./audit";
import type { Context } from "./context";
import { nameTaken } from "./names";

/**
 * A list the farm keeps — its breeds, its feeds, its medicines, its Categories, its Investors, its notifiable
 * diseases — and the one way an entry on any of them is retired, brought back, or named.
 *
 * Retired, never removed: what was fed, given, booked or signed last year still names it. Retiring what is already
 * retired, or bringing back what never went, changes nothing and writes nothing — a second tap, or a phone sending
 * the same act twice, is not a second event. A list may refuse to retire what is still in use, by its own rule, asked
 * inside the write so nothing starts using it in between. A name is taken when any entry on the list already
 * answers to it in either language, retired ones included: a retired entry is brought back, not written twice.
 */
export interface FarmList {
  /** What the trail calls an entry. */
  entity: string;
  table: PgTable & {
    id: PgColumn;
    farmId: PgColumn;
    retiredAt: PgColumn;
  };
  /** An entry as the trail keeps it either side of a change. */
  read: (tx: Tx, farmId: string, id: string) => Promise<SnapshotValue>;
  /** What the farm says when there is no such entry. */
  notFound: string;
}

type Farmed = Context & { farm: { id: string } };

/** An entry's two names as somebody gives them: the Bangla every entry has, and the English it may. */
interface Names {
  bn: string;
  en?: string | null;
}

/** Thrown inside a write that turned out to change nothing — an entry already as asked, standard entries already
 *  given — so the write rolls back and leaves no Audit Event. */
class NothingToDoError extends Error {
  constructor() {
    super("Nothing to change");
    this.name = "NothingToDoError";
  }
}

const ignoreNothingToDo = (error: unknown) => {
  if (!(error instanceof NothingToDoError)) {
    throw error;
  }
};

const standingOf = async (
  tx: Tx,
  list: FarmList,
  farmId: string,
  id: string
) => {
  const [row] = await tx
    .select({ retiredAt: list.table.retiredAt })
    .from(list.table)
    .where(and(eq(list.table.id, id), eq(list.table.farmId, farmId)));
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: list.notFound });
  }
  return { retired: row.retiredAt !== null };
};

/** Moves an entry into or out of retirement, audited, or does nothing where it is already so. */
const move = async (
  context: Farmed,
  list: FarmList,
  id: string,
  to: "retired" | "back",
  {
    reason,
    refuseWhile,
    andThen,
  }: {
    reason?: string;
    /** The list's own rule: throws the refusal while the entry is still in use. */
    refuseWhile?: (tx: Tx) => Promise<void>;
    /** What else changes with it, on the same transaction: whatever waits on an entry that is no longer on the list. */
    andThen?: (tx: Tx) => Promise<void>;
  }
): Promise<{ changed: boolean }> => {
  const farmId = context.farm.id;
  const now = context.clock.now();
  let changed = false;
  await audited(context)
    .write(
      {
        entity: list.entity,
        entityId: id,
        action: "update",
        reason,
        before: (tx) => list.read(tx, farmId, id),
        after: (tx) => list.read(tx, farmId, id),
      },
      async (tx) => {
        const { retired } = await standingOf(tx, list, farmId, id);
        if (retired === (to === "retired")) {
          throw new NothingToDoError();
        }
        await refuseWhile?.(tx);
        await tx
          .update(list.table)
          .set({ retiredAt: to === "retired" ? now : null } as never)
          .where(
            and(
              eq(list.table.id, id),
              eq(list.table.farmId, farmId),
              to === "retired"
                ? isNull(list.table.retiredAt)
                : not(isNull(list.table.retiredAt))
            )
          );
        await andThen?.(tx);
        changed = true;
      }
    )
    .catch(ignoreNothingToDo);
  return { changed };
};

/** Takes an entry off the list, never out of it. */
export const retireFromList = (
  context: Farmed,
  list: FarmList,
  id: string,
  options: {
    reason?: string;
    refuseWhile?: (tx: Tx) => Promise<void>;
    andThen?: (tx: Tx) => Promise<void>;
  } = {}
) => move(context, list, id, "retired", options);

/** Puts a retired entry back on the list. */
export const bringBackToList = (
  context: Farmed,
  list: FarmList,
  id: string,
  options: { reason?: string } = {}
) => move(context, list, id, "back", options);

/**
 * Refuses a name another entry on the list already answers to, in either language, retired ones included — with
 * the list's own refusal, and whether the one that has it is retired, so the screen can offer to bring it back.
 * Asked inside the write that would take the name, so two people adding the same one at once do not both succeed.
 */
export const assertNameFree = async (
  tx: Tx,
  farmId: string,
  list: FarmList & {
    names: { bn: PgColumn; en: PgColumn };
    /** What the list says when the name is taken — and, where it says so, when the one that has it is retired and
     *  should be brought back rather than written down twice. */
    nameTaken: {
      refusal: string;
      message: string;
      whenRetired?: { refusal: string; message: string };
    };
  },
  names: Names,
  exceptId?: string
): Promise<void> => {
  const rows = await tx
    .select({
      id: list.table.id,
      nameBn: list.names.bn,
      nameEn: list.names.en,
      retiredAt: list.table.retiredAt,
    })
    .from(list.table)
    .where(eq(list.table.farmId, farmId));
  const others = rows.map((row) => ({
    id: row.id as string,
    nameBn: row.nameBn as string,
    nameEn: (row.nameEn as string | null) ?? null,
    retiredAt: row.retiredAt,
  }));
  const taken = others.find(
    (other) => other.id !== exceptId && nameTaken([other], names, exceptId)
  );
  if (taken) {
    const said =
      taken.retiredAt !== null && list.nameTaken.whenRetired
        ? list.nameTaken.whenRetired
        : list.nameTaken;
    throw new ORPCError("BAD_REQUEST", {
      message: said.message,
      data: {
        refusal: said.refusal,
        id: taken.id,
        retired: taken.retiredAt !== null,
      },
    });
  }
};

/**
 * Gives the farm the standard entries of a list it has not been given — the first time the list is opened, or the
 * first time something needs one. One Audit Event against the farm, saying what was actually given; a request that
 * finds them all there, or loses the race to another that gave them, writes nothing and says nothing.
 */
export const giveStandardOnce = async <Key extends string>(
  context: Farmed,
  {
    entity,
    missing,
    give,
  }: {
    entity: string;
    /** Which standard entries the farm does not have. */
    missing: () => Promise<readonly Key[]>;
    /** Gives them, answering with the ones actually given. */
    give: (tx: Tx, keys: readonly Key[], now: Date) => Promise<Key[]>;
  }
): Promise<Key[]> => {
  const keys = await missing();
  if (keys.length === 0) {
    return [];
  }
  const now = context.clock.now();
  let given: Key[] = [];
  await audited(context)
    .write(
      {
        entity,
        entityId: context.farm.id,
        action: "create",
        after: () => Promise.resolve({ standard: given }),
      },
      async (tx) => {
        given = await give(tx, keys, now);
        if (given.length === 0) {
          throw new NothingToDoError();
        }
      }
    )
    .catch(ignoreNothingToDo);
  return given;
};
