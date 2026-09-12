# 36 — The fortnightly weigh-in

**What to build:** Every second week somebody walks the fattening pen with a scale and types in what each animal weighs. It is one piece of work per Pen with a per-animal Step, like every other round, and the farm keeps every reading — because the whole of fattening is the difference between them. A reading that jumps implausibly is queried on the spot rather than swallowed.

**Blocked by:** 35

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 4, user story 63; [Fattening, weights and sale](../../openfarm-release-1/issues/10-fattening-weights-and-sale.md) ("Weigh-in").

- [ ] A weigh-in is one Instance per Pen with a per-animal Step, raised by the Playbook like anything else
- [ ] The reading is typed in kilograms and kept per animal, with the method recorded as a scale reading
- [ ] A reading outside a sane range, or an implausible jump from her last one, is queried before it is accepted — and can still be confirmed
- [ ] An animal skipped carries her reason, and the round can still finish
- [ ] Tests cover a round of weights, an implausible jump, a skip, and the readings on her page
