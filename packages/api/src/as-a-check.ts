import type { Database } from "@OpenFarm/db";

import type { Context } from "./context";

/** Thrown out of a check's own transaction with what the work came to, so that nothing it wrote is kept. */
class CheckedOnlyError<T> extends Error {
  readonly result: T;

  constructor(result: T) {
    super("checked only");
    this.name = "CheckedOnlyError";
    this.result = result;
  }
}

/**
 * Runs some work exactly as it would go — every audited write, every refusal, every number taken — on a transaction
 * that is then thrown away: what it would come to, with nothing kept. Each audited write inside opens a savepoint on it,
 * so a write refused part-way is undone on its own, as it would be for real.
 */
export const asACheck = async <C extends Context, T>(
  context: C,
  work: (checking: C) => Promise<T>
): Promise<T> => {
  try {
    await context.db.transaction(async (tx) => {
      throw new CheckedOnlyError(
        await work({ ...context, db: tx as unknown as Database })
      );
    });
  } catch (error) {
    if (error instanceof CheckedOnlyError) {
      return error.result as T;
    }
    throw error;
  }
  throw new Error("a check's transaction was kept");
};
