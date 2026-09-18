# 02 — The Investors, and what they signed

**What to build:** The Owner records an Investor once — name, phone, address, NID, bank account and a nominee — and reuses that record for every Venture they join. For each Venture they sign an Investment Agreement: the Units they take, the split percentages, the Target Window and the named Arbitrator, with a photo of the stamped paper and its stamp value, date and serial. The system counts the distinct Investors across every Venture that is not Settled or Cancelled, the Owner among them, warns from fifteen and refuses to record a twenty-first.

**Blocked by:** 01

**Status:** done

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 2, user stories 1–10; [The legal form and Shariah structure](../../openfarm-investor-projects/issues/10-the-legal-form-and-shariah-structure.md); [Investors, their shares and the money trail](../../openfarm-investor-projects/issues/06-investors-their-shares-and-the-money-trail.md); `CONTEXT.md` — **Investor**, **Investment Agreement**, **Unit**, **Arbitrator**.

- [x] An Investor is its own record, not a Counterparty, and one person is one record across Ventures
- [x] An Investment Agreement belongs to one Investor and one Venture: Units taken, the split, the window, the Arbitrator, and the stamped paper's photo with its value, date and serial
- [x] Units taken may not exceed the Units the Venture has left, and are fixed once the Venture leaves Open
- [x] The cap counts distinct people across Ventures that are not Settled or Cancelled, the Owner included: a warning from the warning level, and a refusal past the cap, both Farm Parameters, with a word the reader has and no override
- [x] The Owner's alone, audited, from her own phone; nobody else sees an Investor or an Agreement
- [x] Tests cover one person across two Ventures, Units that overrun, the warning, the refusal of one too many, and a Role that may not look

## What was built

- `investor`, `investment_agreement` and `agreement_paper`, with `investorCap` (20) and `investorWarnAt`
  (15) as Farm Parameters the Owner turns on the settings screen.
- One Investor record per person — name, phone, address, NID, bank account and a nominee — reused for
  every Venture they join. The same name on the same phone is refused as the same person written twice;
  two people may still share a name, because in Bangladesh they do.
- An Investment Agreement per Investor per Venture: the Units taken, the split, **the Target Window
  copied onto the paper at signing**, the named Arbitrator, and the stamped instrument's value, day and
  serial with a photo of the paper.
- The cap counts distinct people across every Venture that is not Settled nor Cancelled, the Owner among
  them. Counted inside the write's own transaction behind a lock on the Farm row, so two phones signing
  at once cannot both pass a count made before either was written.
- Two screens, the Owner's alone: the Investors list with how many Units each holds and the warning as
  the cap nears, and the Agreement sheet on an open Venture.

## What the review caught

- **A Venture could be signed for by another Farm's Investor.** `sign` scoped the Venture but took the
  investor id raw; they would have counted against this farm's cap and never appeared on its own list.
- The Agreement did not hold its own Target Window, so moving the Venture's window would silently have
  moved what every Investor had already signed for.
- A stamped paper could be recorded with a stamp value of nothing.
- The stamped-paper upload re-invented the shared photo schema, taking any content type and twice the
  size the rest of the farm allows.
- A unique index on the Investor's name alone would have refused the second Md. Abdul Karim.
- Separately, the suite turned up a real defect of its own: the audit trail was ordered by the instant
  alone, so an entry and a Correction in the same second read back in whatever order the rows lay in.
  uuidv7 here carries a counter for exactly this, and the trail now breaks the tie by id.
