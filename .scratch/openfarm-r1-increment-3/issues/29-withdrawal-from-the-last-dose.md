# 29 — Withdrawal, from the last dose actually given

**What to build:** Recording a dose puts the animal under Withdrawal — her milk until the dose plus the product's milk days, her meat until the dose plus its meat days — counted from the dose that was really given rather than from the course that was planned, because a course cut short and a course finished late are different animals. The milk gate has been standing since increment 1 with nothing behind it; this is what puts something there. Only the Vet may shorten or end a Withdrawal, with a reason, and the farm keeps both the reason and who gave it.

Meat withdrawal has nothing to refuse until the Sale SOP arrives in increment 4, so it is recorded and shown — her page and the Manager's queue say when she is fit for sale again — and increment 4's Sale reads the same date. Confirmed with the Owner 2026-09-12: a Manager selling a cow in the meantime must not be left without a warning.

**Blocked by:** 28

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 3, user stories 54 and 55; [Health, medicine and withdrawal](../../openfarm-release-1/issues/08-health-medicine-and-withdrawal.md) ("Withdrawal & gating").

- [ ] A dose sets both Withdrawals from that dose, on the product's own days
- [ ] Her milk goes to Discard while she is under milk Withdrawal — recorded, never lost — and the phone's gate holds offline on what it last knew
- [ ] Her meat Withdrawal is on her page and in the Manager's queue, with the date she is fit for sale again
- [ ] Only a Vet may shorten or end a Withdrawal, with a reason; the change is audited and the original stays visible
- [ ] Tests cover a dose setting it, a course ending late, the milk gate, the Vet's exception, and everybody else being refused it
