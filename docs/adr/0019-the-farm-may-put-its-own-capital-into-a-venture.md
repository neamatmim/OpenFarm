---
status: accepted
date: 2026-10-05
---

# The Farm may put its own capital into a Venture, before anybody signs

Every Venture is a mudarabah, approved by the lawyer and the Shariah scholar on 2026-09-26: the Investors bring all the capital and the Farm brings its work. On 2026-10-02 the Owner asked how the Farm itself (the business, not the Owner personally) could take part as an investor. The questions went to the advisers on a sheet in `.scratch/openfarm-farm-capital/`. On 2026-10-05 the Owner said not to wait for them and to build on Claude's recommendation. This ADR records that recommendation. It is not the advisers' answer.

**The Farm takes Units with its own money, as a partner for that money.** AAOIFI SS 13 §8/9 says a mudarib that mixes in its own money is a partner for it and mudarib for the rest. So the Farm's Units are priced and shared like anybody's. They earn the Investors' share of the profit, and the Farm still takes its management share of the whole. The Farm also bears loss on its money in proportion, as an Investor does.

- **Before anybody signs, at most half, once.** The Owner takes the Farm's Units while the Venture is open, before any Investor has signed, before any paper has been printed for an Investor to sign, and while no Agreement offered in the app is standing, so every Investor signs knowing about them. Nor while the Agreement wording in force has no clause telling of them, as the Owner's own wording published before the clause would not. The Farm may hold at most half the Units, so a Venture stays its Investors'. The Units are at the same price, on the split the farm signs its Investors on, read by the server rather than sent. Every Investor then signs on that split, and the paper laid out to sign, the offer in the app and the signing all refuse another. There is no Amendment route onto a running Venture.
- **No Agreement with itself.** The Units are an Investment Agreement of their own kind, `farm_own`: no stamp, no paper, no Nominee, no Pay-in Notes. They are held by the Farm's own partner record (`investor.is_farm`), one to a farm. That record is no person. It is on no Investor list, counts nobody towards the Investor Cap, is given no statement or portal, and cannot be signed, renamed, retired or offered anything. It moves with an Amendment but signs and agrees nothing, so a Venture only the Farm holds Units of takes no Amendment.
- **Told to every Investor.** A clause of the standard Investment Agreement is printed only where the Farm holds Units (`only: "farm_capital"`, beside `by_the_month`). It names the Farm's Units out of all the Venture's. The joining letter carries the clause as one of the terms, the progress statement adds a line, and the portal's offer says it among the rules. A farm still on the standard wording of 2026-10-02 is caught up to the wording that carries the clause, as farms were caught up then.
- **On the Farm's books.** The capital leaves as money out (`venture_capital_out`) when it comes into the Venture Account. It comes back as money in on a call-off (`venture_capital_back`). At Settlement it comes home split into capital back and the Farm's return on it (`venture_capital_return`): one transfer in two parts, the return carrying the transfer's reference marked `· return`, because a Farm Account takes a reference once. A loss shows as capital back short. A movement of the Farm's own capital is not corrected on the Venture's side alone, as a lost animal made good is not. The Farm's payout is marked as received when it is sent. A Settlement Adjustment leaves out the Farm's own Units, because the Farm would be paying itself.

**Consequences:**

- CONTEXT.md gains **Farm Capital**, and its **Investor** entry says the Farm's own money makes it no Investor.
- `farm_own` is a new stamp kind, and three new money sources come with migration `20261005155456_farm_capital`.
- The Companies Act s.4 count of twenty is unchanged. The Farm is the Owner's own business, and the Owner is already counted.
- No tax point is taken. The accountant reads the three sources as the Farm's own investment.

**Revisit** when the lawyer, the Shariah scholar and the accountant answer the sheet. If they disagree, the clause's wording, the half-share limit and the booking follow their answer. A Venture where the Farm already holds Units keeps the terms its Investors signed.
