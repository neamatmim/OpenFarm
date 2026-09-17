# 04 — A Buying Trip is paid for by the animals it brought home

**What to build:** Cattle are bought on an outing, not one at a time, and the outing costs money beyond the animals: a broker, the lorry home, the men's food and lodging. The Manager records the Buying Trip once with what it cost, each Intake from that outing names it, and the cost is split evenly across the animals that came home on it. Each animal's page shows her share, and it comes off her Margin.

**Blocked by:** 01

**Status:** ready-for-agent

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 1, user stories 28, 40; [What a project is charged for](../../openfarm-investor-projects/issues/05-what-a-project-is-charged-for.md); `CONTEXT.md` — **Buying Trip**.

- [ ] A Buying Trip records the day, where it went, and its costs — broker, transport, the men's food and lodging — entered by the Owner or the Manager, audited, and correctable in the ordinary window
- [ ] An Intake may name the Buying Trip it came home on; one that names none behaves exactly as today
- [ ] The Trip's cost splits evenly across the Animals whose Intakes name it, and each share shows on her page and in the per-Side report
- [ ] A Trip that brought nobody home — every Intake corrected away — is charged to nobody and is said out loud rather than spread elsewhere
- [ ] The Trip's costs reach the Farm's money record once, as money out, and are never double-counted as both a Trip and a hand-entered expense
- [ ] Tests cover a trip of three animals, a trip of one, an Intake with no trip, and a correction that moves an Intake off a trip
