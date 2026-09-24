/** A4, the margins a deed is printed with, and a plain white page whatever theme the app is in. */
const PAGE_RULES = `@page { size: A4; margin: 16mm }
  html, body { margin: 0; background: #fff; color: #111 }
  body > * { max-width: none !important; border: 0 !important; padding: 0 !important; box-shadow: none !important }`;

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
 * Printing the page itself and hiding the rest cannot be trusted for a paper shown in a dialog: an open dialog locks
 * the page's scrolling, which cuts the print to one sheet, its overlay and the app behind it still take up the page,
 * and a dark theme prints dark. A frame has none of that — only the paper, on white, as long as it needs to be. The
 * frame shares the page's address, so the stylesheets and fonts it is given load from the same place.
 */
export const printAlone = async (element: HTMLElement): Promise<void> => {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')]
    .map((node) => node.outerHTML)
    .join("");
  frame.srcdoc = `<!doctype html><html lang="${document.documentElement.lang}"><head><meta charset="utf-8">${styles}<style>${PAGE_RULES}</style></head><body>${element.outerHTML}</body></html>`;
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
