# 04 — Withdrawing an agreement before it is approved

**What to build:** With the Owner's approval last, the Investor's agreement is the **offer** (AAOIFI SS 38 5/3), so they
may **withdraw** it in the portal until the Owner approves. Withdrawn, the offer goes back to waiting for them — or is
closed, decide — and the Owner sees that it was withdrawn and when.

**Blocked by:** 03

**Status:** done, pending merge

- [x] Portal: "withdraw my agreement" on an agreed offer not yet approved; refused once approved.
- [x] The offer's standing and the trail say it was withdrawn by the Investor (distinct from the Owner withdrawing it).
- [x] The Owner's approve refuses a withdrawn agreement; a race between withdraw and approve settles in one transaction.
- [x] Tests, the race included.
- [x] Somebody withdraws one on the seed, portal at phone width.

## What was decided while building

- **Withdrawn, it waits on them again** (not closed): the offer goes back to `offered`, `agreement_offer.agreement_withdrawn_at`
  says when, and they may agree again with a new code. The Owner may still withdraw the offer itself (`withdrawnAt`).
- **Amendments too** (ADR 0022 says any agreement): the Investor's answer is removed and the Amendment waits on them.
- **The proof is kept**, marked `signing_proof.withdrawn_at`; the unique index is now on standing proofs only, so a
  second agreement keeps its own. Every reader takes the standing proof — before this the approval confirmation went
  once per proof, so a re-agreed paper was confirmed twice (the test caught it).
- **The race** (both proven by switching off): the withdrawal and approval deadlocked — approval holds the Farm lock and
  waits on the offer row, the withdrawal held the row and its audit event's farm key waited on the lock — so the
  withdrawal now takes the Farm lock first; and approval's final update requires the offer still agreed, refusing
  `offer_not_agreed`, so an Agreement is never written from an agreement withdrawn meanwhile. The Amendment's
  withdrawal takes the Farm lock and re-reads the approval under it, as approval checks everyone agreed under it.
- Refused once approved: `offer_already_approved` / `already_approved`, worded in the portal as "approved already; part
  of your Agreement now". The trail's event is the Investor's own, with its reason; the Data Copy keeps each withdrawal,
  an Amendment's included though its answer is gone.
- **Looked at on the seed, 2026-10-09:** Hashem agreed to an Amendment with a texted code, withdrew it from the portal
  (asked first), and the notice went back to waiting; the Owner's line said he withdrew and when, 0 of 2 agreed. The
  test Amendment was taken back afterwards. Desktop width only — the browser window would not shrink to a phone's.
- **After the code review (2026-10-09):** an agreement is not withdrawn from an offer or Amendment the Owner already
  took back (`offer_withdrawn`); withdrawing an Amendment agreement twice records one withdrawal, not two; with the
  switch off the portal still lists what they agreed to, so they can withdraw it while it can still be approved;
  approval re-reads the agreement behind the Farm lock and dates the Nominees from the one standing. Left as is:
  `agreement_offer.agreement_withdrawn_at` beside the proofs (the Owner's line reads it without proofs), and a
  withdrawal of an agreement made before codes shows no line in the Data Copy — none exists on the real farm.
