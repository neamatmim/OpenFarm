# Add the Nominees to the pending lawyer meeting

Status: done

Assignee: Neamat Khan Mim

Type: task

Blocked by: 05

Map: [OpenFarm: an Investor may name several Nominees](../map.md)

## Question

The nominee wording goes to the lawyer (and the Shariah scholar) at the meeting already pending, not at one of its own. Once the prototype is done:

- Add a nominee page to the lawyer's pack, built from [the draft wording](../assets/05-nominee-wording-draft.md) and variant D of the prototype, ([`07-lawyer-pack.md`](../../openfarm-investor-portal/assets/07-lawyer-pack.md) and its printable `.html`). It should hold the drafted parties part, what a Nominee is (02), how several stand together (03), and which list governs (04), with the questions put plainly. Include the question from 04: **can an unstamped, signed Nomination replace the nominee a stamped Agreement names?** If not, a change would need stamp paper.
- From 02 and [the research](../../../docs/research/nominees-in-bangladeshi-law-and-shariah.md):
  - **For the lawyer:**
    - Does the discharge line give the Farm a good discharge against heirs who dispute a payment?
    - Should the Farm pay above a threshold only against a succession certificate (Tk 25,000 in the Savings Banks Act, Tk 1 lakh at CDBL)?
    - Would a term paying the Nominee in their own right be void under the Contract Act, s.23?
  - **For the Shariah scholar:** confirm the *amin* reading, and that an heir may be a Nominee who only collects.
- Note the question on [Bring the portal as built to the lawyer](../../openfarm-investor-portal/issues/07-bring-the-portal-to-the-lawyer.md) and on [Take the structure to a lawyer and a Shariah scholar](../../openfarm-investor-projects/issues/11-take-the-structure-to-a-lawyer-and-a-shariah-scholar.md).

The spec does not wait for the answer. The standard wording ships as a draft and the Owner publishes it after approval. This ticket is done when the page is in the pack; the answer arrives on those two tickets.

## Resolution

Done 2026-09-26.

- **The printable pack** ([`07-lawyer-pack.html`](../../openfarm-investor-portal/assets/07-lawyer-pack.html)) gains two A4 pages and now prints nine; the record page moves to page 9.
  - **Page 7:** the Nominee table under the Investor (an invented example), the Nominees-know line, the Receiver's line, the no-Nominee sentence, and the heirs clause with rules 1–5.
  - **Page 8:** the Nomination paper, then the questions for counsel and for the Shariah scholar.
  - The record page lists the several-Nominees wording among what may be approved.
  - Page 2's minor-nominee question now points at the Receiver's line.
- **The Markdown pack** ([`07-lawyer-pack.md`](../../openfarm-investor-portal/assets/07-lawyer-pack.md)) lists the wording draft to bring and has a new checklist section, **Several Nominees**, with six questions. "After the meeting" asks whether the wording stands.
- **Both lawyer tickets** point at the pages: [Bring the portal as built to the lawyer](../../openfarm-investor-portal/issues/07-bring-the-portal-to-the-lawyer.md), and [Take the structure to a lawyer and a Shariah scholar](../../openfarm-investor-projects/issues/11-take-the-structure-to-a-lawyer-and-a-shariah-scholar.md), whose Shariah checklist carries the *amin* question.
- **Checked:** a headless Chrome print gives nine A4 pages, one per sheet, so pages 7 and 8 each fit on one sheet.

The answer arrives on those two tickets, not here. The spec doesn't wait for it: the wording ships as OpenFarm's standard draft, and the Owner publishes it once it is approved.
