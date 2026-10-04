import type { FileRouteTypes } from "@/routeTree.gen";

/** A page somebody can be sent to with nothing more than its address: none of its own to fill in. */
export type PlainPage = Exclude<FileRouteTypes["to"], `${string}$${string}`>;

/** Where a refusal is put right when that is on another page: the words for going there, and the page. */
export interface RefusalWay {
  label: string;
  to: PlainPage;
}

/** What an open form does with a refusal: says it at its own top, with the way to put it right where there is one. */
type SayIt = (words: string, way?: RefusalWay) => void;

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
export const sayInOpenForm = (words: string, way?: RefusalWay): boolean => {
  const top = OPEN.at(-1);
  if (!top) {
    return false;
  }
  top(words, way);
  return true;
};
