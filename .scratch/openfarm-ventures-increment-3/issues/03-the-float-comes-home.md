# 03 — The Float comes home

**What to build:** A Float is reconciled when the Trip returns: what went out equals the animals it bought — each one's price and her Hasil — plus the Trip's own costs, plus whatever cash came back and was deposited, with the deposit slip's reference. Nothing goes missing between the haat and the shed, and the Owner can see at a glance which Trips are still open.

A reconciliation that does not add up is refused and says by how much, because a Float that nearly balances is a Float nobody has actually counted. One never reconciled stays open, and the Venture says so — settlement will later refuse to close over it.

**Blocked by:** 01 (an Intake names its Venture), 02 (a Float goes out)

**Status:** ready-for-agent

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 3, user stories 27, 28, 29; `CONTEXT.md` — **Buying Float**, **Buying Trip**, **Hasil**, **Venture Movement**.

- [ ] The Owner reconciles a Float: the cash brought back, the day it was deposited and the slip's reference, and the Float closes
- [ ] What went out has to equal the Animals bought on that Trip for that Venture, plus the Trip's own costs, plus the cash returned — and a reconciliation that does not is refused, saying by how much and which way
- [ ] The cash returned is a Venture Movement of its own, so the Venture Account's balance comes back up by what was not spent
- [ ] An open Float is visible on the Venture, and a Trip already reconciled may not be reconciled twice
- [ ] Recording an Intake or a Trip cost after a Float has been reconciled is refused, because the sum it was reconciled against would no longer be true
- [ ] Tests cover a Float that balances, one short and one over, a double reconciliation, and an Intake arriving late against a closed Float
