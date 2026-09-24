/** How a paper is set on the page: its margin, and the size of its type where it wants its own. */
export interface PageSetup {
  margin?: string;
  fontSize?: string;
}

/** A4 at the paper's margin, a plain white page whatever theme the app is in, and nothing that is only for the
 *  screen. */
const pageRules = ({ margin = "16mm", fontSize }: PageSetup) =>
  `@page { size: A4; margin: ${margin} }
  html, body { margin: 0; background: #fff; color: #111 }
  ${fontSize ? `body { font-size: ${fontSize} }` : ""}
  body > * { max-width: none !important; border: 0 !important; padding: 0 !important; box-shadow: none !important }
  .no-print { display: none !important }`;

/** How long the frame waits for a browser that never says its print dialog closed. */
const PRINT_GRACE_MS = 60_000;

/** Waits for a stylesheet the frame was given to arrive, or to fail: either way it is as ready as it will be. */
const loaded = (sheet: HTMLLinkElement) =>
  sheet.sheet
    ? Promise.resolve()
    : // oxlint-disable-next-line promise/avoid-new -- a stylesheet's load is an event, with no promise of its own
      new Promise<void>((resolve) => {
        sheet.addEventListener("load", () => resolve(), { once: true });
        sheet.addEventListener("error", () => resolve(), { once: true });
      });

/**
 * Prints one element alone: copied into a hidden frame of its own, with the app's styles and nothing else, and
 * printed from there.
 *
 * Every paper the farm prints goes this way. Printing the page itself and hiding the rest cannot be trusted: an open
 * dialog locks the page's scrolling, which cuts the print to one sheet, its overlay and the app behind it still take
 * up the page, and a dark theme prints its pale ink onto white paper. A frame has none of that — only the paper, on
 * white, as long as it needs to be. The frame shares the page's address, so the stylesheets and fonts it is given
 * load from the same place.
 */
export const printAlone = async (
  element: HTMLElement,
  setup: PageSetup = {}
): Promise<void> => {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')]
    .map((node) => node.outerHTML)
    .join("");
  frame.srcdoc = `<!doctype html><html lang="${document.documentElement.lang}"><head><meta charset="utf-8">${styles}<style>${pageRules(setup)}</style></head><body>${element.outerHTML}</body></html>`;
  // oxlint-disable-next-line promise/avoid-new -- a frame's load is an event, with no promise of its own
  const ready = new Promise<void>((resolve) => {
    frame.addEventListener("load", () => resolve(), { once: true });
  });
  document.body.append(frame);
  await ready;
  const inside = frame.contentDocument;
  const view = frame.contentWindow;
  if (!(inside && view)) {
    frame.remove();
    return;
  }
  await Promise.all(
    [...inside.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map(
      loaded
    )
  );
  await inside.fonts.ready;
  // Gone once the print dialog is closed — some browsers return from print() at once and some only after, so it is
  // the frame's own afterprint that says when, with a minute's grace for one that never says.
  const gone = () => frame.remove();
  view.addEventListener("afterprint", gone, { once: true });
  setTimeout(gone, PRINT_GRACE_MS);
  view.focus();
  view.print();
};
