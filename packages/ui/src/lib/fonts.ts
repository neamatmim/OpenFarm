// The Bangla letters' font file, as the stylesheet loads it (`styles/globals.css`): the same file, so a page that
// asks for it early and the stylesheet that names it share one download.
import bengaliLetters from "../../node_modules/@fontsource-variable/noto-sans-bengali/files/noto-sans-bengali-bengali-wght-normal.woff2?url";

/** Where the built app serves the font for Bangla's own letters. */
export const BENGALI_LETTERS_FONT: string = bengaliLetters;
