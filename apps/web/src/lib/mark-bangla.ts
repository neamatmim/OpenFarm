/** A letter of the Bengali script. */
const BANGLA_LETTER = /[ঀ-৿]/u;
/** Any letter, of any script. */
const LETTER = /\p{L}/gu;

/** Set on the elements this marked, so it takes back only its own marks. */
const MARKED = "data-marked-bangla";

/** The words an element holds itself, not those of the elements inside it. */
const ownWords = (element: Element) =>
  [...element.childNodes]
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? "")
    .join("");

/** Whether more than half of the letters are Bangla: a Bangla name with an English word beside it is still Bangla. */
export const mostlyBangla = (words: string): boolean => {
  const letters = words.match(LETTER) ?? [];
  const bangla = letters.filter((letter) => BANGLA_LETTER.test(letter));
  return bangla.length * 2 > letters.length;
};

/** Marks one element Bangla, unless its language is said already, or takes the mark back if its words have changed. */
const settle = (element: Element) => {
  if (element.hasAttribute(MARKED)) {
    if (!mostlyBangla(ownWords(element))) {
      element.removeAttribute("lang");
      element.removeAttribute(MARKED);
    }
    return;
  }
  // A language said by the page itself (the language button's word, a paper's line) is left as said.
  const said = element.closest("[lang]");
  if (said && said !== document.documentElement) {
    return;
  }
  if (mostlyBangla(ownWords(element))) {
    element.setAttribute("lang", "bn");
    element.setAttribute(MARKED, "");
  }
};

/** Every element under a node that holds Bangla words of its own. */
const settleUnder = (root: Node) => {
  if (root.nodeType === Node.TEXT_NODE) {
    if (root.parentElement) {
      settle(root.parentElement);
    }
    return;
  }
  if (!(root instanceof Element)) {
    return;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    if (text.parentElement && BANGLA_LETTER.test(text.textContent ?? "")) {
      settle(text.parentElement);
    }
  }
  for (const marked of root.querySelectorAll(`[${MARKED}]`)) {
    settle(marked);
  }
};

/**
 * While the page is in English, says which of its words are Bangla (WCAG 3.1.2): a feed, a ration or a breed the farm
 * named only in Bangla, a category with no English name. A screen reader then reads them in a Bangla voice, not as
 * English letters. They are written by many screens as plain strings, so they are found on the page rather than
 * marked at each; a change to the page is looked at once the frame is drawn. Returns what takes every mark back.
 */
export const markBanglaWhileEnglish = (): (() => void) => {
  settleUnder(document.body);
  const changed = new Set<Node>();
  let waiting = 0;
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      changed.add(record.target);
      for (const added of record.addedNodes) {
        changed.add(added);
      }
    }
    waiting ||= requestAnimationFrame(() => {
      waiting = 0;
      for (const node of changed) {
        settleUnder(node);
      }
      changed.clear();
    });
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  return () => {
    observer.disconnect();
    cancelAnimationFrame(waiting);
    for (const marked of document.querySelectorAll(`[${MARKED}]`)) {
      marked.removeAttribute("lang");
      marked.removeAttribute(MARKED);
    }
  };
};
