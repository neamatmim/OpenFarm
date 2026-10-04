/** How full a Pen is against the head it was built for: how many stand in it, the room left and how many it is over. */
export interface Stocking {
  head: number;
  capacity: number;
  room: number;
  over: number;
}

/**
 * A Pen's stocking, once the Owner or the Manager has said how many it holds — with `coming` animals walked in on top,
 * for a move before it is made. Nothing until a capacity is set: a Pen of unknown size is never called full.
 */
export const stockingOf = (
  head: number,
  capacity: number | null,
  coming = 0
): Stocking | null => {
  if (capacity === null) {
    return null;
  }
  const standing = head + coming;
  return {
    head: standing,
    capacity,
    room: Math.max(capacity - standing, 0),
    over: Math.max(standing - capacity, 0),
  };
};
