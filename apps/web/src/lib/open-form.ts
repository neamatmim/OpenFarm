/** What an open form does with a refusal: says it at its own top. */
type SayIt = (words: string) => void;

/** The kit's forms open now, the last opened on top: a dialog over a sheet is the one a refusal is about. */
const OPEN: SayIt[] = [];

/**
 * Marks a form open until the returned function is called. While it is, a refusal is said inside it, at its top, where
 * the person is looking, rather than in a toast beside it (GOV.UK, Carbon: an error stays with what it is about).
 */
export const holdOpenForm = (sayIt: SayIt): (() => void) => {
  OPEN.push(sayIt);
  return () => {
    const at = OPEN.lastIndexOf(sayIt);
    if (at !== -1) {
      OPEN.splice(at, 1);
    }
  };
};

/** Says a refusal in the form open on top, if one is; whether one was. */
export const sayInOpenForm = (words: string): boolean => {
  const top = OPEN.at(-1);
  if (!top) {
    return false;
  }
  top(words);
  return true;
};
