import type { DateStyle } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";

import { NONE } from "./monthly-report-paper";
import { daySaid } from "./nominees";
import type { Said } from "./papers";

// The small words every laid-out paper says the same way, each in both languages with its own numerals: once here, so
// two papers never come to say a day, a figure or a total differently.

/** Who produced a copy of a paper, and when: on every one, so two copies can be told apart. */
export interface Produced {
  producedAt: Said;
  producedBy: string;
}

/** A farm day in each language, or the dash where there is none. */
export const dayOrNone = (day: string | null): Said =>
  day ? daySaid(day) : NONE;

/** A figure in each language's numerals. */
export const numberSaid = (value: number): Said => ({
  bn: formatNumber(value, "bn"),
  en: formatNumber(value, "en"),
});

/** A moment in each language, as a date style says it: its day, its time, or both. */
export const momentSaid = (at: Date, style: DateStyle): Said => ({
  bn: formatDate(at, "bn", style),
  en: formatDate(at, "en", style),
});

/** The line that adds a table up. */
export const TOTAL: Said = { bn: "মোট", en: "Total" };
