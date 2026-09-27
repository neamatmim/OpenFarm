# What cattle still standing return

Status: done

Assignee: Neamat Khan Mim

Type: grilling

Blocked by: 05

Map: [OpenFarm: what the money in cattle returns](../map.md)

## Question

The Owner wants the return while a **Season** or a Venture is still going, not only once it is sold. A Season is finished only when its last animal has gone, so a bull kept on after his Eid is still valued here. Decide how a standing animal enters it:

- **Her value today.** Priced as `fattening.prices` prices her (latest weight × the farm's market price a kilo for the Farm's own, the **Venture Plan**'s prices for a Venture's), at the low end, the high end, or both as a range?
- **Her money in so far.** Purchase and charged to date, as the animal prices already count.
- **A Season or Venture part sold.** How the sold animals' results and the standing ones' values add up, and how the page says which part is fact and which is estimate.
- **A Venture.** Its **Projection** already estimates the Settlement. Does a running Venture's return come from the Projection, or from the same standing-value sum as a Season, and do the two agree?
- **The words.** How the figure says it is an estimate, never a result, so the Owner never takes it for one.

Since [What a return counts](./04-what-a-return-counts.md) (2026-09-27): the figure is **Return on Cost**, worked as a Settlement is. A standing animal's value takes the place of a price she has not fetched. A crossed animal the Owner has not priced leaves her Season "not yet a result"; say how that reads while the Season is still going.

Since [How a return is put per year](./05-how-a-return-is-put-per-year.md) (2026-09-27): a rate a year counts each taka until its animal is sold. For one still standing, decide the day it counts to (today, or the day she is expected to go), and whether a Season still going gets a rate a year at all.

## Resolution

Grilled with the Owner, 2026-09-27. The **Return on Cost** entry in CONTEXT.md gains how a Season or Venture still going reads. No ADR.

- **A standing animal counts at what she is worth today.** That is her latest weight (her Intake weight if nobody has weighed her) × the price a kilo, against what she has cost so far. The price is the farm's market price for the Farm's own and the Venture Plan's prices for a Venture's. This is exactly how `fattening.prices` values her. Chosen over what she should fetch at her Target Window (a second Projection resting on gains not yet made) and over showing both.
- **Always a low–high range.** The part already sold is the same fact in both; only the standing part spreads. Chosen over the low end alone or a middle figure.
- **No rate a year until the last animal has gone.** While going, only the share over its days so far. Scaling an estimate to a year is the research's riskiest form.
- **A running Venture reads the same way.** Its Return on Cost values its standing animals today. Its **Projection** keeps estimating the end. The two answer different questions and are not meant to agree.
- **Return on Capital waits for the Settlement.** While running, the Owner reads the Venture's Return on Cost today and its Projection, which already shows the Investors' share at the end.
- **An animal who can't be valued is left out whole**, her cost and her value both, and named beside the figure with what puts her right: no price a kilo set, a crossed calf the Owner hasn't priced, or a crossed animal with no weight. The figure is worked over the rest, as a Settlement shows its figures with what still makes them a guess. Chosen over no figure until all are valued.
- **Words** (agreed as proposed): a running figure says «আজকের দামে» and «অনুমান, ফল নয়», with the part already sold and the part still standing as two lines. A finished Season or Venture drops both.
- **For the spec:** the running figure reuses the animal prices' valuation and the Settlement's narrowing, never a third sum. It is the Owner's alone, like the animal prices.
