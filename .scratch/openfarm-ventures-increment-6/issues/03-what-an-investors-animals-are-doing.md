# 03 — What an Investor's animals are doing

**What to build:** The reading the progress paper is made of, as a procedure in its own right, because it is the question the Owner will also want on a screen and because none of it is answered anywhere today.

For one Venture, as of the day it is asked:

- **Head alive, and head died.** Two counts, because an Investor's first question is how many are still standing and his second is what happened to the rest.
- **Average weight then and now** — then being what they weighed at Intake, now being their latest **Weigh-in**.
- **Average Daily Gain**, worked out as the glossary has it: between Intake and the latest Weigh-in.
- **Days to the Target Window**, which is a count of days and not a prediction of anything.
- **Per Animal:** her tag, her Intake weight, her latest Weigh-in, her own Average Daily Gain, and her photo.

An Animal the Farm has never weighed since she arrived has no gain, and says so rather than reading as zero — zero gain and no reading are different facts and an Investor is owed the difference.

An Animal who was **internally sold** into this Venture belongs to it from the day she came, and one sold out of it leaves at the day she went, in the same "whose was she then" way every other Venture sum works. The paper is about the animals this Venture's money is standing behind on the day it is printed.

**Blocked by:** None — can start immediately.

**Status:** done

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 6, user stories 76, 77, 81, 82; `CONTEXT.md` — **Weigh-in**, **Average Daily Gain**, **Target Window**, **Internal Sale**, **Venture**.

- [x] One procedure answers head alive, head died, average weight at Intake and now, Average Daily Gain, and days to the Target Window for one Venture
- [x] It lists each Animal with her tag, Intake weight, latest Weigh-in, her own Average Daily Gain and whether the Farm holds a photograph of her
- [x] An Animal never weighed since Intake reads as having no gain rather than as zero
- [x] Whose an Animal is, is read off `ownerVentureId`, which _is_ the answer for the day a paper is printed — and the reading says plainly that a historical one must go through `ownedThenByOf` instead
- [x] No projected weight and no projected price anywhere in what it returns
- [x] The Owner reads it; the Manager reads it too, since the roles matrix gives them a Venture's figures — but neither the Investors nor what they hold
- [x] Tests cover a Venture with one animal dead and one never re-weighed, and one whose animal came in by Internal Sale partway

## Checked before starting

**Say Average Daily Gain in full.** `CONTEXT.md` lists "ADG on its own" under _Avoid_.

**Two averages, and neither is the average of the per-Animal averages.** Average weight then and average weight now are averages over the animals standing; a herd's Average Daily Gain worked out from those two is not the mean of each animal's own. Decide which the paper means and say so on the ticket's face — an Investor who adds up the per-Animal column and gets a different number from the summary line will write to the Farm about it.

**`ownedThenByOf` (`venture-store.ts:766`) is how "whose was she then" is asked** everywhere else, and the Settlement is worked out through it. Use it rather than reading `animal.ownerVentureId`, which is who owns her today.

**The weights and the gain already exist; the venture filter does not.** `fatteningOf(intake, weighIns, now)` (`fattening-store.ts`, over `packages/domain/src/fattening.ts`) is where Intake weight, latest weight and gain come from, and `fatteningRows(db, farmId, where, now)` (`ready-store.ts:20`) reads the Intake and the last twelve Weigh-ins for it. But its `where` is `{ penId?, states }` — **there is no venture filter and `ownerVentureId` is not even selected**, and its only caller `fattening.board` (`routers/fattening.ts:16`) takes a Pen. `stillHersOf(tx, farmId, ventureId)` (`venture-store.ts:713`) knows a Venture's standing animals but returns `{ id, tagNumber }` alone. So the work is a venture filter on that reader, or a sibling beside it, and a procedure over it — not new arithmetic.

**Animal photos already exist**, so nothing here has to invent them: `animalPhoto` (`packages/db/src/schema/herd.ts:219`) is the Animal's profile photo, one per Animal, "shown wherever an animal is picked", and `animal.photoUpdatedAt` (`:106`) is set when one exists so a client can bust its cache. What is _not_ guaranteed is that every Animal has one — nothing obliges a photo at Intake — so the row has to read properly without it, and the paper must not leave a hole where an Investor expects a face. Say what an Animal with no photo shows.

## What was decided while building

**It reads today, not any day, and the ticket's "as of a day" is narrowed to say so.** A true as-of needs three things asked of a past date, not one: whose she was, what her latest reading was _then_, and whether she was standing _then_. The first is free — `ownedThenByOf` already takes a date — and the second is a filter. The third is not: `animal.state` is what she is now, and there is no state history to read a past day off. Half of a time machine is worse than none, because the ownership would move while the counts stood still. The progress paper is about the day it is printed, which is what the paper is for, and that is now the whole of what this answers.

**And so it reads `ownerVentureId`, not `ownedThenByOf`, which a review turned into a bug worth having found.** The first version was faithful to the criterion's letter and asked `ownedThenBy(id, now)` for every Animal. But `ownedThenByOf` has to load the whole farm to answer, which forced a read of the entire Fattening side with a limit over it — and that limit had no state filter and ordered by tag ascending, so on a farm a few years in it would silently have dropped the _newest_ tags, which are the standing herd. An Investor's counts and averages would simply have come out wrong, with no error and no signal.

Read for the day it is printed, `ownedThenBy(id, now)` and `animal.ownerVentureId` are the same answer — an Internal Sale sets both. So the reading now asks the Venture for its own animals, bounded by a Venture's herd rather than by the farm's history, in one query instead of two. `ownedThenByOf` remains the right and only tool for a **historical** sum, which is what it was built for and what the Settlement uses it for; using it for a question about today cost a whole-farm read and bought nothing.

**The herd's gain is not the mean of the per-Animal gains, and the shape says which it is.** `gainKgPerDay` is everything the standing herd has put on over everything it has spent on feed — "these bulls put on this much a day between them". The mean of the rates would let a beast who arrived last week count for as much as one here since January. An Investor who adds up the per-Animal column will land a little away from this, and the farm would rather he can reconcile the two than be handed the easier sum.

**A bull nobody has weighed contributes neither kilogrammes nor days** to that figure, rather than a zero. A zero would say he is not growing, which the farm does not know; leaving him out says only that he is not in the measurement. His own row reads `dailyGainKg: null`, which is the same fact said about him alone.

**He is out of both averages too, which a review had to point out.** `fatteningView` falls back to the arrival weight for an Animal nobody has weighed — so the first version quietly let a 200 kg arrival weight into "average weight **now**", flattening the very growth the two averages exist to show. Both are now over the standing animals that have actually been weighed, the same animals in each, and `weighedCount` says how many that is so nobody makes them of the wrong number.

**`fatteningView`'s projections are dropped on the way out.** The board is welcome to where a rate lands a bull at the window and whether that makes his target; a paper an Investor keeps is not. The reading returns `dailyGainKg` and `overDays` off the same `sinceIntake` basis and leaves `projectedKg`, `reachesTarget` and `onTrack` behind — and a test reads the whole payload as a string and fails on any of those words appearing.

**The photo is a yes or no, not the photograph.** `hasPhoto` comes off `animal.photoUpdatedAt`; the image itself is base64 in Postgres and `animals.photo` serves it one at a time. A sheet of twenty animals is a decision about payload size that belongs to whoever builds অগ্রগতি (ticket 04), and this reading gives them what they need to lay the page out either way.
