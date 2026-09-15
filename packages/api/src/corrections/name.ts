import { eq } from "@OpenFarm/db/operators";
import { user } from "@OpenFarm/db/schema/auth";
import { z } from "zod";

import type { Tx } from "../audit";
import type { CorrectionKind } from "./correction";
import { changeOf, correctionInput } from "./correction";

/** Somebody who holds, or has held, a Role on this farm. */
const loadPerson = (tx: Tx, farmId: string, id: string) =>
  tx.query.user.findFirst({
    where: { id, roles: { farmId } },
    columns: { id: true, name: true, disabledAt: true },
  });

/** What putting a person's name right changes: the name. */
export const nameCorrectionInput = correctionInput({
  name: changeOf(z.string().trim().min(1).max(120), z.string()),
});

/**
 * A person's name put right — a misspelling at sign-up, a name the farm knows them by. The Owner's. A fact that was
 * never an entry, so it has no Correction Window; the old name stays in the trail beside the reason.
 */
export const nameCorrection: CorrectionKind<
  NonNullable<Awaited<ReturnType<typeof loadPerson>>>,
  z.infer<typeof nameCorrectionInput>["changes"]
> = {
  entity: "user",
  table: user,
  roles: ["owner"],
  missing: "No such person on this farm",
  load: loadPerson,
  entry: null,
  shown: (_tx, person) => Promise.resolve({ name: person.name }),
  trail: async (tx, person) => {
    const row = await tx.query.user.findFirst({
      where: { id: person.id },
      columns: { name: true, disabledAt: true },
    });
    return row ?? null;
  },
  apply: async (tx, person, to, { now }) => {
    if (to.name !== undefined) {
      await tx
        .update(user)
        .set({ name: to.name, updatedAt: now })
        .where(eq(user.id, person.id));
    }
  },
};
