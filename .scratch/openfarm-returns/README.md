# What the money in cattle returns — tickets

These are the tickets from [the spec](./spec.md). They build what the map [OpenFarm: what the money in cattle returns](../openfarm-roi/map.md) decided on 2026-09-27. The vocabulary is in the glossary's **Season**, **Return on Cost**, **Return on Capital**, **Bank Rate** and **Head Price** entries, and ADR 0012. The layout is variant B of the prototype on branch `prototype/owner-reads-returns`.

| #   | Ticket                                          | Blocked by                                         |
| --- | ----------------------------------------------- | -------------------------------------------------- |
| 01  | The Returns page: finished Seasons and Ventures | —                                                  |
| 02  | The Bank Rate                                   | 01                                                 |
| 03  | Still going, at today's price                   | 01                                                 |
| 04  | Joining a Season                                | 03                                                 |
| 05  | Breaking a Season down                          | 01                                                 |
| 06  | What the dairy herd returns                     | 04                                                 |
| 07  | Investors read a settled share                  | 01                                                 |
| 08  | Across every Season                             | the first real Season finishing (Eid-ul-Adha 2027) |

**There is one root, 01.** It builds the arithmetic, the Season and the page, with finished Seasons and settled Ventures only.

**02, 03, 05 and 07 may go side by side** once 01 is in. 04 needs 03's gaps, and 06 needs 04's crossing price, which is a calf's end on the dairy side.

Work one ticket per `/implement`, clearing context between them. Each ticket's status is on its own `**Status:**` line.

**Every ticket ends with somebody opening the page:**

- `/returns` in both languages;
- the strips where they live;
- the portal at phone width;
- papers by print preview cloned into an overlay, because Chrome's print dialog freezes the browser tools.

Web component tests are not collected by the vitest include glob.

**Settled on the map, and not to be re-decided:**

- **A Season** is the Farm's own fattening cattle aimed at one Target Window: one per Eid, a non-Eid window alone. An animal stays in it however she goes; it is finished when the last has gone. A Venture's animals are in none.
- **A Season is worked as a Settlement is**, the dead in. **Return on Cost** is result ÷ total cost. **Return on Capital** is the Investors' share ÷ all their capital, after the Farm's share, which has no ratio. The Advance is in neither.
- **Per year:** simple, over money × days, no rate under the Owner's floor (60 days) and none until finished. A loss is scaled the same. Shown after the share and days, never alone.
- **Still going:** today's weight × the price a kilo, low–high, «আজকের দামে», «অনুমান, ফল নয়». An animal who can't be valued is left out whole and named.
- **A crossing and a buy from a Venture join a Season** and ask for a Target Window. The Owner prices a crossing (weight × a rate a kilo); that price is also the dairy side's return for her.
- **Dairy:** each animal her own run, from birth at nothing or from a price the Owner enters; calves their own, shown beside the dam; milk at each month's Dispatch price; **Head Prices** while here; on the Cull list beside, never a reason.
- **The Bank Rate** is the Owner's alone: typed with a note, dated, locked on a run's first taka, beside finished rates a year only.
- **Investors** read a settled share over the Venture's days, on the portal and the হিসাব নিকাশ, behind a switch until the advisers see it. Never a rate a year (ADR 0012).
- **Out of scope:** the whole farm's return, Venture terms, the Manager, a running Return on Capital, the Projection as a share or rate, charging wages or interest, dung.
