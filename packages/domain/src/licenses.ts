import type { Language } from "@OpenFarm/i18n";

/** The kinds of **License** a farm in Bangladesh holds beside its DLS Registration: the trade license from the Union
 *  Parishad, the municipality or the city corporation; the Department of Environment's clearance; the Fire Service's
 *  license; and any other, which the farm names itself. Mirrors the column's list in @OpenFarm/db. */
export const LICENSE_KINDS = ["trade", "environment", "fire", "other"] as const;
export type LicenseKind = (typeof LICENSE_KINDS)[number];

/** What each kind the farm knows by name is called, in either language. An `other` is called what the farm wrote. */
export const LICENSE_KIND_SAID = {
  trade: { bn: "ট্রেড লাইসেন্স", en: "Trade license" },
  environment: { bn: "পরিবেশ ছাড়পত্র", en: "Environmental clearance" },
  fire: { bn: "ফায়ার লাইসেন্স", en: "Fire license" },
} as const satisfies Record<
  Exclude<LicenseKind, "other">,
  Record<Language, string>
>;

/** A License as a person reads it: its kind's name, or the name the farm wrote for an `other`. */
export const licenseNamed = (
  license: { kind: LicenseKind; name: string | null },
  language: Language
): string =>
  license.kind === "other"
    ? (license.name ?? "")
    : LICENSE_KIND_SAID[license.kind][language];
