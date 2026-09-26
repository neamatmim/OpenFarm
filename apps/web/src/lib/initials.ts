/**
 * Titles written before a name on the farm's books — honorifics, a pilgrim's, a profession's — which say what a person
 * is, not who: মোঃ আব্দুল করিম is আক, not মআ. Compared without the full stop, colon or visarga they are written with.
 */
const TITLES = new Set([
  "মো",
  "মোসা",
  "মোছা",
  "হাজী",
  "হাজি",
  "আলহাজ",
  "আলহাজ্ব",
  "ডা",
  "ডাক্তার",
  "ইঞ্জিনিয়ার",
  "প্রকৌশলী",
  "অধ্যাপক",
  "প্রফেসর",
  "অ্যাডভোকেট",
  "এডভোকেট",
  "মাওলানা",
  "md",
  "mohd",
  "mst",
  "mr",
  "mrs",
  "ms",
  "dr",
  "engr",
  "haji",
  "alhaj",
  "prof",
  "adv",
]);

/** How a word is written after a title's abbreviation: a full stop, a colon, or the visarga Bangla uses for one. */
const ABBREVIATION_MARK = /[.:ঃ]+$/u;

const isTitle = (word: string) =>
  TITLES.has(word.replace(ABBREVIATION_MARK, "").toLowerCase());

/**
 * The first letters of a person's first two names, which is how a shared phone tells whose session it is at a
 * glance, and whose record a page is. A title before the name is passed over, unless it is all there is.
 */
export const initialsOf = (name: string) => {
  const words = name.split(/\s+/u).filter(Boolean);
  const named = words.filter((word) => !isTitle(word));
  return (named.length > 0 ? named : words)
    .slice(0, 2)
    .map((word) => [...word][0])
    .join("")
    .toUpperCase();
};
