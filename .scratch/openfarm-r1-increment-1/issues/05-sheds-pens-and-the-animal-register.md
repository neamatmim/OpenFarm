# 05 — Sheds, Pens and the Animal register

**What to build:** The Manager sets up Sheds containing Pens and registers Animals with only Tag Number (assigned by the system), sex, Side, Pen and source; breed, estimated age and a profile photo can be added later. Tag Numbers are `D-0001…` for Dairy-born and `F-0001…` for Fattening intake, sequential per prefix, never reused, unchanged when an Animal changes Side. An Official Tag is an attribute. A lost tag is replaced with the same number as a recorded Re-tag. Moving an Animal between Pens or Sides is a recorded Move — the only way its location changes. The lifecycle State machine lives in a shared domain package used by server and client. The opening register imports from CSV with old marks kept as aliases. Staff see the animals in their assigned Pens with photos and can look up any animal by Tag Number.

**Blocked by:** 04

**Status:** done (2026-09-11)

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 1.

- [x] Sheds and Pens can be created and renamed; every Animal is in exactly one Pen at all times
- [x] Registering an Animal with the five mandatory fields assigns the next Tag Number for its Side prefix; numbers are never reused, even after an exit
- [x] Photo upload sets the profile photo; it appears wherever the animal is picked
- [x] Re-tag records the event and keeps the Tag Number; Official Tag is stored but never used as identity
- [x] Move changes Pen (and Side when crossing) and records the Move; an Animal changing Side keeps its Tag Number
- [x] The State machine from the spec is enforced: illegal transitions are refused with a named error; legal ones are recorded
- [x] CSV import creates Animals with aliases and reports rows it could not import
- [x] Staff scoping: a Staff client lists only its assigned Pens' animals but can fetch any single animal by Tag Number read-only
- [x] Tests cover numbering, Re-tag, Move, State transitions (including the scenarios in the lifecycle ticket), import and scoping

**Done note:** New `@OpenFarm/domain` package holds the lifecycle State machine (`SIDES`, `STATES`, `allowedNextStates`, `canTransition`, `stateAfterSideChange`, `sideOfState`) and the Tag Number format, used by both server and client. Schema: `shed`, `pen`, `tag_sequence`, `animal`, `animal_move`, `retag`, `animal_photo`, plus the real FK from `pen_assignment.pen_id` to `pen.id`; `pen_assignment` moved into `herd.ts` to break a schema import cycle. Tag Numbers come from a row-locked `tag_sequence` inside the caller's transaction, so numbers are never reused and two concurrent registrations cannot collide. Routers: `herd.list/createShed/renameShed/createPen/renamePen`, `animals.list/byTag/register/move/changeSide/setState/retag/setPhoto/photo/importRegister` — all writes through `audited()`.

Two decisions worth naming: (1) a plain **Move changes the Pen only**; crossing Sides is the explicit `changeSide`, because inferring a Pen's Side from whichever animal happens to be in it is fragile — giving Pens their own Side is the better long-term model and belongs with rations in increment 2. (2) **Registering a new arrival and importing the opening register are different**: `register` accepts only `ENTRY_STATES` (calf, heifer, pregnant heifer, quarantine) while `importRegister` accepts any `LIVE_STATES`, because the opening register records a herd that already has milking cows. Each import row is its own audited transaction, so one bad row cannot undo the good ones; failures are reported with line number and reason.

Also fixed while here: **two copies of drizzle-orm** were installed (better-auth's adapter peers 0.45.2 while our schema is on 1.0.0-rc.4) and drizzle-kit resolved the stale hoisted one, breaking migration generation. Pinned workspace-wide via a pnpm override — the adapter introspects the same tables our schema defines, so one version is correct regardless.

**Review outcomes folded in:** `loadLiveAnimal` now actually refuses an exited Animal (it only checked existence, so re-tag and photo could still mutate a sold cow); Staff pen-scoping extended from `move` to `retag` and `setPhoto`; every animal-scoped audit event is keyed on the Animal's **id** (some used the tag number, which split an animal's history in two and hid the `create` event from `latestEventFor`, the lookup a Correction uses); the re-tag audit snapshot is read from the row instead of asserting `officialTag: null` when it wasn't being changed; the `pen_assignment` foreign key clears placeholder rows first so the migration cannot abort on a deployed database; the CSV reader carries source line numbers (a blank line used to shift every reported line) and treats a quote after spaces as opening a field; exit states come from `EXIT_STATES`; the import cap is 600 rows, matching a 100–500 head register in one request.

**One defect the review's ordering finding led to:** `uuidv7` filled `rand_a` with randomness, so ids minted in the same millisecond sorted arbitrarily — which is exactly what the audit trail orders by, and what `latestEventFor` reads. It now holds a monotonic counter there (RFC 9562 §6.2), with tests. Refuted: the animal-photo cache finding — `invalidateQueries` marks a query invalidated regardless of `staleTime`, and the detail page invalidates the whole `animals` prefix, so the list does pick up a replaced photo; a comment records why.
