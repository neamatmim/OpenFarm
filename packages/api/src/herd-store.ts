import type { Database } from "@OpenFarm/db";
import { and, eq, sql } from "@OpenFarm/db/operators";
import { animal, tagSequence } from "@OpenFarm/db/schema/herd";
import type { Side } from "@OpenFarm/domain";
import {
  formatTagNumber,
  isExitState,
  prefixForOrigin,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "./audit";

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
