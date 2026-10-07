/** A name the farm keeps in Bangla, and in English where it gave one: a Feed Item's, a Ration's, a medicine's. */
export interface Named {
  nameBn: string;
  nameEn?: string | null;
}

/** The name in the reader's language, and the name in the other language where the farm gave one. */
export const namesIn = (
  named: Named,
  language: string
): { shown: string; other: string | null } => {
  const shown = language === "en" && named.nameEn ? named.nameEn : named.nameBn;
  const other = language === "en" ? named.nameBn : named.nameEn;
  return { shown, other: other && other !== shown ? other : null };
};

/** Words the farm wrote in Bangla, and in English where it gave them — a Step, its question, a choice — in the
 *  reader's language. */
export const saidIn = (
  words: { bn: string; en?: string | null },
  language: string
): string => (language === "en" && words.en ? words.en : words.bn);
