# 26 — The Drug List

**What to build:** The farm keeps a list of the products it treats animals with, each carrying how many days its milk and its meat must be withheld. There is no national table for this in Bangladesh — the days come off the label and the prescribing Vet — so the farm's own list is the only place they exist. The Vet maintains it. The Manager may add a product the day it is bought, with the days left blank, so buying is never blocked on the Vet being reachable; a product with blank days cannot be prescribed, which is what stops a treatment starting without a known Withdrawal.

**Blocked by:** None — can start immediately.

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 3, user stories 52 and 53; [Health, medicine and withdrawal](../../openfarm-release-1/issues/08-health-medicine-and-withdrawal.md).

- [x] The Vet adds and edits products with milk and meat withdrawal days; the Manager may add one with the days blank
- [x] A product with either figure blank cannot be prescribed, and says so in the words a person would use
- [x] Products are retired, never removed: a treatment given last March still names the product it used
- [x] Every change is an Audit Event — the withdrawal days are the farm's evidence at slaughter, and who set them matters
- [x] Tests cover adding, filling in the blanks, retiring, and the refusal to prescribe an incomplete product

**How it was built.**

- **The Manager may write down what the farm owns; only the Vet says what it costs the milk.** Adding a product with the days filled in is refused for anybody but the Vet, and the refusal says what to do instead: add it, and the Vet will fill them in. That is the rule the decision doc asked for, in one place, rather than a form that hides fields by Role.
- **Blank is a state the list names**, not an empty cell. A product waiting for the Vet says so on the screen and carries the reason it cannot be prescribed in the same words the refusal will use when ticket 28 tries to prescribe from it — because they are the same question asked twice.
- **Who wrote the days is kept with them.** The withdrawal days are what the farm shows a slaughter vet asking about the last thirty days, so their author and the day they were written are evidence too.
- **Retired, never removed.** A Treatment given last March still names its product.

**And the Drug List does not live behind the admin screens.** The Vet keeps it and is off-site more often than on it; putting it under `/admin` would have turned them away at the door — which is exactly what happened to the SOP Card in ticket 21, caught by review then rather than by a Vet standing in somebody else's yard.
