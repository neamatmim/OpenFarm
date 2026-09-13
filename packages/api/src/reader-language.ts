import type { Database } from "@OpenFarm/db";
import type { Language } from "@OpenFarm/i18n";
import { resolveLanguage } from "@OpenFarm/i18n";

/** The language of whoever is producing a paper, Bangla when they have never said. */
export const languageOf = async (
  db: Pick<Database, "query">,
  userId: string
): Promise<Language> => {
  const row = await db.query.user.findFirst({
    where: { id: userId },
    columns: { language: true },
  });
  return resolveLanguage(row);
};
