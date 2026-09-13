# 52 — Wages, and everything else

**What to build:** What no other record catches — wages, electricity, repairs, transport, manure sold — the Manager enters by hand, with a Category, a Counterparty, how it was paid and a photo of the receipt. With this the month is complete. The farm keeps its own list of Categories.

**Blocked by:** 51

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 6, user stories 78 and 79; [Finance in Release 1](../../openfarm-release-1/issues/13-finance-in-release-1.md); `CONTEXT.md` — **Money Event**, **Category**, **Counterparty**, **Approval Threshold**.

- [ ] The Manager enters an income or expense with amount, date, Category, Counterparty, payment method (cash, bKash, bank) and an optional receipt photo
- [ ] Wages are one entry per person per month, naming the person as the Counterparty
- [ ] The farm's Categories are a list the Owner and Manager keep, seeded with the headings the records already use; a Category in use is retired, never removed
- [ ] An entry over the Approval Threshold waits for the Owner exactly as a record's Money Event does; a Correction to an entry is a Correction, with a reason
- [ ] Finance is online-only, and Barn Staff never see it
- [ ] Tests cover an expense and an income, a wage, a receipt photo, a new Category and a retired one, the threshold, and a correction
