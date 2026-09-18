# 02 — যোগদানপত্র: the paper an Investor gets when he joins

**What to build:** The acknowledgement that his money landed, and the terms he agreed to, on one sheet he keeps.

A man hands over five lakh taka against a stamped deed written in legal Bangla. What he needs the next morning is a paper saying the Farm has it, how much, on what day, by which bank reference, and what he has actually agreed to — in seven plain lines, not in the deed's language.

On it:

- **Him:** name, address, phone, NID, and his nominee — the person his family would come to the Farm about.
- **The Venture:** its name, the unit price, the Units he holds, the capital received, the day it moved and the bank reference it moved on.
- **The terms, in seven plain lines:** it is a mudarabah; profit splits 60 : 40 after capital returns whole; a loss comes off capital; an animal that dies is the Venture's loss, not his alone; the Target Window and the Wind-up Period; no early exit; and the named Arbitrator.
- **The stamp:** its value, its date and its serial, so the paper points at the deed without reproducing it.
- **Two signatures.**

The percentages, the window and the Arbitrator are read from **his Agreement**, not from the Farm's parameters — they were frozen onto that paper at signing, and a Venture that was later amended must print what was in force for him. An Agreement amended by a dated amendment prints the terms the amendment left standing.

**Blocked by:** 01 (what a Venture Statement is)

**Status:** ready-for-agent

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 6, user stories 74, 75, 83; stories 3, 5, 6, 7, 8 for what an Agreement freezes; [the prototype verdict](../../openfarm-investor-projects/issues/08-prototype-investor-statements.md), document 1; `CONTEXT.md` — **Investment Agreement**, **Investor**, **Nominee**, **Unit**, **Venture Account**, **Arbitrator**.

- [ ] The paper prints his details, his nominee, the Venture, his Units, the capital received with its day and bank reference, the seven terms, the stamp's value, date and serial, and room for two signatures
- [ ] The terms come from his own Agreement, so a Venture whose terms were amended prints what is in force for him
- [ ] Capital that arrived in more than one movement is shown as what arrived, each with its own day and reference, rather than as one total nobody can check against a bank line
- [ ] It is refused before any capital has arrived, because there is nothing to acknowledge
- [ ] It carries the letterhead, the footer and no projection, from ticket 01
- [ ] Tests cover a paper against a two-movement capital arrival, one against an amended Agreement, the refusal before capital, and the Audit Event

## Checked before starting

**Read the capital from the Venture Movements, not from a total.** `ventures.movements({ ventureId })` (`routers/ventures.ts:2405`) returns `{ id, kind, agreementId, investorId, amountBdt, movedOn, reference, … }` — the day the bank moved it and the reference on the transfer, which is what makes this paper checkable against his own bank statement. The terms come from `ventures.agreements({ ventureId })` (`:572`), which returns `units`, `investorsPercent`, `farmPercent`, `targetWindow`, `arbitrator` and the stamp's `valueBdt`, `on` and `serial` — everything the seven lines and the stamp block need. The Investor's own details and his nominee come from `investors.list` (`routers/investors.ts:39`).

**Nothing on the reading side is keyed on one Investor, and that is this ticket's real work.** `agreements` and `movements` both return **every** Investor on the Venture, and `investors.list` returns every Investor on the farm. Assembled as they stand, a joining letter would be filtered on the client from a payload carrying other men's Units and other men's money — which breaks the one rule the verdict was most emphatic about. The narrowing belongs on the server: a procedure that takes the Venture and the Investor and returns his own, so that what leaves the farm for one man never contained another's. There is no `investors.get` and no statement procedure today; grep for `statement` in `packages/api/src` finds only the bank's.

**An amendment is a photo plus the terms in force from a date** (story 8: "the system to show which terms were in force when"). `ventures.agreements` returns the frozen terms and `hasPaper`, but not a history of amendments. Confirm how an amendment is stored before writing the reading — if the terms in force on a date are not queryable, this ticket says so plainly rather than printing today's as though they had always been.

**The nominee lives on the Investor, not on the Agreement** (`CONTEXT.md` — **Nominee**: "Recorded with the Investor, not with any one Agreement, because it is the person the family would come to the Farm about"), so a man in three Ventures has one nominee across all three and this paper prints it.
