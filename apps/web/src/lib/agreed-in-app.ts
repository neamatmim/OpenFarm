/**
 * Whether an Investment Agreement was agreed in the app rather than signed on stamp: there is no stamped paper to
 * photograph, and the paper agreed to is kept with the offer. An answer cached before the farm could agree in the app
 * has no such kind, and reads stamped.
 */
export const agreedInApp = (one: { stamp?: { kind: string } | null }) =>
  one.stamp?.kind === "in_app";

/**
 * Whether the farm says an Agreement's paper is on file as capital needs it — the farm's own answer, decided where
 * capital is refused, never worked out again here. An answer cached before the farm said so reads its photograph,
 * which was the whole of it then.
 */
export const paperOnFile = (one: {
  paperOnFile?: boolean;
  hasPaper: boolean;
}) => one.paperOnFile ?? one.hasPaper;
