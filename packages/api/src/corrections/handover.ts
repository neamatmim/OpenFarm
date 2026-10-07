import { eq } from "@OpenFarm/db/operators";
import { handover } from "@OpenFarm/db/schema/money";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import type { CorrectionKind } from "./correction";
import { changeOf, correctionInput } from "./correction";

const refuse = (message: string, refusal: string) =>
  new ORPCError("BAD_REQUEST", { message, data: { refusal } });

const loadHandover = (tx: Tx, farmId: string, id: string) =>
  tx.query.handover.findFirst({ where: { id, farmId } });

/** A Handover is taken back, never retyped: written twice, or to the wrong hand — voided, and written again as it was. */
export const handoverCorrectionInput = correctionInput({
  voided: changeOf(z.literal(true), z.boolean()),
});

/** A count of either hand since stands on it: the count found what the hand held, this handover counted in. */
const assertNoCountSince = async (
  tx: Tx,
  row: NonNullable<Awaited<ReturnType<typeof loadHandover>>>
) => {
  const hands = [row.fromUserId, row.toUserId].filter(
    (one): one is string => one !== null
  );
  if (hands.length === 0) {
    return;
  }
  const since = await tx.query.cashCount.findFirst({
    where: {
      farmId: row.farmId,
      userId: { in: hands },
      countedAt: { gte: row.handedAt },
    },
    columns: { id: true },
  });
  if (since) {
    throw refuse(
      "A cash count of that hand since stands on it: put the count right first",
      "counted_since"
    );
  }
};

/**
 * A cash Handover voided — written twice, or to the wrong hand — by whoever wrote it in their window and the Owner at any
 * time (the Owner, 2026-10-07). The only way back was to hand the money back the other way, an entry that said cash
 * moved twice when it never moved at all, with nothing tying the two together. Refused for a Buying Float or a sale's
 * cash paid into a Venture, which are put right on the outing and the Venture, and once a count of either hand stands
 * on it.
 */
export const handoverCorrection: CorrectionKind<
  NonNullable<Awaited<ReturnType<typeof loadHandover>>>,
  z.infer<typeof handoverCorrectionInput>["changes"]
> = {
  entity: "handover",
  table: handover,
  roles: ["owner", "manager"],
  missing: "No such handover",
  load: loadHandover,
  entry: (row) => ({ enteredAt: row.recordedAt, enteredBy: row.recordedBy }),
  shown: () => Promise.resolve({ voided: false }),
  trail: async (tx, row) =>
    (await tx.query.handover.findFirst({ where: { id: row.id } })) ?? null,
  apply: async (tx, row, to) => {
    if (!to.voided) {
      return;
    }
    if (row.buyingTripId !== null || row.ventureId !== null) {
      throw refuse(
        "That cash went with an outing or into a Venture: put it right there",
        "handover_of_an_outing"
      );
    }
    await assertNoCountSince(tx, row);
    await tx.delete(handover).where(eq(handover.id, row.id));
  },
};
