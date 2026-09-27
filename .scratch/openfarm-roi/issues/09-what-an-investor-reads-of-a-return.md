# What an Investor reads of a return

Status: done

Assignee: Neamat Khan Mim

Type: grilling

Blocked by: 02, 05

Map: [OpenFarm: what the money in cattle returns](../map.md)

## Question

Decide what an Investor is shown of the return on their own money, and where:

- **A settled Venture.** Their payout against their capital, as a share and as a rate a year from [ticket 05](./05-how-a-return-is-put-per-year.md), on the **Investor Portal**'s Venture and money pages, on the **হিসাব নিকাশ**, or both? A loss too?
- **Across their Ventures.** One figure over everything they have settled with the farm, or each Venture only?
- **The Projection as a rate.** A running Venture's and an offer's **Projection** shown as a share and a rate a year beside the taka, behind `farm.investorProjections`. Low and high, never one figure (ADR 0010)?
- **The words.** Bangla and English, from what [ticket 02](./02-how-a-mudarabah-return-is-stated.md) finds reads as a promise and what does not. Keep the standing footer: no return is guaranteed, and a loss comes off capital.
- **The papers.** The Investor Statement rule says no projection is ever printed. Is a settled return a fact that may be printed?
- **The advisers.** Whether this wording goes to the lawyer and the Shariah scholar before the spec, or ships behind a switch as Projections did.

From [the research](../../../docs/research/measuring-a-cattle-return.md) (2026-09-27): GIPS has a fixed-life pool report a money-weighted return since inception, never annualised before a year has passed. Show the advisers any Investor-facing rate a year alongside that rule.

From [the second research](../../../docs/research/stating-a-mudarabah-return.md) (2026-09-27): a settled return is a fact. Show it after the Settlement is approved, in taka first, then as a share of capital over the Venture's own days, and a loss the same way. A rate a year never alone and never the most prominent figure. The Projection never as a rate a year; at most a low–high share of capital over the run, never printed. No past result on an offer, and never a top-up to any stated figure. On paper the choices are the share only, both, or neither. The research lists the questions for the lawyer and the Shariah scholar, and recommends they see the wording before any switch turns on.

Since [What a return counts](./04-what-a-return-counts.md) (2026-09-27): an Investor's figure is **Return on Capital**, their profit share over their capital after the Farm's share, said «প্রতি ১০০ টাকা মূলধনে … টাকা লাভ». A gift from the Farm's share is shown as a gift, not as their return.

Since [How a return is put per year](./05-how-a-return-is-put-per-year.md) (2026-09-27): Return on Capital is put a year simply over each taka's days from arrival to payout, with a 60-day floor. It shows as the share, its days, then the rate labelled as the share scaled to a year, with its working. Decide whether an Investor sees that rate at all.

Since [What cattle still standing return](./06-what-cattle-still-standing-return.md) (2026-09-27): the Owner's running Return on Cost values standing animals at today's price, and Return on Capital waits for the Settlement. Decide whether an Investor sees anything running beyond the Projection they already may.

Since [The bank rate beside it](./07-the-bank-rate-beside-it.md) (2026-09-27): the Bank Rate is the Owner's alone. An Investor is never shown a Venture beside a bank rate.

## Resolution

Grilled with the Owner, 2026-09-27. Recorded as [ADR 0012](../../../docs/adr/0012-investors-read-a-settled-return-as-a-share-never-a-rate-a-year.md). CONTEXT.md's **Investor Statement** and **Return on Capital** entries widen to match.

- **A settled Venture shows the Investor's Return on Capital as a share**, once the Settlement is approved. It appears on the portal's Venture page and on the হিসাব নিকাশ: the payout in taka first, then «প্রতি ১০০ টাকা মূলধনে … টাকা লাভ» over the Venture's own days, a loss the same way, under the standing footer. Chosen over the portal only and over taka only.
- **Never a rate a year for Investors**, even labelled with its working. The Owner's stays the Owner's. Chosen over a portal rate behind a switch and over printing it.
- **Each Venture on its own.** No blended figure across Ventures, which would be a track record in all but name. The money page keeps its taka totals.
- **The Projection stays a taka range**, never a share or a rate, and nothing else running is shown. The "Projection as a %" ticked in while charting is settled here as not for Investors. The Owner's own running Return on Cost ([What cattle still standing return](./06-what-cattle-still-standing-return.md)) covers what it was for.
- **No past result on an offer, never a top-up to any stated figure, no Bank Rate.** A gift from the Farm's share is shown as a gift.
- **Words:** avoid মুনাফার হার, a bare «বার্ষিক রিটার্ন», নিশ্চিত, নির্ধারিত, ফিক্সড and secure, per the research.
- **Behind the Owner's switch**, off until the lawyer and the Shariah scholar have seen the wording, as the Projections are. It shows in the Portal Preview meanwhile. The spec doesn't wait. The research's "Take to the lawyer and the Shariah scholar" questions go with it.
- **For the spec:** a switch of its own beside `farm.investorProjections`, and an Audit Event when it is turned on. The হিসাব নিকাশ prints the share only while the switch is on, and a paper printed before then stays as it was.
