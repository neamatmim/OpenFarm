import type { RationRow, StockLine } from "@/components/feed/feed-types";

/** Empty, unused items are not an operational shortage; active rations and configured thresholds are. */
export const feedsInUse = (rations: RationRow[]): ReadonlySet<string> =>
  new Set(
    rations
      .filter((ration) => !ration.retiredAt && ration.penIds.length > 0)
      .flatMap((ration) => ration.items.map((line) => line.feedItemId))
  );

export const shortFeedLines = <
  T extends Pick<
    StockLine,
    "retiredAt" | "runningLow" | "onHand" | "feedItemId"
  >,
>(
  lines: T[],
  fed: ReadonlySet<string>
): T[] =>
  lines.filter(
    (line) =>
      !line.retiredAt &&
      (line.runningLow || (line.onHand <= 0 && fed.has(line.feedItemId)))
  );
