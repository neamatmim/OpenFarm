# 03 — Capital in, and what is left

**What to build:** The Owner records capital as it arrives — which Investor, which Venture, how much, the day, and the bank reference — and the system refuses it in any form but a bank transfer, cheque or deposit slip, and refuses it at all until the stamped Agreement's photo is on file. A Venture shows what it has: capital in, what is spent, what is paid out, and the balance the Venture Account should hold, split between the Cattle Budget and the Running Budget. Cancelling a Venture refunds every taka that came in, recorded the same way.

**Blocked by:** 02

**Status:** ready-for-agent

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 2, user stories 15, 16, 18, 21, 22; [Investors, their shares and the money trail](../../openfarm-investor-projects/issues/06-investors-their-shares-and-the-money-trail.md); `CONTEXT.md` — **Venture Account**, **Cattle Budget**, **Running Budget**, **Unit**.

- [ ] Capital received is recorded against an Investor's Agreement with the day and the bank reference; cash and mobile money are refused, with a word the reader has
- [ ] It is refused while the Agreement has no stamped photo
- [ ] It is refused once the Venture has left Open, so every share is fixed for the run
- [ ] Capital in never becomes a Money Event: it is the Venture's money, and the Farm's income and expense record does not count it
- [ ] A Venture reads capital in, spent, paid out and the balance its account should hold, split across both budgets
- [ ] Cancelling a Venture refunds every capital movement it took, each recorded with its own reference, and the Venture ends Cancelled
- [ ] Tests cover capital in by bank, the three refusals, the balance after several Investors, and a cancelled Venture's refunds
