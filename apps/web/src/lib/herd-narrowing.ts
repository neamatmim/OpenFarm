import type { LiveState, SIDES } from "@OpenFarm/domain";

import { tagMatches } from "./tag-search";

export type SideFilter = "" | (typeof SIDES)[number];
export const HOLDS = ["milk", "meat", "any"] as const;
export type HoldFilter = "" | (typeof HOLDS)[number];
/** Whether she has a photo yet: the tagging walk photographs every animal, and the Manager asks who is still owed one. */
export const PHOTO_FILTERS = ["none"] as const;
export type PhotoFilter = "" | (typeof PHOTO_FILTERS)[number];

/** What the herd is narrowed to, as the address keeps it. */
export interface HerdSearch {
  q?: string;
  side?: SideFilter;
  state?: LiveState;
  pen?: string;
  held?: HoldFilter;
  photo?: PhotoFilter;
}

/** What the filters read of one animal. */
export interface NarrowedRow {
  tagNumber: string;
  officialTag: string | null;
  side: string;
  state: string;
  penId: string | null;
  milkHeld: boolean;
  meatHeld: boolean;
  /** When her photo was last taken; none, never. */
  photoUpdatedAt: Date | string | null;
}

/** Whether she passes the hold asked for: milk held, meat held, or held at all. */
export const passesHold = (row: NarrowedRow, held: HoldFilter): boolean => {
  if (held === "milk") {
    return row.milkHeld;
  }
  if (held === "meat") {
    return row.meatHeld;
  }
  if (held === "any") {
    return row.milkHeld || row.meatHeld;
  }
  return true;
};

/** Whether she passes the photo asked for: none yet, or either. */
export const passesPhoto = (row: NarrowedRow, photo: PhotoFilter): boolean =>
  photo === "none" ? !row.photoUpdatedAt : true;

/** The rows the filters leave: a Tag Number or official tag as typed, then Side, State, Pen, hold and photo. */
export const narrowed = <Row extends NarrowedRow>(
  rows: Row[],
  search: HerdSearch,
  needle: string
): Row[] =>
  rows.filter(
    (row) =>
      (needle === "" ||
        tagMatches(row.tagNumber, needle) ||
        (row.officialTag ?? "").toUpperCase().includes(needle)) &&
      (!search.side || row.side === search.side) &&
      (!search.state || row.state === search.state) &&
      (!search.pen || row.penId === search.pen) &&
      passesHold(row, search.held ?? "") &&
      passesPhoto(row, search.photo ?? "")
  );
