// The shapes the work page passes between its parts.
import type { FactsAsShown } from "@OpenFarm/api/effects/effect";
import type { MilkDestination, SopChange } from "@OpenFarm/domain";
import { isFinished, mayTransition } from "@OpenFarm/domain";

export interface Animal {
  id: string;
  tagNumber: string;
  photoUpdatedAt: Date | null;
  /** Her milk cannot go to the tank: the tile locks and the sheet offers Discard only. */
  underMilkWithdrawal: boolean;
  /** What she gave or weighed the time before, where the Step reads a figure against it. A phone's copy from before
   *  the farm said it has none. */
  last?: { figure: number; at: Date } | null;
}

/** What finishing says: only work somebody signs off waits for them; the rest is finished when it is finished. */
export const finishedWord = (checkerRole: string | null | undefined) =>
  checkerRole ? "work.finished" : "work.finishedNoCheck";

/** What the server's effect decided, shown back to the person who recorded it — the tank
 *  reading against what the cows account for, and whether that needs the Manager. */
export interface BulkOutcome {
  differenceLiters: number;
  flagged: boolean;
}
/** Work closed without being done — Missed or Called Off: neither owed any more nor finished. */
export const isClosed = (state: string) =>
  !(mayTransition("record", state) || isFinished(state));

export interface Completion {
  id: string;
  stepId: string;
  animalId: string | null;
  status: string;
  skipReason: string | null;
  /** The answer as it stands, which a Correction says it was shown. */
  evidence: (boolean | number | string)[];
  destination: MilkDestination | null;
  outOfRange: string | null;
  /** What the Step's Effect recorded beside its Evidence — the feed given, the store counted — as it was shown. */
  facts: FactsAsShown;
}

/** Where one animal stands in a round: recorded, skipped, or still to do. */
export type Standing = "done" | "skipped" | "left";

/** What changed, as the board is handed it. */
export interface Changed {
  from: number;
  to: number;
  changes: SopChange[];
}

/** What was typed into one set of number boxes, by Feed Item. */
export type Typed = Record<string, string>;

/** What has been entered against each Evidence slot the Version asks for. */
export type Entered = Record<number, boolean | number | string>;

/** A picture taken against an Evidence slot, before it is queued. */
export type Taken = Record<number, { contentType: "image/jpeg"; data: string }>;
