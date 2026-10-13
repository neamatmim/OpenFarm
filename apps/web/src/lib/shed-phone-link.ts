import { latinDigitsOf } from "@OpenFarm/i18n";

/** Where in the link the code rides: after the #, which a browser never sends — no server log, no Referer holds it. */
const CODE_MARK = "#code=";

/** A Shed Phone's code as the box keeps it: the spaces and dashes the Manager paused at dropped, a Bangla keyboard's
 *  digits read as the code's own, in capitals. */
export const codeAsTyped = (typed: string): string =>
  latinDigitsOf(typed).replaceAll(/[\s-]/gu, "").toUpperCase();

/** The address a Shed Phone opens to be set up with this code: what the QR on the Manager's screen says. The code
 *  is short-lived and opens one phone once, but it still goes after the # rather than in the query, so the server
 *  that answers the page — and its journal — never sees it. */
export const shedPhoneLink = (origin: string, code: string): string =>
  `${origin}/shed-phone${CODE_MARK}${encodeURIComponent(code)}`;

/** The code a set-up link carried, from the page's own `location.hash`; nothing for a page opened any other way, or
 *  by a link cut short or garbled on its way — the code is then typed, as it always could be. */
export const codeInTheLink = (hash: string): string | null => {
  if (!hash.startsWith(CODE_MARK)) {
    return null;
  }
  let carried: string;
  try {
    carried = decodeURIComponent(hash.slice(CODE_MARK.length));
  } catch {
    return null;
  }
  const code = codeAsTyped(carried);
  return code === "" ? null : code;
};
