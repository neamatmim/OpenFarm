import type { Keeping } from "@OpenFarm/domain";
import { KEEPING } from "@OpenFarm/domain";

import type { Standing } from "@/components/fattening/fattening-types";

/**
 * What the fattening board may be filtered by, kept apart from the board: the route reads them to check its address
 * before the board is drawn, and from the board's module they brought the whole board into the first download.
 */

/** Where the animals stand against their Expected Gain, as the board is filtered by it. */
export type StandingFilter = "all" | Standing;

export const STANDING_FILTERS: readonly StandingFilter[] = [
  "all",
  "behind",
  "unknown",
  "onTrack",
];

/** Whether keeping them pays, as the Owner filters the board by it. */
export type KeepingFilter = "all" | Keeping;

export const KEEPING_FILTERS: readonly KeepingFilter[] = ["all", ...KEEPING];
