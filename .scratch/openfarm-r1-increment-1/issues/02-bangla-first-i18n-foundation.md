# 02 — Bangla-first i18n foundation

**What to build:** The app has a translation system where developers write English keys and the product is the Bangla file. The build fails if any string lacks a Bangla translation. Each user has a language setting (Bangla by default for Staff); the existing login and home pages render fully in Bangla. Bangla numeral and date-with-Bangla-month helpers exist and are used by every later screen.

**Blocked by:** 01 — Test harness & scratch database

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 1.

- [ ] A missing Bangla translation for any UI string fails `pnpm build` with the key named
- [ ] A user's language setting switches the whole UI; new users with the Staff Role default to Bangla
- [ ] Numbers display as Bangla numerals in the Bangla UI and as digits in English; stored values are always digits
- [ ] Dates display Gregorian with Bangla month names in the Bangla UI
- [ ] The existing login and home routes contain no untranslated string
- [ ] Tests cover the numeral/date helpers and the per-user language resolution
