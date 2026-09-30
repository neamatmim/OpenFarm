import type { Tx } from "../audit";
import { recordCashCount, removeCashCount } from "../cash-store";
import type { EffectInput, EffectKind, EffectResult } from "./effect";
import { numberIn } from "./evidence";

type CashCountFacts = Pick<
  EffectInput,
  | "step"
  | "instance"
  | "completionId"
  | "evidence"
  | "skipped"
  | "recordedBy"
  | "recordedAt"
  | "now"
>;

/** What the counter wrote beside the figure, where the Step asks for a note and they wrote one. */
const noteIn = (input: CashCountFacts): string | null => {
  const index = input.step.evidence.findIndex((item) => item.type === "note");
  const written = index === -1 ? undefined : input.evidence[index];
  return typeof written === "string" && written.trim() !== ""
    ? written.trim()
    : null;
};

/** Counts the cash in the counter's own hand, blind, and sets it beside what the farm said they held. */
const countTheCash = async (
  tx: Tx,
  input: CashCountFacts
): Promise<EffectResult> => {
  if (input.skipped) {
    await removeCashCount(tx, input.completionId);
    return null;
  }
  const farm = await tx.query.farm.findFirst({
    where: { id: input.instance.farmId },
    columns: { id: true, cashShortTellBdt: true },
  });
  if (!farm) {
    return null;
  }
  const { differs } = await recordCashCount(tx, {
    farm,
    userId: input.recordedBy,
    completionId: input.completionId,
    counted: numberIn(input.step, input.evidence),
    note: noteIn(input),
    countedAt: input.recordedAt,
    now: input.now,
  });
  return { kind: "cash_count", differs };
};

/** A Step that counts the cash in hand. The counter's own hand: an Owner or a Manager, who hold the farm's cash. */
export const cashCountEffect: EffectKind<CashCountFacts> = {
  kind: "cash_count",
  recordableBy: {
    roles: ["owner", "manager"],
    refusal: {
      message: "Counting the cash in hand is the Manager's or the Owner's",
      reason: "manager_only",
    },
  },
  apply: countTheCash,
};
