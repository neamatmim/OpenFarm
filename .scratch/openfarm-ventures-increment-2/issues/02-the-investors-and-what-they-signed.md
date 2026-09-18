# 02 — The Investors, and what they signed

**What to build:** The Owner records an Investor once — name, phone, address, NID, bank account and a nominee — and reuses that record for every Venture they join. For each Venture they sign an Investment Agreement: the Units they take, the split percentages, the Target Window and the named Arbitrator, with a photo of the stamped paper and its stamp value, date and serial. The system counts the distinct Investors across every Venture that is not Settled or Cancelled, the Owner among them, warns from fifteen and refuses to record a twenty-first.

**Blocked by:** 01

**Status:** ready-for-agent

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 2, user stories 1–10; [The legal form and Shariah structure](../../openfarm-investor-projects/issues/10-the-legal-form-and-shariah-structure.md); [Investors, their shares and the money trail](../../openfarm-investor-projects/issues/06-investors-their-shares-and-the-money-trail.md); `CONTEXT.md` — **Investor**, **Investment Agreement**, **Unit**, **Arbitrator**.

- [ ] An Investor is its own record, not a Counterparty, and one person is one record across Ventures
- [ ] An Investment Agreement belongs to one Investor and one Venture: Units taken, the split, the window, the Arbitrator, and the stamped paper's photo with its value, date and serial
- [ ] Units taken may not exceed the Units the Venture has left, and are fixed once the Venture leaves Open
- [ ] The cap counts distinct people across Ventures that are not Settled or Cancelled, the Owner included: a warning from the warning level, and a refusal past the cap, both Farm Parameters, with a word the reader has and no override
- [ ] The Owner's alone, audited, from her own phone; nobody else sees an Investor or an Agreement
- [ ] Tests cover one person across two Ventures, Units that overrun, the warning, the refusal of one too many, and a Role that may not look
