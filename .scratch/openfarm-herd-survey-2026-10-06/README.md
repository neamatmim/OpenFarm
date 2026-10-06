# Survey of the herd register, 2026-10-06

Three reviewers each took one part: animals coming in, animals leaving, and moves with the herd screens. Each finding is marked:

- **Proven:** a temporary test went red against main at e1662397, and the file was then deleted.
- **Traced:** read line by line through the code.

## A. Missing, Lost and Found

1. **Proven, high.** A Found and a write-off at the same moment can leave her Lost for good. `found` reads her open Missing without a lock, so a write-off committing in between is marked found without her coming back. A later Found is then refused: "That animal is not missing". Example: 7 of 12 raced animals ended Lost with their Missing marked found. `routers/animals.ts:1421-1435`, `missing-store.ts:206-215`.
2. **Proven, medium-high.** A pregnant cow written off and then found comes back with no Expected Calving date, so no dry-off or calving work is raised for her. `herd-store.ts:812-813,1047-1069`, `missing-store.ts:257-258`.
3. **Proven/Traced, low.** A Missing animal who then dies or is sold keeps an open Missing, so her page still says Missing. `found` accepts her though she has left. `routers/animals.ts:625,1406`.
4. **Traced, low.** The Found buttons say nothing when they are refused. `overview-tab.tsx:493,543`.

## B. The dates an animal comes and goes

1. **Proven, medium-high.** An Intake written up later puts her on the books, and starts her Pen history and Quarantine, from when it was typed rather than when she came. Calves get this right. `routers/intakes.ts:302-318`, `herd-store.ts:351,379,393`.
2. **Proven, medium.** A Sale dated before she arrived is accepted. `routers/sales.ts:168`, `herd-store.ts:788-830`.
3. **Proven, medium.** A death dated before she arrived is accepted, and a Mortality Correction can do the same. `routers/animals.ts:1079`, `corrections/mortality.ts:84`, `herd-store.ts:1011-1040`.
4. **Proven, high.** Correcting a calving's hour can move the calf's arrival after a later Move, so her Pen history says she stands where she does not. `herd-store.ts:995-1002`, `calving-store.ts:103-118`.
5. **Proven, medium.** A crossing to Fattening held on a phone is taken even when her State changed after it was made, which backdates her Fattening start before a pregnancy recorded since. `herd-store.ts:540-551,581,613-616`.
6. **Proven, low-medium.** A calf can be registered with a birth date in the future. `routers/animals.ts:122,436`.
7. **Traced, low-medium.** An Intake can be dated before its buying trip went, or before its Venture started buying. `routers/intakes.ts:242-247`.
8. **Proven, low.** A Move into the Pen she already stands in is accepted, which splits her Pen spell in two. `entries/move.ts`.

## C. Money and owners

1. **Proven, high.** Correcting an Intake after an Internal Sale books its money into her **current** owner's books, not the purse that paid for her. In one test it deleted a Venture's `intake_out` payment. In another, a Farm bull's Intake could no longer be corrected by anyone. `intake-store.ts:166,313-358`, `corrections/intake.ts:254-268`.
2. **Traced, medium.** Correcting an Intake's owner after an Internal Sale overwrites who owns her today. `corrections/intake.ts:233-243`.
3. **Proven, medium.** The server takes a Selling Trip carrying an animal who has already gone (dead, Lost, sold weeks before, dairy), and charges her a share of the trip. A trip's animals cannot be corrected. `routers/selling-trips.ts:172-183`, `cost-store.ts:459`.
4. **Traced, medium, needs the Owner.** A Sale's date cannot be corrected, and nothing undoes a Sale or a Mortality written against the wrong tag. `corrections/sale.ts:57-69`, `routers/sales.ts:320`.

## D. States and Tag Numbers

1. **Proven, medium.** Setting a Pregnant Heifer back to Heifer by hand leaves her Expected Calving date, and the calving work raised for it, open. `herd-store.ts:665-717`.
2. **Proven, medium.** Setting a Heifer to Pregnant Heifer by hand is accepted with no Expected Calving date, though registering one is refused. `routers/animals.ts:378-401,1307`.
3. **Proven, low.** The opening register cannot keep a farm-born bull's D- tag once he is on the Fattening side. CONTEXT.md says the prefix records where she came from. `herd-store.ts:104-111`.
4. **Traced, low.** Two registrations claiming the same written Tag Number at once give the loser a generic error, not `tag_taken`. `herd-store.ts:112-121`.

## E. Herd screens

1. **Proven, medium.** Move refusals reach a Bangla reader in English: "has left the farm", "moved since", "that pen is not yours", "no such pen". `entries/entry.ts:48-58`, `herd-store.ts:438-443,550`, `scope.ts:183`.
2. **Traced, medium.** A refused group move is a dead end: the toast says to see why on her page, which doesn't say, and the ticks are cleared. A request that fails on bad signal is counted as refused and dropped. `group-move.tsx:66-108`.
3. **Traced, medium.** The death and abortion time boxes are read on the phone's clock, not the farm's. `animal-acts.tsx:209,395`.
4. **Traced, medium.** Move is offered when there is no other Pen to move her to. `animal-types.ts:139-149`, `move-dialog.tsx:88-90`.
5. **Traced, medium.** The Moves table shows the arrival reason as a raw English word ("born", "intake", "registered"). `animal-histories.tsx:351-370`.
6. **Traced, low.** An animal who has left is still shown standing in her last Pen. `animal-profile.tsx:198`, `overview-tab.tsx:363`.

## Decisions (the Owner, 2026-10-06)

- Build all groups (D and E together).
- C4: the Owner may **void** a Sale or a death written against the wrong animal, with a reason. She comes back on the farm as she was, her sale money is reversed, and the trail keeps it. The right animal is then sold or recorded dead as normal. A Sale's date also becomes correctable.

## Status

| Group | Branch | Status |
| ----- | ------ | ------ |
| A     | fix/missing-found | Done (a Found marks the Missing only as it read it — written off or not — so a write-off in between refuses it; a written-off cow keeps her Expected Calving on the Missing, migration 20261006110034, and comes back with it and her calving work; leaving closes an open Missing; Found refuses an animal sold or dead (`she_is_gone`); her page's Found buttons say a refusal) |
| B     | fix/herd-dates | Done (an Intake on the books, its arrival Move and its State from when she came; not before the outing went — `arrived_before_the_trip`; no Sale or death before her last Move — `before_she_was_here`, the Mortality Correction too; no birth still to come; a calving not re-dated past a Move her calf made — `calf_moved_before_that`; a held crossing late after a State change; no Move into the Pen she stands in — `already_in_that_pen`. Six test fixtures that killed or sold an animal before it came were made real) |
| C     |        |        |
| D     |        |        |
| E     |        |        |
