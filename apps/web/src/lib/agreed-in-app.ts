/**
 * Whether an Investment Agreement was agreed in the app rather than signed on stamp: there is no stamped paper to
 * photograph, the paper agreed to is kept with the offer, and it takes capital all the same. An answer cached before
 * the farm could agree in the app has no such kind, and reads stamped.
 */
export const agreedInApp = (one: { stamp?: { kind: string } | null }) =>
  one.stamp?.kind === "in_app";

/** Whether an Agreement's paper is on file as capital needs it: its stamped photo kept, or agreed in the app. */
export const paperOnFile = (one: {
  hasPaper: boolean;
  stamp?: { kind: string } | null;
}) => one.hasPaper || agreedInApp(one);
