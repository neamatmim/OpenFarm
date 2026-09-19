# Ventures — increment 6: the statements

Tickets from [the Ventures spec](../openfarm-investor-projects/spec.md), increment 6 — the last of the six. Everything an Investor ever receives from the Farm, because he has no login and never will: documents are the whole of what he is told, and the Farm's answer to "what happened to my money" has to be a paper he can hold and check himself.

Three documents, their shapes settled by [the prototype verdict](../openfarm-investor-projects/issues/08-prototype-investor-statements.md): **যোগদানপত্র** when he joins, **অগ্রগতি** while it runs, and **হিসাব নিকাশ** when it ends. Each is an **Export** with its Audit Event, each is for one Investor and shows no other, and each carries the footer saying no return is guaranteed and a loss comes off capital.

| #   | Ticket                                                | Blocked by |
| --- | ----------------------------------------------------- | ---------- |
| 01  | What a Venture Statement is                           | —          |
| 02  | যোগদানপত্র — the paper an Investor gets when he joins | 01         |
| 03  | What an Investor's animals are doing                  | —          |
| 04  | অগ্রগতি — the paper while the Venture runs            | 01, 03     |
| 05  | When the progress paper goes out                      | 04         |
| 06  | হিসাব নিকাশ — the paper when the Venture ends         | 01         |
| 07  | The three statements on screen                        | —          |

Two roots — 01, which is the surface all three sit on, and 03, which is the reading the progress paper needs and which no screen answers today. Work one ticket per `/implement`, clearing context between them. Ticket status lives in each file's `**Status:**` line.

**01 to 06 are done and merged (2026-09-19).** All three papers exist, are narrowed to one Investor, and write their Export to the trail; `investor_statement_due` tells the Owner on the four occasions. **07 was written afterwards** and is the gap the six left: none of the three can be reached by anybody, because none of the six had a UI criterion. It was added rather than folded into them so that what was built and what was not stays readable.

**Two things found while writing 01 to 06, both of which bit.** First: **nothing on the reading side is keyed on one Investor.** `ventures.agreements`, `ventures.movements` and the Settlement's payout rows each return every Investor on the Venture, names included, so a statement assembled from them as they stand would send one man a payload holding his neighbour's money. Ticket 01 narrowed it on the server, once, for the papers that need it. Second: **a paper here is a plain multi-line string**, and the shared `<Paper>` component renders that string plus at most one image — so the progress sheet's photo-per-Animal table does not fit the format the other fifteen papers use. The Owner chose: the photographs travel beside the sheet and every paper stays a string, which leaves ticket 07 only the laying out.

**Settled before any of this is written, and not to be re-decided:**

- **No projection anywhere.** Weights, gains and days are facts; a future weight or price is not, and on a paper an Investor keeps it reads as a promise. This is stricter than the Farm's own screens, which do project.
- **One Investor never sees another.** No Investor list, no other holdings, no other payouts. The Farm's own management share is the one other line that appears, because story 12 asks for it by name.
- **Spend is shown at Category level** — cattle, feed, medicine and vet, other. Never unit prices per kilogramme, never supplier names.
- **Photos stay**, one per Animal on the progress paper. An Investor who cannot visit the shed is buying on trust.
- **The Owner alone** generates, issues and records acknowledgement of a statement ([roles matrix](../openfarm-investor-projects/assets/venture-roles-matrix.md)).

Not here: an Investor portal or login, which is out of scope and needs the lawyer first; and the Investment Agreement deed itself, which the lawyer drafts off-system.
