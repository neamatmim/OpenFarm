# 05 — When the progress paper goes out

**What to build:** An Investor hears at the moments that matter, without having to ask and without the Owner having to remember.

Four occasions, from story 79:

- **Every month**, while the Venture is running.
- **When buying closes** — his money has become animals, and what the Cattle Budget did not spend has rolled into the Running Budget.
- **At the first Sale** — the run has started turning back into money.
- **When the Wind-up Period starts** — the clock is on, and whatever has not sold will be bought back by the Farm.

Each occasion raises the work of sending; it does not send anything by itself. The Owner generates the paper and issues it, because an Export is somebody's act and the trail has to name who did it.

**Blocked by:** 04 (অগ্রগতি — the paper while the Venture runs)

**Status:** ready-for-agent

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 6, user story 79; `CONTEXT.md` — **Notice**, **Digest**, **Wind-up Period**, **Venture**.

- [ ] The Owner is told, once, on each of the four occasions, that this Venture's Investors are due their paper
- [ ] The monthly one falls due once a month per running Venture, and a month already told about is not told again however often the app is opened
- [ ] A Venture that is Settled or Cancelled raises none of them
- [ ] What the Owner is told names the Venture and how many Investors are waiting
- [ ] Tests cover a month raised once across repeated runs, the three event-driven ones each raised by its own act, and a settled Venture raising nothing

## Checked before starting

**Decide whether this is a Notice or an SOP Instance before building it.** The farm has both, and they behave differently: a **Notice** sits in a person's list and is what the **Digest** carries, while an SOP Instance is work that falls due, can go late, and is claimed and completed. "Send the Investors their paper" is closer to work than to news — it has a doer and a done — but issuing is not yet a recorded act, so there may be nothing to complete against. Whichever it is, the once-only rule needs the same thing the Venture's other repeated work uses: what stops the same month raising the same item twice however often the scheduler runs. `sopInstance.cause` exists for exactly this and is worth reading first.

**"Issue" may or may not be a recorded act.** The roles matrix says the Owner "generates, issues and records acknowledgement" of a statement. Ticket 01 records the generating as an Export. Whether issuing and acknowledging are separate recorded acts — and what an acknowledgement even means for a paper handed over in person — is not settled anywhere, and this ticket should either settle it or say plainly that it is only about the telling.

**The first Sale and the start of the Wind-up Period are both already moments the Venture knows.** Selling and the wind-up buy-back were built in increment 5; find where each transition is made rather than adding a second way of noticing it.
