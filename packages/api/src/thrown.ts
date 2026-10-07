/**
 * An error as the server's log may write it: what it was and where it was thrown, never what it was sent.
 *
 * drizzle words a failed query as its statement and then every value it was sent, in the message and so in the stack,
 * and keeps the values on the error besides; on an Investor's or a nominee's row they are a NID, a bank account and a
 * phone. Written whole, the error puts them in the journal of a server nobody wipes. So a log line keeps the error's
 * name, its words and its stack, each less the values — which statement failed is kept, which is what anybody reading
 * the log needs.
 */

/** A failed query's values, after its statement: to the end of the message, or the first line of a stack under it — a
 *  value typed with a line break in it runs on. */
const QUERY_VALUES = /\nparams: [\s\S]*?(?=\n\s+at |$)/u;

/** An error's words or its stack, less the values a failed query was sent. */
const withoutValues = (text: string | undefined) =>
  text?.replace(QUERY_VALUES, "\nparams: (not logged)");

/** What an unexpected error was and where it was thrown, less what it was sent; anything else thrown, by its kind. */
export const asLogged = (error: unknown): Record<string, unknown> =>
  error instanceof Error
    ? {
        name: error.name,
        message: withoutValues(error.message),
        stack: withoutValues(error.stack),
      }
    : { thrown: typeof error };

/** What went wrong and what lay under it, cause by cause, less what any failed query was sent: the turn's failure kept
 *  for the Owner as "permission denied for table …", not only the statement that met it. */
export const causesOf = (error: unknown): string => {
  const said: string[] = [];
  for (let at = error; at instanceof Error; at = at.cause) {
    said.push(withoutValues(at.message) ?? "");
  }
  return said.length > 0 ? said.join(" — because: ") : String(error);
};
