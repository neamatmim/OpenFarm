# What a run of the Farm's own cattle is

Status: done

Assignee: Neamat Khan Mim

Type: grilling

Blocked by: —

Map: [OpenFarm: what the money in cattle returns](../map.md)

## Question

A **Venture** is a run: its money comes in, buys cattle, and is settled. The Farm's own fattening cattle have no such edge: they arrive by **Intake**, by birth, from Dairy and by **Internal Sale**, all year round. To judge one run against another, decide what a run of the Farm's own is:

- **The grouping.** Is it the animals sold for one Eid-ul-Adha (their **Target Window**), one **Buying Trip**'s animals, those taken in during one month or season, those sold in one year, or something else the Owner already thinks in?
- **An animal that fits no run.** One sold between Eids, one still standing when her run is read, or one set aside to be kept for next year.
- **A calf bred on the farm.** Her **Margin** counts her as bought for nothing. Is she in a run at all, and if so, from when?
- **An animal crossed from Dairy.** Is she in a run, and does her time as a dairy animal count?
- **An Internal Sale.** An animal the Farm sold to a Venture, or bought back from one, including at the **Wind-up Period**'s buy-back. Which run is she in, and at which price does she enter or leave it?
- **The word.** "Run" is a placeholder. Grep `CONTEXT.md` before naming it.

From [the research](../../../docs/research/measuring-a-cattle-return.md) (2026-09-27): US standard practice has a calf bred on the farm leave the herd that bred her at market value, at weaning. On that reading she joins a fattening run when she crosses to it, and her price then is ticket 04's to settle. A dead animal stays in her run.

## Resolution

Grilled with the Owner, 2026-09-27. CONTEXT.md gains a **Season** entry, and **Target Window** says when it is set and that it places her in a Season. No ADR: each choice follows the Target Window the Farm already records.

- **A Season is the Farm's own fattening cattle aimed at one Target Window.** One Eid is one Season, whichever of its days each animal carries (expected, or announced if the Manager brought her along). A window that is no Eid, such as a winter market, is a Season of its own, named by its dates. Chosen over sold Eid to Eid, one Buying Trip, or an intake season: a Venture already has one Target Window, so a Season and a Venture read alike.
- **An animal stays in her Season however she goes.** Sold before the Eid, kept on after it, or dead. A Season is finished when its last animal has gone, not when its Eid passes. Until then, those still standing are valued as [What cattle still standing return](./06-what-cattle-still-standing-return.md) settles. Chosen over moving a kept-over bull to the next Season, which would carry a bad buy into next year, and over splitting at the Eid.
- **A calf bred here, or a cow crossed from Dairy, joins a Season on the day she crosses to Fattening.** Her days before it are the Dairy side's. **The crossing asks for her Target Window**, defaulting to the next Eid, as an Intake does. Today the crossing records only the Move, so she has no window. From the code, that also seems to leave her without the window and target-weight grounds for a Ready-for-Sale suggestion. Unproven; the spec should test it. What she enters at is [What a return counts](./04-what-a-return-counts.md)'s to settle (the research says market value).
- **An Internal Sale to a Venture takes her out of her Season at its price**, as a buyer's Sale would.
- **An Internal Sale from a Venture brings her into a Season at its price, from that day, like an Intake.** This includes the wind-up buy-back. **It asks for her Target Window**, defaulting to the next Eid, because hers has passed. Today an Internal Sale leaves the Intake's window as it was.
- **A Venture's animals are in no Season.** The Venture is their own.
- **For the spec:** a Season is worked out from the windows, never stored. The seed has no home-bred fattening animal, no window that is no Eid, and no kept-over bull, so the spec's tests must build each.
