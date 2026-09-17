# 01 — Costs carry their new parts, all at zero

**What to build:** The Owner opens an animal's page and the per-Side money report and sees three new lines beside feed, medicine and the vet — the Hasil paid on her, her share of the Trips that moved her, and her share of the Herd Costs — each reading ৳0 because nothing fills them yet. Margin, Cost of Gain and Cost per Litre already subtract them, so when the next four tickets start filling them, every screen and report is right without further change.

This is a prefactor: one change to the shape everything costed shares, no change to behaviour. Make the change easy, then make the easy change.

**Blocked by:** None — can start immediately.

**Status:** done

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 1, user stories 39, 50; [What a project is charged for](../../openfarm-investor-projects/issues/05-what-a-project-is-charged-for.md); `CONTEXT.md` — **Margin**, **Hasil**, **Buying Trip**, **Selling Trip**, **Herd Cost**.

- [x] What an Animal costs carries three more parts — Hasil, Trip shares and Herd Cost shares — beside feed, medicine and the vet, and what is spent on her adds all six
- [x] Margin, Cost of Gain and Cost per Litre read the wider sum; with the new parts empty, every existing figure is unchanged to the poisha
- [x] The animal's page and the per-Side report show the three new lines, in Bangla with their English labels, reading zero
- [x] Barn Staff and the Vet still see none of it
- [x] No existing expected figure changes: the two exhaustive cost assertions gain the three new keys at zero and nothing else, and one new test asserts an animal with no Hasil, no Trip and no Herd Cost has the Margin she had before
- [x] The kept cache is named again, so a phone never draws the new lines from an answer written before they existed

## What was built

**What an Animal costs** carries three more parts — `hasilBdt`, `tripBdt`, `herdBdt` — beside her feed, her doses and the Vet's visits, and what is spent on her adds all six, so **Margin**, **Cost of Gain** and **Cost per Litre** count them the day something fills them. A **CostShare** is the one shape the three take: an animal, the Side she stood on, a moment, an amount.

**The cost store** carries the three share lists beside feed, doses, vet and litres — through narrowing to a period and a Side, through adding up, and through the grouping by animal — all three empty, with the tickets that will fill them named in a comment.

**The screens** show the three lines wherever what was spent is shown: the animal's page, her Lactation, and both Side cards of the money report. Labels in both catalogues (হাটের হাসিল, কেনা-বেচার যাত্রা, পশুপালের খরচ).

**An old answer on a phone** carries none of the three, so the kept cache is named again and the lines default to zero — otherwise a fortnight of cached answers draws ৳NaN, and offline it would never refetch.

**Corrected while reviewing:** the glossary's **Cost per Litre** still described the narrow sum, and the first Bangla word for Herd Costs read as the cost of _serving_ a cow (পাল দেওয়া), so it is now পশুপালের খরচ.
