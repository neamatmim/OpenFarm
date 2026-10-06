# Survey of Staff and SOP rounds, 2026-10-06

Three reviewers each took one area: scheduling and the life of a piece of work, the shed phone with its Outbox and Corrections, and the work screens. Each finding is marked:

- **Proven:** a temporary test went red, and the file was then put back.
- **Traced:** read line by line through the code.

## A. Scheduling

1. **Proven, high.** The Registration renewal is never raised when the renewed certificate expires in the same calendar year as the old one. The farm lapses with no reminder. `renewalCause` is keyed by expiry year, at `registration-store.ts:40-41`.
2. **Proven, medium.** Publishing a Version that moves a schedule time raises the day's work again, because `dueSlotsFor` ignores when the Version was published.
   - Example: milking moved from 05:00/16:00 to 05:30/16:30 at 10:00 leaves four milkings that day, and the 05:30 one is already overdue.
   - `instances-store.ts:159-226`.
3. **Proven, low.** Restoring a retired SOP raises work for things that happened while it was retired, already overdue. The glossary says it should start afresh. `the-day-turns.ts:172`, `sops.ts:868-913`.
4. **Traced, low.** Renewal work goes overdue during the certificate's last good day, because it is due at the start of the expiry day. `instances-store.ts:146`, `domain/farm.ts:19`.
5. **Traced, medium.** A retired SOP can still raise put-off work (a re-raised Release or arrival dose), because `raiseThePutOff` never checks `retiredAt`. Its due time is also not snapped to a farm day. `put-off-store.ts:55-109`.

## B. What a Step accepts

1. **Proven, medium.** Any skip reason is accepted, including one the Version never wrote. The animal counts as covered, and nothing the farm acts on fires. `entries/step-completion.ts:285-290`.
2. **Proven, medium.** Work about one animal accepts a per-animal Step recorded against another animal in the Pen, or against any animal at all for farm-wide work. A dose Step would write the Treatment and withdrawal on the wrong cow. `completion-store.ts:31-74`.
3. **Proven, medium-high.** A second, different feeding, store-count or medicine-count report for the same Step is "applied" and thrown away. `sameAnswer` ignores those fields, so no Needs Review is raised and the phone is told it was taken. `entries/step-completion.ts:216,301`.
4. **Traced, low.** On death-triggered work, a per-animal Step about her can never be recorded, and finishing treats it as done. `instances-store.ts:788-794`.

## C. The shed phone and the Outbox

1. **Traced, high.** A revoked or lost Shed Phone is stuck for good and still lets people PIN in:
   - its token is never cleared;
   - its status is dropped in `createContext`;
   - `switchUser` refusals read as "offline".

   Work recorded on it never reaches the farm, and re-enrolling wipes its Outbox. `shed-phone.tsx:214,261-265`, `context.ts:495-497`.

2. **Proven, medium-high.** A batch still being applied answers 409 to a retry, and the phone marks every entry rejected. The work was taken but shows as refused, and a re-entry duplicates it. `batch-store.ts:389`, `lib/outbox.ts:179-189,574`.
3. **Traced, medium.** On the PIN pad, wrong guesses never reach the server, so a lockout never starts. A PIN the server refuses (429/401/403) lets the person in as if offline. `shed-phone.tsx:249-265`.
4. **Proven, low-medium.** Locking a phone is undone by the same person's next keep-awake, which re-extends locked stints and revives old switch tokens. `device.ts:~176-186`.
5. **Proven, medium.** An entry refused for a sequence number already used is kept nowhere on the server. A personal account on two devices (each Outbox counts from 1) gets its second device's entries refused for that reason. `sync-store.ts:116,18`, `outbox.ts:271`.
6. **Traced, low-medium.** Work recorded more than 24 hours before an offline PIN is proved is rejected as "not yours". It is not kept for review, though the glossary allows days offline. `routers/sync.ts:22`.

## D. The work screens

1. **Proven, high.** Removing or reordering a choice in the SOP editor shifts every later choice's stored value. Deleting "গরম হয়েছে" gives the next label `heat`, so lame sightings would raise AI work. `lib/sop-draft.ts:399-405`.
2. **Traced, high.** Editing a weigh-in Step's unit, min or max drops its other Evidence, such as the condition score. `sop-steps.tsx:40-138`.
3. **Traced, high.** A Correction sheet starts blank, and a datetime slot starts at now. Correcting a calf's sex moves the calving time to now, and likewise a service time. `evidence-sheet.tsx:1025-1031`, `$instanceId.tsx:340-352`.
4. **Traced, medium.** A milk Correction switches the destination to the tank. `evidence-sheet.tsx:1039-1041`.
5. **Traced, medium.** The medicine count's Confirm is enabled with blank boxes, and a blank is sent as 0. `evidence-sheet.tsx:131-137,1252-1257`.
6. **Traced, medium.** The SOP editor's publish problems are English developer strings on a Bangla page. `domain/sop.ts:1071-1074`, `sop-editor.tsx:243-250`.
7. **Proven, low.** You can't type a trailing comma in the times, choices and skip-reasons boxes. `sop-when.tsx:381-386`, `sop-steps.tsx:85-95,324-335`.
8. **Proven, low.** The Bangla "pinned to someone else" badge starts with a hyphen. `work/index.tsx:61`.
9. **Traced, low.** The datetime Evidence field reads and writes the phone's clock, not the farm's. `evidence-sheet.tsx:743-752,892-898`.

## Status

| Group | Branch | Status |
| ----- | ------ | ------ |
| A     | fix/rounds-scheduling | Done (renewal keyed by the expiry day, none raised while one is open, due at the end of its last good day; a new Version calls off the old one's unstarted work still to come and raises nothing already late; `sop_definition.restored_at`, migration 20261006073911; put-off work not raised under a retired SOP — its due time left exact, as tested) |
| B     |        |        |
| C     |        |        |
| D     |        |        |
