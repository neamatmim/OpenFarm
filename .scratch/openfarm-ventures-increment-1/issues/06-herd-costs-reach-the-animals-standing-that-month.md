# 06 — Herd costs reach the animals standing that month

**What to build:** Some spending is for the animals but names none of them: a Vet visit to the fattening pens that named nobody, lab tests, fly spray, a dewormer not given as a dose. Today it is charged to nobody. The Owner marks a Category, once, as charged to the animals of its Side; the Manager keeps entering money exactly as now, picking a Category and a Side; and each month that Category's hand-entered money splits across the Animals of that Side by the days each stood on the farm that month — so an animal who arrived on the 20th pays for ten days, not thirty.

Wages, utilities, repairs, shed hygiene and equipment are never marked: they are the place and the people, and they stay the Farm's.

**Blocked by:** 01

**Status:** done

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 1, user stories 42–46; [What a project is charged for](../../openfarm-investor-projects/issues/05-what-a-project-is-charged-for.md); `CONTEXT.md` — **Herd Cost**, **Category**, **Pen Spell**.

- [x] A Category carries the Owner's mark, "charged to the animals of its Side"; setting or clearing it is the Owner's alone and audited, and the standard Categories start unmarked
- [x] Nothing about entering money by hand changes for the Manager: the same Category and Side, the same receipt photo, the same approval rule
- [x] A marked Category's hand-entered money for a month splits across the Animals of its Side by the days each stood on the farm in that month; money with no Side reaches nobody
- [x] An Animal who arrived or left mid-month carries only her days; an Animal who left before the month carries none
- [x] The share shows on her page and in the per-Side report's Herd Cost line, and comes off her Margin and Cost of Gain
- [x] Marked money of a month with no animals standing on that Side is charged to nobody and said out loud
- [x] Tests cover an unmarked Category reaching nobody, a marked one split across two animals with different days, a mid-month arrival, and a month with nobody standing

## What was built

**The Owner marks a Category** as one the animals of its Side carry — the Owner's alone, from their own phone, audited, and worn as a badge in the Category list. The standard Categories start unmarked, and **wages, utilities, repairs, money coming in and money a record books may not be marked at all**: the ticket states that flatly, so it is refused rather than left to a menu.

**Nothing changes for the Manager.** The same Category, the same Side, the same receipt photo, the same approval rule.

**The month's marked money splits by the days each animal stood here**, on the Side the money names. A beast who came mid-month carries her days and no more; one who had gone carries none; money naming no Side reaches nobody; and a month with nobody standing on that Side is charged to nobody and said on the money report, beside the notes about stray feed and stray outings.

**It comes off her Margin and her Cost of Gain** through the same sum as everything else.

**A bug the tests caught:** a month added to the 31st of January lands on the 3rd of March, so February's window was swallowing the animals standing in March and charging them February's fly spray. Months are now counted in years and months rather than added to a date, and a test buys a beast in January to prove she carries her month and not the one before it.

**Caught in review, and fixed:** the flat rule above had nothing enforcing it, and the screen offered the mark on income Categories, whose money would have been charged to animals as a cost; the refusal had no words a Bangla reader would see, and hand-rolled its own error rather than the file's helper; the mark was checked against one rule on the server and two on the screen; a share was dated the day the money moved even for a beast who arrived later in the month, so a part-month report read it into days she had nothing to do with; a doc comment was orphaned by insertion (the ninth in this repo); and the badge's icon was named for a word the glossary avoids.
