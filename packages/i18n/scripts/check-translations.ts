// Build-time gate: fails when any English key lacks a non-empty Bangla translation
// (or Bangla carries a key English doesn't). Run by the web build before bundling.
import { findTranslationGaps } from "../src/translate";

const { missing, stray } = findTranslationGaps("bn");
if (missing.length > 0 || stray.length > 0) {
  const lines = [
    ...missing.map((key) => `  missing Bangla translation: ${key}`),
    ...stray.map((key) => `  Bangla key not in English source: ${key}`),
  ];
  console.error(`Translation check failed:\n${lines.join("\n")}`);
  process.exit(1);
}
console.log("Translation check passed: Bangla covers every English key.");
