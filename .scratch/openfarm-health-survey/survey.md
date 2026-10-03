# Whole-application review — 2026-10-03

Asked by the Owner: analyse the full application — features integrated, database design, code architecture.
Five read-only reviews (database, server architecture, feature integration, web architecture, dependencies and
domain purity); the top findings of each checked again by hand before anything was written down here.

## What is already right

- Packages depend one way only (domain ← db ← api ← web; i18n, ui, env leaves). No runtime import cycles in 336 files.
- The domain package is pure: every clock reading is passed in; the api reads time only through its injected clock.
- Money is exact everywhere (`numeric(12,2)`); idempotency lives in unique indexes; every write goes through the audited
  helper with its Audit Event in the same transaction (a test forbids anything else).
- ~400 procedures gated consistently by Role; tenancy scoped by `farmId` on every read checked.
- Every notice kind wired end to end; en/bn 4,386 keys each with no gaps; every web call resolves.

## A — Defects, fixed and merged (e61eb36b)

| #   | Defect                                                                               | Proof                                                           |
| --- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| A1  | Audit page threw on work called off as `released` / `excused` (words missing)        | test red, then green                                            |
| A2  | Owner page said "All fine" with a missing animal / store count / Baki waiting        | counts test                                                     |
| A3  | Farm sign-out kept the last person's cached answers and identity                     | one shared sign-out                                             |
| A4  | Feed stock read Feedings 6 h early on a +06 server (raw SQL timestamp as local time) | test red at +06, green at +06 and UTC                           |
| A5  | A Venture's Intake moved Venture money without the Farm lock                         | defensive; race not reproducible (tag lock hides intake↔intake) |
| A6  | takeCapital judged the Venture's state before the lock only                          | defensive                                                       |

## B — Server: one rule, one place

