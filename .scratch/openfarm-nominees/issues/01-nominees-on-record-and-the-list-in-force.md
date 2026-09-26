# 01 — Nominees on record, and the list in force

**What to build:** An Investor's nominee stops being three text fields on their record and becomes a **Nomination**: a list of up to three Nominees, each with a relation, a date of birth, a share and, for a minor, a Receiver. What exists now moves across as a Nomination "not yet signed for". Every paper and screen that shows the nominee today shows the **list in force** instead, as a table.

**Blocked by:** —

**Status:** ready for an agent

**Spec:** [the spec](../spec.md), user stories 1–6 and 17–20. See also "The record", "The rules, in the domain package", "The parties part", "Where the list in force shows" and "Moving what exists".

- [ ] **Tables:** `nomination` (`how`: `nomination` | `agreement` | `carried_over`), `nominee` (up to three per Nomination, by `place`), and `nomination_paper` (the photo), as the spec lays them out.
- [ ] **The migration** turns each `investor.nominee_*` into a `carried_over` Nomination with one Nominee at 100% and no date of birth, then drops the three columns. Apply it to both dev databases and move `LATEST_MIGRATION`.
- [ ] **In `@OpenFarm/domain`:** `nomineesProblem(nominees, onDay)` returns each refusal code in the spec, and `isMinorOn(bornOn, day)` is true until the eighteenth birthday. Unit tests cover each code and the birthday itself.
- [ ] **`nominationInForce(tx, farmId, investorId)`** reads the latest by `signed_on`, then `recorded_at`, then `id`. A test records two on one day in one transaction, and the later one wins.
- [ ] **`investors.nominations({ id })`**, Owner-only, returns every Nomination newest first. A Manager gets FORBIDDEN.
- [ ] **`investors.record` and `investors.update` lose `nominee`.** The Investor sheet loses its nominee fields. `RELATIONS` moves to a shared Nominees component, used read-only here and editable from 02.
- [ ] **The Investor's page has a Nominees section:**
  - the list in force, with each Nominee's relation, date of birth, phone and share, «নাবালক» on a minor with their Receiver beneath, and "no Nominee" when empty;
  - "not yet signed for" on a `carried_over` list;
  - where the list came from;
  - the earlier Nominations below.
- [ ] **Every paper with a parties part prints the Nominee table**: the Agreement to sign, the Amendment to sign, the Portal Consent sheet, and the Master Agreement and Venture Schedule previews.
  - `paperInvestor(row, nominees)`, with `PaperInvestor.nominees` in place of `nominee`.
  - The Version's `nomineeLines` print under it as today, and a Version worded before there were any prints none.
  - Parties stack one above the other when any has Nominees.
- [ ] **The list in force also shows in:**
  - the portal account page (`portal-reads.ts` `record.nominees`), and so the Portal Preview;
  - the যোগদানপত্র;
  - the Investors table: the first name, "+N" when there are more, or "not yet signed for";
  - the Data Copy: every Nomination with its Nominees, and the Nomination trail in its change log.
- [ ] **Audit words** for a `nomination` entity.
- [ ] **Old cached answers:** a cached Investor answer with `nominee` and no `nominees` reads as `[]`.
- [ ] **The seed** writes each seeded Investor's nominee as a `carried_over` Nomination, and the page shows "not yet signed for" on each.
- [ ] **Somebody opens it:**
  - an Investor's page, in both languages;
  - the portal account page at phone width, as a seeded Investor or through the Preview;
  - an Amendment to sign, by print preview.

## Checked before starting

- The three columns are read in `paper-values.ts` (`paperInvestor`), `investor-statement-store.ts` (`HimAndHisNominee`), `investor-store.ts` (`readInvestor`, the trail), `portal-reads.ts`, `data-copy.ts`, `routers/investors.ts` (input and list) and `seed/ventures.ts`.
- The web side reads them in `investor-sheet.tsx`, `investor-profile.tsx`, `investors-table.tsx`, `portal/pages/account.tsx`, `audit-words.ts`, `paper-document.tsx` and `investor-types.test.ts`.
- The parties part is drawn by `SectionBody` → `case "parties"` in `apps/web/src/components/ventures/paper-document.tsx`. `investorRows` / `nomineeLine` are in `packages/domain/src/paper-template.ts`.
- `grep -rn -i nominee packages apps` should find nothing reading `nomineeName` when this is done.
