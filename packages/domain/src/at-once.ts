/** As many animals as one act may be done for at once: a Pen, a shed at Eid — never the whole herd by a slip. The farm
 *  refuses more, and the screen stops at the same number so it never sends what the farm would refuse whole. */
export const MANY_AT_ONCE = 200;

/** Whether this many ticked are more than one act may be done for at once. */
export const tooManyAtOnce = (count: number): boolean => count > MANY_AT_ONCE;
