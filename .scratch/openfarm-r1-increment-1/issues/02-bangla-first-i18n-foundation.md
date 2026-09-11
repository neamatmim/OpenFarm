# 02 — Bangla-first i18n foundation

**What to build:** The app has a translation system where developers write English keys and the product is the Bangla file. The build fails if any string lacks a Bangla translation. Each user has a language setting (Bangla by default for Staff); the existing login and home pages render fully in Bangla. Bangla numeral and date-with-Bangla-month helpers exist and are used by every later screen.

**Blocked by:** 01 — Test harness & scratch database

**Status:** done (2026-09-10)

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 1.

- [x] A missing Bangla translation for any UI string fails `pnpm build` with the key named
- [x] A user's language setting switches the whole UI; new users with the Staff Role default to Bangla
- [x] Numbers display as Bangla numerals in the Bangla UI and as digits in English; stored values are always digits
- [x] Dates display Gregorian with Bangla month names in the Bangla UI
- [x] The existing login and home routes contain no untranslated string
- [x] Tests cover the numeral/date helpers and the per-user language resolution

**Done note:** `@OpenFarm/i18n` (English source, Bangla file typed to cover every key, `translate`, `formatNumber`/`formatDigits`/`formatDate` on ICU `bn-BD`, `resolveLanguage`); `pnpm build` runs the translation check first and fails naming the key; `language` column on the user typed through Better Auth `additionalFields`, with a `language.get`/`set` router reached via a `db` now carried on the API `Context`; React `LanguageProvider` (signed-in setting → remembered device choice via `useSyncExternalStore` → farm default), header toggle, `<html lang>`; every existing screen translated; a source-scan test fails on untranslated JSX text. Deviation: "new users with the Staff Role default to Bangla" is satisfied by Bangla being the default for _every_ new user (Roles arrive in 03). Known limit of the guard: it catches JSX text, not string literals inside `{}` expressions — the type-checked `t()` covers those by convention. Drizzle operators are re-exported from `@OpenFarm/db/operators` because pnpm 12 kept producing a dangling peer-less `drizzle-orm` link for the api package.
