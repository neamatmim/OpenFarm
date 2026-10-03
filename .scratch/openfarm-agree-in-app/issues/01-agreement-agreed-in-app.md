# 01 — The switch, and an Agreement agreed in the app

**Status:** done 2026-10-03. Offer procedures named `agreementOffers` (the portal's Ventures are "offered" too); the glossary's **Agreement Offer**.

- [x] Farm switch `agreements_in_app` (off), Owner's alone. `STAMP_KINDS` gains `in_app`.
- [x] `agreement_offer`: the terms, the Nominees, the Request, the wording Version, the paper as laid out (snapshot),
      who offered and when; who agreed (the Investor's account), when, and the paper's hash; withdrawn; approved, by,
      and the Agreement it became.
- [x] `ventures.offerInApp` (refused `agreements_in_app_off`), `ventures.withdrawOffer`, `ventures.approveOffer`
      (refused `offer_not_agreed`), `ventures.offers`; `portal.offers`, `portal.agreeToOffer` (refused
      `paper_changed_since` when the hash read is not the one kept). Approval writes the Agreement as `sign` does —
      one shared write — with stamp kind `in_app`.
- [x] Capital may be taken against an `in_app` Agreement with no paper photo.
- [x] Screens: the sign sheet's "agree in the app" (switch on); the Venture's offers with Approve / Withdraw; the
      portal's offer, its paper and "আমি সম্মত"; the switch in settings.
- [x] Tests: off — refused; offered, agreed, approved — an Agreement that takes capital; approve before agreeing —
      refused; another Investor's offer — refused; a changed paper — refused; withdrawn — cannot be agreed.
