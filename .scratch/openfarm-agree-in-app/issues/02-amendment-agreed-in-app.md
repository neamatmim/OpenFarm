# 02 — An Amendment agreed in the app

**Status:** done 2026-10-03. Withdraw is `ventures.withdrawAmendment`; anybody signed for the Venture after the offer cannot agree to a paper not naming them, so it waits on a withdraw and a new offer.

- [x] `amendment_offer` and one answer per Agreement: the terms, the reason, the paper; each Investor agrees.
- [x] `ventures.proposeAmendmentInApp` (switch on), `portal.agreeToAmendment`, `ventures.approveAmendment` (every
      Investor agreed; refused `amendment_not_agreed`), withdraw. Approval writes the Amendment rows as `amend` does,
      signed on the day approved, with no paper.
- [x] Screens and tests as 01.