- **B1** Move the remaining ~12 hand-written Venture acts onto `actOnVenture`; delete the local copies of `ours` and
  `assertNotSettledUp` in `routers/ventures.ts`. (`reimburse`, `moveTo`'s Floor check read state outside the lock.)
- **B2** One Cattle Budget check — three copies today (`drawFloat`, `sellInternally`, `intake-store`).
- **B3** Split `routers/ventures.ts` (3,850 lines) into lifecycle / agreements / capital / trading / settlement / books;
  move `moveTo`'s rules and `whatItsAnimalsConsumed` into stores.
- **B4** The Shed Phone refusal has no refusal word and is written three times → `personal_phone_only`.
- **B5** Owner Venture reads that skip `requirePersonalSession` (`plan`, `planAgainstActual`, `projection`,
  `movableAnimals`, `returns.*`, `culling.list`) while `ventures.list` and the audit trail hide Venture money on a Shed
  Phone. Decide: add it, or write down why not.
- **B6** `farmCosts` loads the farm's whole history for one animal's figures (animal money tab, death notice,
  keep-or-sell). Bound it to her own days.
- **B7** `sellingTripAnimal.findMany({})` reads every farm's rows (`cost-store.ts:318`).

## C — Database hardening (migrations)

- **C1** Ledger tables cascade-delete from their parents (`venture_movement`, `investment_agreement`, settlement,
  health/weight records from `animal`) though farm records are never removed → RESTRICT, except the cascades a comment
  says are meant.
- **C2** No CHECK constraints anywhere: day/month text formats (unique indexes on `for_month` depend on them), amounts
  > 0, `floor ≤ target`, percents 0–100, enums `IN (...)`.
- **C3** 243 `timestamp` columns without time zone; 26 `DEFAULT now()` store the database session's wall clock. Either
  migrate to `timestamptz`, or pin `TZ=UTC` in the systemd unit, Postgres and tests. (A4 removed the one raw read.)
- **C4** The feed ledger's lines are untyped jsonb with no FK to `feed_item`; one bad line breaks every stock read →
  `feeding_line` table; FKs on `feeding.instance_id` / `completion_id`.
- **C5** Counterparty is check-then-insert on a case-sensitive key: two phones naming a new seller at once fail one
  Intake; "Karim Traders" and "karim traders" split a buyer's Baki → upsert + unique on `lower(name)`.
- **C6** Venture ledger links with no FK or unique: `refunds_id`, settlement `*_id` → `venture_movement`, one
  `intake_out` per Intake, `(internal_sale_id, kind)`.
- **C7** `current_version_id` pointers (SOP, Ration, Template) unconstrained → composite FK, deferrable.
- **C8** Redundant indexes (3); unindexed FKs on read paths (5) — harmless at 500 head.
- Deferred until a second farm: composite `(farm_id, id)` FKs for tenancy in the schema.

## D — Twins and constants (two places that must agree)

- **D1** 16 lists of allowed values written in both domain and db with no test tying them (ROLES, PAYMENT_METHODS,
  BAKI_KINDS, DISPOSALS, …) → db imports them from domain, or extend `kind-lists.test.ts` to all 24.
- **D2** Weaning age 90 days written three times; the calf-loss and death reports ignore the farm's own playbook.
- **D3** Limits copied across client and server: outbox `BATCH_MAX`, auto-lock 5 min (×4), PIN length, photo size.
- **D4** The browser bundle ships drizzle and 42 table definitions (≈67 KB) through two imports: device header names
  (`@OpenFarm/api/device`) and `ROLES` (`@OpenFarm/api/roles`).
- **D5** Monthly money totals summed on the phone from a list capped at 500, in three places, one with no warning →
  server totals.
- **D6** "Out of range" decided on the phone and stored as English text; the server never checks it.
- **D7** Client permission matrices (`powersOf`, `movesBetweenPurses`, `useHeldByOther`) copy server rules → server
  sends `mayX`, as `paperOnFile` now does.
- **D8** Sign sheet: `ready` and `stillMissing` spelled separately; Units left worked out in three places.

## E — Half-wired features

- **E1** Five Corrections with an API and tests but no screen: Baki payment, Baki write-off, abortion, buying trip,
  selling trip.
- **E2** Audit trail shows raw names for 29 record kinds (`investment_agreement`, `venture_movement`, `baki`, …) and two
  fields, in English on a Bangla screen.
- **E3** ~15 notices that ask somebody to act lead nowhere (money awaiting approval, SOP proposed, entry rejected,
  backup overdue, low stock, …).
- **E4** Shed Phone per-person cache shelves skip the cache-shape versioning; a deploy then a PIN switch hydrates old
  shapes.
- **E5** `translate` throws on a missing key (A1's root): any key built by hand can take a whole page down → fall back.

## F — Clean-up

`privateData` (starter leftover, twice marked for deletion), `serverTime` (unused), `/prototype/investor-statement`
still shipping, test-only reads (`sops.version`, `farm.certificates`, `ventures.termsOn`, `ventures.floatOf`, …),
15 doc comments above the wrong declaration (+ a lint script for `*/` followed by `/**`), Owner queue counts capped at
50 unsaid, a raw `error.message` from the opening-register import, `work/$instanceId.tsx` at 2,343 lines.

## Progress — 2026-10-03, the Owner chose E, D, B, C

- **E — done** (6e63ee77): E1 five correction screens; E2 38 record kinds + 2 fields named, with a test; E3 thirteen
  notices lead somewhere; E4 Shed Phone shelves stamped with the cache shape; E5 translate falls back. Not done: E6.
- **D — done** (38216608): D1 17 list pairs tied in order; D2 one weaning age; D3 limits in the domain; D4 no server
  module in the browser, guarded by a test; D5 money totals from the farm; D6 range judged by the farm; D7 the Internal
  Sale rule shared (useHeldByOther and powersOf's other rules left); D8 sign sheet ready = nothing missing. Units left
  still worked out on the client.
- **B — done** (7b94f5f2): B2 one Cattle Budget check; B3 the router in six parts; B4 personal_phone_only; B5 own
  phone for the Owner's money reads; B7 scoped read; moveTo and reimburse asked behind the lock. Not done: moving the
  other ~10 hand-written acts onto actOnVenture (their checks are already behind the lock); B6 farmCosts bounded.
- **C — part** (this branch): C1 83 ledger FKs NO ACTION instead of CASCADE; C2 20 CHECKs, NOT VALID — run
  `ALTER TABLE … VALIDATE CONSTRAINT …` once the farm's data is known to hold them (dev and seed do); C3 every
  connection at UTC and TZ=UTC in the unit (the full timestamptz migration left for a planned deploy); C5 traders found
  whatever the case, and written once when two phones name one; C8 three redundant indexes dropped, five added. Not
  done, for a planned deploy: C4 feeding_line, C6 ledger self-FKs, C7 version-pointer FKs, the timestamptz migration.
- **F — done** (818f9a66): privateData and serverTime gone; the prototype route gone; 46 stacked doc comments fixed and
  guarded by a test; the import's raw database message hidden; money awaiting counted on the farm; the work page in
  five files. Not done: the test-only reads were kept (they are tested surface; nothing shows them yet).
- **Follow-ups — done** (this branch): Units left from the farm; work held from somebody is one domain rule. Left on
  purpose: the other Venture acts already ask state behind the lock, so moving them onto actOnVenture is style only;
  powersOf stays a screen's role table (the server gates every act); farmCosts bounded per animal needs the cost model
  reworked; E6 (an old SOP Version's screen) waits for somebody to ask for it.
