# What the dairy herd returns

Status: done

Assignee: Neamat Khan Mim

Type: grilling

Blocked by: 01, 05

Map: [OpenFarm: what the money in cattle returns](../map.md)

## Question

A dairy cow is not bought and sold in a **Season**. She is bought or bred, milked over several **Lactations**, calves, and leaves by a **Sale** to a butcher or a **Mortality**. Decide what her return is and the herd's:

- **The money in.** Her purchase price, or for one bred here, her rearing cost as a calf and heifer? Plus her keep, as **Cost per Litre** counts it.
- **The money back.** Her milk sent to Bulk at what the **Dispatches** fetched. Her calves: at what value, and when? A bull calf crossed to Fattening, or a heifer kept to milk? Plus her cull sale at the end.
- **Over what.** Per cow over a Lactation, over her life, or the herd per year? Put per year as [ticket 05](./05-how-a-return-is-put-per-year.md) settles.
- **A cow still milking.** Her value today, as [ticket 06](./06-what-cattle-still-standing-return.md) settles for a standing fattening animal.
- **Beside the Cull Reason list.** The list already reads her milk against her keep. Does her return sit on that list, and does it change who is named there?

[Ticket 01](./01-how-a-cattle-return-is-measured.md)'s research says how dairy returns are measured.

From [the research](../../../docs/research/measuring-a-cattle-return.md) (2026-09-27): dairy is measured per cow per year (IFCN), per lactation (BLRI) or per 100 kg of milk. Its returns are milk, calves at market, cull sales, manure and the change in herd value. A lifetime figure can rank cows differently from a yearly one. IFCN's cost of milk takes calves, culls and dung off the keep before dividing by milk; OpenFarm's Cost per Litre does not.

Since [What a return counts](./04-what-a-return-counts.md) (2026-09-27): a calf bred here or a cow crossed to Fattening goes at a price the Owner enters, her weight × a rate a kilo. **That taka is the dairy herd's return for her.** Decide what a heifer calf kept to milk, or one sold as a calf, counts at.

Since [How a return is put per year](./05-how-a-return-is-put-per-year.md) (2026-09-27): fattening's rate a year is simple over money × days, with a 60-day floor. Decide whether dairy's is put the same way, or read per cow per year as the studies do.

Since [What cattle still standing return](./06-what-cattle-still-standing-return.md) (2026-09-27): a standing fattening animal counts at today's weight × the price a kilo, as a low–high range, and gets no rate a year until her Season is finished. Decide what a cow still milking counts at: there is no price a kilo for a milking cow.

## Resolution

Grilled with the Owner, 2026-09-27. CONTEXT.md's **Return on Cost** widens to a dairy Animal's whole stay, and **Head Price** is added. No ADR.

- **Each dairy animal is her own run**, from the day she enters until she leaves. Return on Cost is worked as for fattening. Chosen over a yearly herd account, which needs every cow valued at each year's start and end, and over per Lactation, which is a margin over keep and close to the Cull Reason list.
- **What she enters at.** A heifer bred here enters at birth, at nothing, and her calf and heifer years' keep is the money in. A bought cow, or one here before the farm kept its books, enters at **a price the Owner enters**, with a note; until priced, her return says so and isn't a result. A bought dairy cow's price is recorded nowhere today (no Intake; the register keeps only `source = bought`).
- **Every calf is her own run.** A bull calf's ends at his crossing price or his Sale; a heifer's goes on into her milking years. Her dam's return is her own milk and cull sale, and **her calves' results are shown beside her**, so fertility is still seen. Chosen over counting calves as the dam's, which would make a cow that bears heifers read worse than one that bears bulls.
- **What comes back:** her milk sent to Bulk, each month's litres × what that month's Dispatches fetched (agreed as proposed), and her cull Sale or crossing price. Milk fed to calves and dung don't count.
- **Her keep** is what Cost per Litre already charges her.
- **A dairy animal still here counts at her kind's Head Price**, a low and a high price a head the Owner sets for calf, heifer, pregnant heifer, cow in milk and dry cow. That makes her running figure a range, «আজকের দামে». Chosen over her butcher value (a weight nobody takes of a milking cow), her entry price, and no value today.
- **Same per-year rule as fattening**: simple over money × days, the 60-day floor, and the rate a year only once she has gone. The dairy side's year by year stays Month by month's.
- **On the Cull Reason list**, a named cow shows her return so far beside her reasons, never as a reason. What she cost is sunk; the list reads what she will do next.
- **For the spec:** the monthly milk price is `milkPriceOf` per month, as Month by month uses it; a month with milk to Bulk and no Dispatch needs a word. A cow's keep, her calves' runs, and the entry prices (crossing, bought, opening herd) are all Owner-only figures.
