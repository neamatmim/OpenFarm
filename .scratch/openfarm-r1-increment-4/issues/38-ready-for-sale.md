# 38 — Ready for Sale: the farm suggests, the Manager confirms

**What to build:** When an animal reaches her target weight, or her Target Window opens, the farm says so — and the Manager decides. Confirming is the State change, because whether an animal is ready to sell is a judgement about the animal in front of you and not an arithmetic result. An animal under meat withdrawal cannot be made ready at all: her days are not up.

**Blocked by:** 36

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 4, user story 63; [Fattening, weights and sale](../../openfarm-release-1/issues/10-fattening-weights-and-sale.md) ("Ready for Sale").

- [ ] The farm suggests an animal when her target weight is reached or her Target Window opens, and says which of the two it was
- [ ] The Manager confirms, and that is the State change; Barn Staff cannot
- [ ] An animal under meat Withdrawal cannot be made ready, and the refusal says the day she is fit
- [ ] A suggestion is not a queue that grows for ever: one the Manager has considered and not acted on does not keep shouting
- [ ] Tests cover a suggestion on weight, one on the window opening, the Manager confirming, and the withdrawal refusal
