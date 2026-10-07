import { eq } from "@OpenFarm/db/operators";
import { observation } from "@OpenFarm/db/schema/observation";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { clearNoticesAbout } from "../alerts-store";
import type { Tx } from "../audit";
import { audited } from "../audit";
import { unraiseWhatItRaised } from "../effects/observation";
import type { CorrectionKind } from "./correction";
import { changeOf, correctionInput } from "./correction";

/** A sighting off the round, and only that: one the round wrote is put right on its Step. */
const loadSighting = async (tx: Tx, farmId: string, id: string) => {
  const row = await tx.query.observation.findFirst({ where: { id, farmId } });
  if (row && row.completionId !== null) {
    throw new ORPCError("BAD_REQUEST", {
      message: "That was seen on the round; put its Step right",
      data: { refusal: "correct_the_step" },
    });
  }
  if (row && row.withdrawnAt !== null) {
    throw new ORPCError("BAD_REQUEST", {
      message: "That sighting has already been withdrawn",
      data: { refusal: "already_withdrawn" },
    });
  }
  return row;
};

/** A sighting off the round is withdrawn, never retyped: the wrong cow, seen wrong — withdrawn, and written again as it
 *  was seen. */
export const sightingCorrectionInput = correctionInput({
  withdrawn: changeOf(z.literal(true), z.boolean()),
});

/**
 * A sighting made off the round withdrawn, as the round's are on its Step: by whoever saw it in their window, the Owner
 * and the Manager in theirs. A heat on the wrong cow raised "Serve her" and put her on the heat watch; bloat raised an
 * hour's work for the Manager; mouth sores counted toward the Pen's alert — and none of it could be taken back. The work
 * it raised is called off with it, and its notices cleared.
 */
export const sightingCorrection: CorrectionKind<
  NonNullable<Awaited<ReturnType<typeof loadSighting>>>,
  z.infer<typeof sightingCorrectionInput>["changes"]
> = {
  entity: "observation",
  table: observation,
  roles: ["owner", "manager", "staff", "vet"],
  missing: "No such sighting",
  load: loadSighting,
  // Part of her clinical record: the Vet stands over their own as over a Diagnosis.
  entry: (row) => ({
    enteredAt: row.recordedAt,
    enteredBy: row.seenBy,
    isHealthEntry: true,
  }),
  shown: () => Promise.resolve({ withdrawn: false }),
  trail: async (tx, row) =>
    (await tx.query.observation.findFirst({ where: { id: row.id } })) ?? null,
  apply: async (tx, row, to, { context, now }) => {
    if (!to.withdrawn) {
      return;
    }
    await tx
      .update(observation)
      .set({ withdrawnAt: now })
      .where(eq(observation.id, row.id));
    await unraiseWhatItRaised(
      tx,
      row.farmId,
      { id: row.id, saw: row.saw },
      audited(context).recordEvent
    );
    await clearNoticesAbout(tx, row.farmId, [row.id], now);
  },
};
