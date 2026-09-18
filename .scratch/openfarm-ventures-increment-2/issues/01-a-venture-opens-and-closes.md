# 01 — A Venture opens, and can be called off

**What to build:** The Owner writes up a Venture before anybody pays into it: what it is called, the capital it is looking for, the Floor below which buying is not worth starting, the day it must be decided by, its Target Window, the unit price and how many Units there are, and how the capital is planned between a Cattle Budget and a Running Budget. It sits in Open until the Owner moves it on to Buying, and a Venture that misses its Floor by the decision date is Cancelled instead. The Owner sees the Ventures she has, and what state each is in; nobody else sees any of it.

Nothing pays in yet and no animal belongs to one: this is the record the rest of the increment hangs on.

**Blocked by:** None — can start immediately.

**Status:** done

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 2, user stories 13, 14, 17, 18, 19, 20; [The Project: its capital, its animals and its life](../../openfarm-investor-projects/issues/03-the-project-its-capital-and-its-animals.md); `CONTEXT.md` — **Venture**, **Floor**, **Cattle Budget**, **Running Budget**, **Target Window**, **Unit**.

- [x] A Venture records its name, target capital, Floor, decision day, Target Window, unit price, how many Units, and the split between its two budgets; the Owner's alone, audited, and from her own phone
- [x] Its states are Open, Buying, Fattening, Selling, Settled and Cancelled; the Owner moves Open → Buying and Buying → Fattening, and nothing else may be moved by hand
- [x] Moving to Buying is refused while capital in is under the Floor, with a word the reader has
- [x] Cancelling is the Owner's, allowed only from Open, and says why
- [x] The Floor, the Running Budget's share and the Wind-up Period default from Farm Parameters the Owner can change
- [x] The Owner has a screen listing her Ventures with their state, target and window; the Manager, Barn Staff and the Vet see nothing of it anywhere
- [x] Tests cover opening one, the refusal to start buying under the Floor, cancelling from Open, the refusal to cancel from Buying, and each Role that may not look

## What was built

**A Venture** records the plan it opened on: what it is after, the Floor, the day to decide by, its Target Window, the unit price, how many Units, and how the capital is planned between buying the animals and keeping them. What it holds, spends and pays out is read from its money, never stored beside the plan — and the Running Budget is worked out as whatever the Cattle Budget is not, so the two cannot drift apart.

**Two moves are the Owner's**: Open → Buying, refused while the Venture holds less than its Floor, and Buying → Fattening. Selling and Settled are what the farm does — a first Sale, a last payout — and nothing writes them by hand. Cancelling is Open-only.

**The plan is filled in by the farm's own parameters** — the Floor's percentage, the Running Budget's share, and the Wind-up Period — on the server, so the rule lives in one place and the Owner may still type figures of her own. The three are hers alone: the Manager may not set them and does not see them.

**A Ventures screen**, the Owner's, with the sheet that opens one; the route, the menu entry and all four procedures refuse everybody else.

**Caught in review, and fixed:** the two moves the ticket names were **unreachable and untested** — capital is not implemented until ticket 03, so every Floor above zero refused, and the passing test only proved that zero is less than the Floor; a Venture opened with a Floor of nothing now proves both moves and the refusal beyond them. The ticket's "refusal to cancel from Buying" was never asserted. The three refusals had no words a Bangla reader would see, and two words were coined for one idea. The Manager could set, and Barn Staff could read, the figures a Venture is planned by. And my own form had **invented rules the ticket never set**: it derived the Units, forbade a target the unit price did not divide exactly, and gave the Owner no way to set the budget split at all — all three now defaults she can type over.
