/** The farm's gain settings' own defaults, said for a farm answer this phone cached before the farm had them. */
const UNTOLD = {
  gainReadDays: 28,
  deshiGainPercent: 70,
  femaleGainPercent: 80,
  penGainPercent: 80,
} as const;

/** One of the farm's gain settings. */
export type GainSetting = keyof typeof UNTOLD;

/** A gain setting as the farm has set it, or its default. One place, so every screen that reads one reads it alike. */
export const gainSettingOf = (
  farm: Record<string, unknown> | null | undefined,
  key: GainSetting
): number => {
  const value = farm?.[key];
  return typeof value === "number" ? value : UNTOLD[key];
};
