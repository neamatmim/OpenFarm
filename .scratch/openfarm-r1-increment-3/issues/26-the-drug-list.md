# 26 — The Drug List

**What to build:** The farm keeps a list of the products it treats animals with, each carrying how many days its milk and its meat must be withheld. There is no national table for this in Bangladesh — the days come off the label and the prescribing Vet — so the farm's own list is the only place they exist. The Vet maintains it. The Manager may add a product the day it is bought, with the days left blank, so buying is never blocked on the Vet being reachable; a product with blank days cannot be prescribed, which is what stops a treatment starting without a known Withdrawal.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 3, user stories 52 and 53; [Health, medicine and withdrawal](../../openfarm-release-1/issues/08-health-medicine-and-withdrawal.md).

- [ ] The Vet adds and edits products with milk and meat withdrawal days; the Manager may add one with the days blank
- [ ] A product with either figure blank cannot be prescribed, and says so in the words a person would use
- [ ] Products are retired, never removed: a treatment given last March still names the product it used
- [ ] Every change is an Audit Event — the withdrawal days are the farm's evidence at slaughter, and who set them matters
- [ ] Tests cover adding, filling in the blanks, retiring, and the refusal to prescribe an incomplete product
