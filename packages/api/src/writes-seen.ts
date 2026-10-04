/**
 * How many audited writes this process has seen — every change to the farm's records goes through one. A figure worked
 * out from the whole history and kept between requests is good for as long as this has not moved.
 *
 * Moved when a write records its Audit Event, inside its transaction, and again once that transaction has committed: a
 * figure worked out while the write was open read the farm as it stood before it, and the second move retires it.
 */
let seen = 0;

export const writesSeen = (): number => seen;

export const aWriteWasSeen = (): void => {
  seen += 1;
};

/** A write's own transaction, the write seen again once it has committed — or failed, which costs a figure nothing. */
export const seenWhenDone = async <T>(transaction: Promise<T>): Promise<T> => {
  try {
    return await transaction;
  } finally {
    aWriteWasSeen();
  }
};
