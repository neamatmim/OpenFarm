# 51 — Money from the farm's own records

**What to build:** Most of the farm's money is already written down somewhere else. A Dispatch is a milk sale, an Intake is a cattle purchase, a Sale is a cattle sale, a feed Purchase is feed bought, and a medicine purchase is medicine bought — each becomes a Money Event on its own, linked back to the record that caused it, so finance is mostly free. The Vet enters their own visit fee.

The Owner decided on 2026-09-13 that **approval holds back the money, not the record**: a Sale, Intake or Dispatch over the Approval Threshold is recorded and the animal or the milk leaves as usual, and its Money Event waits, marked unapproved, on the Owner's queue until the Owner approves it.

**Blocked by:** 48, 50

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 6, user stories 77 and 79; [Finance in Release 1](../../openfarm-release-1/issues/13-finance-in-release-1.md); roles matrix — Money Events, Intake / Sale, Dispatch; [Notification channels](../../openfarm-release-1/issues/23-notification-channels.md) (Money Event awaiting approval → Owner, digest); `CONTEXT.md` — **Money Event**, **Category**, **Counterparty**, **Approval Threshold**.

- [ ] A Dispatch, an Intake, a Sale and a feed Purchase each create their Money Event in the same act — amount, date, direction, Category, Counterparty, payment method, and a link to the record — and a Correction to the record corrects its Money Event rather than adding a second
- [ ] A medicine purchase records the Drug List product, how much, the price, the supplier, and roughly how many doses it holds (the Owner's decision, 2026-09-13), and creates its Money Event
- [ ] The Vet records their own visit fee, optionally naming the animals seen, and it becomes a Money Event; the Vet sees no other money
- [ ] A Money Event over the Approval Threshold (a Farm Parameter, BDT 20,000) waits unapproved on the Owner's queue and in the Owner's digest; approving it is the Owner's alone and recorded; the record that caused it is never held back
- [ ] Barn Staff never see money anywhere
- [ ] Tests cover each record creating its Money Event once, a corrected record correcting it, a medicine purchase, the Vet's fee, the threshold holding the money and not the Sale, the Owner approving, and nobody else being able to
