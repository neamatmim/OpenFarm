/** A failed query's values, after its statement: to the end of the words, or the first line of a stack under them. */
const QUERY_VALUES = /\nparams: [\s\S]*?(?=\n\s+at |$)/u;

/** Words with whatever a failed query was sent taken out: a password's hash, an email, a session's token. */
const withoutValues = (text: string): string =>
  text.replace(QUERY_VALUES, "\nparams: (not logged)");

/**
 * One thing Better Auth asks the server's log to write, as it may be written: an error by its name and its words, its
 * causes the same, less any values a failed query was sent; words less the same; anything else by its kind alone.
 * Better Auth writes a failed query whole — the account it was creating, its password's hash included.
 */
export const asLoggedByAuth = (said: unknown): unknown => {
  if (said instanceof Error) {
    const causes: string[] = [];
    for (let at: unknown = said.cause; at instanceof Error; at = at.cause) {
      causes.push(`${at.name}: ${withoutValues(at.message)}`);
    }
    return {
      name: said.name,
      message: withoutValues(said.message),
      ...(causes.length > 0 ? { causes } : {}),
    };
  }
  if (typeof said === "string") {
    return withoutValues(said);
  }
  return said === null || said === undefined ? said : { logged: typeof said };
};

/** Better Auth's log, written through {@link asLoggedByAuth}. */
export const authLogger = {
  log: (
    level: "debug" | "info" | "warn" | "error",
    message: string,
    ...args: unknown[]
  ): void => {
    // oxlint-disable-next-line no-console -- the server's log is the point
    console[level](
      `[Better Auth]: ${String(asLoggedByAuth(message))}`,
      ...args.map(asLoggedByAuth)
    );
  },
};
