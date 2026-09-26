# 01 — Nominees on record, and the list in force

**What to build:** An Investor's nominee stops being three text fields on their record and becomes a **Nomination**: a list of up to three Nominees, each with a relation, a date of birth, a share and, for a minor, a Receiver. What exists now moves across as a Nomination "not yet signed for". Every paper and screen that shows the nominee today shows the **list in force** instead, as a table.

**Blocked by:** —

**Status:** done, merged (87b3871)

**Spec:** [the spec](../spec.md), user stories 1–6 and 17–20. See also "The record", "The rules, in the domain package", "The parties part", "Where the list in force shows" and "Moving what exists".

- [x] **Tables:** `nomination` (`how`: `nomination` | `agreement` | `carried_over`), `nominee` (up to three per Nomination, by `place`), and `nomination_paper` (the photo), as the spec lays them out.
- [x] **The migration** turns each `investor.nominee_*` into a `carried_over` Nomination with one Nominee at 100% and no date of birth, then drops the three columns. Apply it to both dev databases and move `LATEST_MIGRATION`.
- [x] **In `@OpenFarm/domain`:** `nomineesProblem(nominees, onDay)` returns each refusal code in the spec, and `isMinorOn(bornOn, day)` is true until the eighteenth birthday. Unit tests cover each code and the birthday itself.
- [x] **`nominationInForce(tx, farmId, investorId)`** reads the latest by `signed_on`, then `recorded_at`, then `id`. A test records two on one day in one transaction, and the later one wins.
- [x] **`investors.nominations({ id })`**, Owner-only, returns every Nomination newest first. A Manager gets FORBIDDEN.
- [x] **`investors.record` and `investors.update` lose `nominee`.** The Investor sheet loses its nominee fields. `RELATIONS` moves to a shared Nominees component, used read-only here and editable from 02.
- [x] **The Investor's page has a Nominees section:**
  - the list in force, with each Nominee's relation, date of birth, phone and share, «নাবালক» on a minor with their Receiver beneath, and "no Nominee" when empty;
  - "not yet signed for" on a `carried_over` list;
  - where the list came from;
  - the earlier Nominations below.
- [x] **Every paper with a parties part prints the Nominee table**: the Agreement to sign, the Amendment to sign, the Portal Consent sheet, and the Master Agreement and Venture Schedule previews.
  - `paperInvestor(row, nominees)`, with `PaperInvestor.nominees` in place of `nominee`.
  - The Version's `nomineeLines` print under it as today, and a Version worded before there were any prints none.
  - Parties stack one above the other when any has Nominees.
- [x] **The list in force also shows in:** (the Data Copy's change log takes the Nomination trail in 02, the first ticket that writes one)
  - the portal account page (`portal-reads.ts` `record.nominees`), and so the Portal Preview;
  - the যোগদানপত্র;
  - the Investors table: the first name, "+N" when there are more, or "not yet signed for";
  - the Data Copy: every Nomination with its Nominees, and the Nomination trail in its change log.
- [x] **Audit words** for a `nomination` entity.
- [x] **Old cached answers:** a cached Investor answer with `nominee` and no `nominees` reads as `[]`.
- [x] **The seed** writes each seeded Investor's nominee as a `carried_over` Nomination, and the page shows "not yet signed for" on each.
- [x] **Somebody opens it:**
  - an Investor's page, in both languages;
  - the portal account page at phone width, as a seeded Investor or through the Preview;
  - an Amendment to sign, by print preview.

## Checked before starting

- The three columns are read in `paper-values.ts` (`paperInvestor`), `investor-statement-store.ts` (`HimAndHisNominee`), `investor-store.ts` (`readInvestor`, the trail), `portal-reads.ts`, `data-copy.ts`, `routers/investors.ts` (input and list) and `seed/ventures.ts`.
- The web side reads them in `investor-sheet.tsx`, `investor-profile.tsx`, `investors-table.tsx`, `portal/pages/account.tsx`, `audit-words.ts`, `paper-document.tsx` and `investor-types.test.ts`.
- The parties part is drawn by `SectionBody` → `case "parties"` in `apps/web/src/components/ventures/paper-document.tsx`. `investorRows` / `nomineeLine` are in `packages/domain/src/paper-template.ts`.
- `grep -rn -i nominee packages apps` should find nothing reading `nomineeName` when this is done.

## What was decided while building

- **Where things live:**
  - The rules are `nomineesProblem` / `isMinorOn` in `packages/domain/src/nominees.ts`, with the paper's row as `nomineeRowOf` → `NomineeRow` and `NOMINEE_HEADINGS`.
  - The reads are in `packages/api/src/nomination-store.ts`: `nominationsOf`, `nominationInForce`, `nominationsInForceFor` and `paperNominees(nomination, onDay)`.
- **A paper judges a minor on its own day.** `PaperInvestor.nominees` is `PaperNominee[]`, a Nominee with `minor` already decided by whoever lays the paper out:
  - today, for the Agreement to sign, the Amendment and the consent sheet;
  - the statement's day, for the যোগদানপত্র;
  - the day signed, for each Nomination in the history and the Data Copy.
- **The parties part's table is `party.nominees: NomineeRow[]`.** The Farm's is always empty, and the Version's `nomineeLines` print under it as before. `<PaperDocument>` draws it with `NomineeTable`, and stacks the parties when any has Nominees.
- **`signed_on` is a farm-day string**, like `stamped_on`. The migration dates a carried-over Nomination at the day it runs, Asia/Dhaka, with the id `<investor id>-carried-over`.
- **`investors.list` carries `nomination`** (how, day, agreement, photo, Nominees marked a minor today), not a bare list, so the page can say where the list came from. `investors.nominations` marks each Nominee on the day it was signed.
- **The portal account's `record.nominees`** is the list in force, marked today. `theirRecord` is shared, so the Portal Preview shows the same.
- **Moved:** `phoneLink` to `components/investors/phone-link.tsx`, so the Nominees section and the profile don't import each other. `RELATIONS` / `relationWord` / `relationChoiceOf` went to `components/investors/relations.ts`, for 02's form.
- **Words:**
  - `investors.nomineeHint/Name/Phone/Relation` and `investors.relationInWords` are gone, because the unused-messages test refuses a key nothing reads. **02 adds `relationInWords` back** with the form.
  - `auditField.nominee*` stay, because old trail events still carry those fields.
  - `audit.entity.nomination` is added.
- **Tests put a Nomination on file** through `nominationOnFile` / `theWhole` (`packages/api/src/test/nominations.ts`), until 02's `recordNomination` exists.
- **Proven by switching off:** with the `id` tie-break flipped, "two signed the same day and recorded at the same moment" goes red.
- **Opened on the seed farm (`openfarm_seed`, migrated, 109):**
  - The Investors list shows each Nominee with «এখনো সই হয়নি».
  - আবুল হাশেম মিয়া's page, in Bangla and English, with a hand-inserted three-Nominee মনোনয়নপত্র (removed afterwards): the table, «নাবালক», "সংগ্রহ করবেন …" and the earlier carried-over list.
  - His portal account through "See as they do" at 390 px.
  - The Agreement to sign for রফিকুল ইসলাম in the paper dialog: the table under him, parties stacked, the old two lines beneath.
  - **The migration moved all five seeded nominees** to `carried_over` at 100%.
- **Not yet applied to the user's `OpenFarm` database.** The migration drops the three columns, so it waits for the user's word at merge.
