import { SMALLEST_FEED_AMOUNT } from "@OpenFarm/domain";

// A Feed Making as the sheet holds it while it is typed (CONTEXT.md **Feed Making**, ADR 0030): what it makes, what
// goes in, and whether it is a mix in the store today or silage that comes out of the pit later. Kept apart from the
// sheet so what the farm is sent, and what is still missing, is worked out — and tested — in one place.

/** One feed going in, as typed. */
export interface DraftLine {
  /** The row's own key, for the list: a feed may be chosen and changed. */
  key: string;
  feedItemId: string;
  quantity: string;
}

/** A mix made and in the store today, or silage packed to come out later. */
export type MakingHow = "now" | "later";

export interface MakingDraft {
  outputFeedItemId: string;
  madeOn: string;
  lines: DraftLine[];
  how: MakingHow;
  /** How much it made, for a mix. */
  cameOut: string;
  /** When silage should be ready to open; may be left empty. */
  readyOn: string;
  note: string;
}

let nextKey = 0;
/** A fresh row's key. */
export const lineKey = (): string => {
  nextKey += 1;
  return `line-${nextKey}`;
};

/** An empty row to type a feed into. */
export const blankLine = (): DraftLine => ({
  key: lineKey(),
  feedItemId: "",
  quantity: "",
});

/** A sheet opened today: nothing chosen, two rows to start with, made now. */
export const blankDraft = (today: string): MakingDraft => ({
  outputFeedItemId: "",
  madeOn: today,
  lines: [blankLine(), blankLine()],
  how: "now",
  cameOut: "",
  readyOn: "",
  note: "",
});

/** A figure as typed, read as one the farm keeps: a tenth of the unit at least. Nothing when it is not one. */
const amountOf = (typed: string): number | null => {
  const figure = Number(typed.trim());
  return typed.trim() !== "" &&
    Number.isFinite(figure) &&
    figure >= SMALLEST_FEED_AMOUNT
    ? figure
    : null;
};

/** Whether nobody has typed into the rows yet: then choosing what it makes may fill them as last time. */
const untouched = (lines: readonly DraftLine[]): boolean =>
  lines.every((one) => one.feedItemId === "" && one.quantity.trim() === "");

/**
 * What it makes, chosen: the rows filled as the last making of the same feed had them — a farm mixes its concentrate
 * the same way week on week — unless somebody has already typed into them. Nothing to fill from, the rows stay.
 */
export const choosingOutput = (
  draft: MakingDraft,
  outputFeedItemId: string,
  lastOfIt:
    | { inputs: readonly { feedItemId: string; quantity: number }[] }
    | undefined
): { draft: MakingDraft; filled: boolean } => {
  const chosen = { ...draft, outputFeedItemId };
  if (!(lastOfIt && untouched(draft.lines)) || lastOfIt.inputs.length === 0) {
    return { draft: chosen, filled: false };
  }
  return {
    draft: {
      ...chosen,
      lines: lastOfIt.inputs.map((one) => ({
        key: lineKey(),
        feedItemId: one.feedItemId,
        quantity: String(one.quantity),
      })),
    },
    filled: true,
  };
};

/** The rows that say something: a feed chosen, or an amount typed. Empty rows are left behind. */
const saidLines = (lines: readonly DraftLine[]) =>
  lines.filter((one) => one.feedItemId !== "" || one.quantity.trim() !== "");

/** What is still missing before the farm can be asked, first first; nothing when it is all there. */
export const whatIsMissing = (
  draft: MakingDraft
): "output" | "inputs" | "amount" | null => {
  if (draft.outputFeedItemId === "") {
    return "output";
  }
  const lines = saidLines(draft.lines);
  if (
    lines.length === 0 ||
    lines.some(
      (one) => one.feedItemId === "" || amountOf(one.quantity) === null
    )
  ) {
    return "inputs";
  }
  if (draft.how === "now" && amountOf(draft.cameOut) === null) {
    return "amount";
  }
  return null;
};

/** How it comes into the store: a mix with what it made, silage with when it should be ready, if that was said. */
const howItComes = (
  draft: MakingDraft
): { cameOut?: { quantity: number }; readyOn?: string } => {
  if (draft.how === "now") {
    return { cameOut: { quantity: amountOf(draft.cameOut) ?? 0 } };
  }
  return draft.readyOn === "" ? {} : { readyOn: draft.readyOn };
};

/** What the farm is sent for a draft with nothing missing. */
export const makingOfDraft = (draft: MakingDraft) => ({
  outputFeedItemId: draft.outputFeedItemId,
  madeOn: draft.madeOn,
  inputs: saidLines(draft.lines).map((one) => ({
    feedItemId: one.feedItemId,
    quantity: amountOf(one.quantity) ?? 0,
  })),
  ...howItComes(draft),
  ...(draft.note.trim() === "" ? {} : { note: draft.note.trim() }),
});
