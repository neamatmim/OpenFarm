# 03 — What an Investor's animals are doing

**What to build:** The reading the progress paper is made of, as a procedure in its own right, because it is the question the Owner will also want on a screen and because none of it is answered anywhere today.

For one Venture, as of a day:

- **Head alive, and head died.** Two counts, because an Investor's first question is how many are still standing and his second is what happened to the rest.
- **Average weight then and now** — then being what they weighed at Intake, now being their latest **Weigh-in**.
- **Average Daily Gain**, worked out as the glossary has it: between Intake and the latest Weigh-in.
- **Days to the Target Window**, which is a count of days and not a prediction of anything.
- **Per Animal:** her tag, her Intake weight, her latest Weigh-in, her own Average Daily Gain, and her photo.

An Animal the Farm has never weighed since she arrived has no gain, and says so rather than reading as zero — zero gain and no reading are different facts and an Investor is owed the difference.

An Animal who was **internally sold** into this Venture belongs to it from the day she came, and one sold out of it leaves at the day she went, in the same "whose was she then" way every other Venture sum works. The paper is about the animals this Venture's money is standing behind on the day it is printed.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 6, user stories 76, 77, 81, 82; `CONTEXT.md` — **Weigh-in**, **Average Daily Gain**, **Target Window**, **Internal Sale**, **Venture**.

- [ ] One procedure answers head alive, head died, average weight at Intake and now, Average Daily Gain, and days to the Target Window for one Venture
- [ ] It lists each Animal with her tag, Intake weight, latest Weigh-in, her own Average Daily Gain and her photo
- [ ] An Animal never weighed since Intake reads as having no gain rather than as zero
- [ ] Whose an Animal was is asked of the day, not of today, so an Internal Sale does not move animals between Ventures' papers retrospectively
- [ ] No projected weight and no projected price anywhere in what it returns
- [ ] The Owner reads it; the Manager reads it too, since the roles matrix gives them a Venture's figures — but neither the Investors nor what they hold
- [ ] Tests cover a Venture with one animal dead and one never re-weighed, and one whose animal came in by Internal Sale partway

## Checked before starting

**Say Average Daily Gain in full.** `CONTEXT.md` lists "ADG on its own" under _Avoid_.

**Two averages, and neither is the average of the per-Animal averages.** Average weight then and average weight now are averages over the animals standing; a herd's Average Daily Gain worked out from those two is not the mean of each animal's own. Decide which the paper means and say so on the ticket's face — an Investor who adds up the per-Animal column and gets a different number from the summary line will write to the Farm about it.

**`ownedThenByOf` (`venture-store.ts:766`) is how "whose was she then" is asked** everywhere else, and the Settlement is worked out through it. Use it rather than reading `animal.ownerVentureId`, which is who owns her today.

**The weights and the gain already exist; the venture filter does not.** `fatteningOf(intake, weighIns, now)` (`fattening-store.ts`, over `packages/domain/src/fattening.ts`) is where Intake weight, latest weight and gain come from, and `fatteningRows(db, farmId, where, now)` (`ready-store.ts:20`) reads the Intake and the last twelve Weigh-ins for it. But its `where` is `{ penId?, states }` — **there is no venture filter and `ownerVentureId` is not even selected**, and its only caller `fattening.board` (`routers/fattening.ts:16`) takes a Pen. `stillHersOf(tx, farmId, ventureId)` (`venture-store.ts:713`) knows a Venture's standing animals but returns `{ id, tagNumber }` alone. So the work is a venture filter on that reader, or a sibling beside it, and a procedure over it — not new arithmetic.

**Animal photos already exist**, so nothing here has to invent them: `animalPhoto` (`packages/db/src/schema/herd.ts:219`) is the Animal's profile photo, one per Animal, "shown wherever an animal is picked", and `animal.photoUpdatedAt` (`:106`) is set when one exists so a client can bust its cache. What is _not_ guaranteed is that every Animal has one — nothing obliges a photo at Intake — so the row has to read properly without it, and the paper must not leave a hole where an Investor expects a face. Say what an Animal with no photo shows.
