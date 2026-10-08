# OpenFarm: signing in the app instead of on paper — map

Label: wayfinder:map

Tracker: local-markdown (`.scratch/openfarm-sign-in-the-app/`)

Charted: 2026-10-08

## Destination

A **decision**, ready to plan the build: which of an Investor's papers are agreed in the app instead of signed on paper,
and how an agreement in the app is sealed — on OpenFarm's own recommendation, informed by the research below. The map is
done when nothing about signing in the app is left to decide before the build is planned.

## Notes

- **Why** (the Owner, 2026-10-08): every paper means the Investor travelling to the farm or meeting the Owner, and the
  money waits on the stamped paper being signed and photographed.
- **What exists today** (from the code, 2026-10-08):
  - Signed on paper in front of the Owner: the **Investment Agreement** and the **Amendment** (stamped, or stamp duty by
    e-challan), the **মনোনয়নপত্র**, the **Portal Consent**, and a minor Nominee's **Receiver** on their line.
  - **An Agreement and an Amendment can already be agreed in the app** (an **Agreement Offer**, AG-01/AG-02, merged
    2026-10-03, `.scratch/openfarm-agree-in-app/`), behind a farm switch that is **off** until the advisers confirm the
    Stamp Act's admissibility. It is sealed by the signed-in Investor agreeing to the exact paper shown (`paperHash`): no
    one-time code, no password asked again.
  - The farm has an **SMS gateway** (`sms-gateway.ts`), silent until the Owner configures a provider at go-live.
  - **No email:** an Investor is known by their phone, and their portal account's `login_email` is made from it; the app
    sends no email at all.
  - The advisers were asked about electronic signatures in September
    ([Take the structure to a lawyer and a Shariah scholar](../openfarm-investor-projects/issues/11-take-the-structure-to-a-lawyer-and-a-shariah-scholar.md));
    the Owner then kept paper ("no e-signatures", 2026-09-26). The written opinions are not filed in this repo, so what
    they said about it is not known here.
- **Settled while charting (2026-10-08)**, not to be re-asked:
  - **The first meeting stays**: the Owner checks the NID in person and hands over the portal code; it is what makes the
    app's "it is them" trustworthy afterwards. Everything after it is what this map moves into the app.
  - **In scope:** the Agreement and the Amendment, the মনোনয়নপত্র, and a minor's Receiver.
  - **An agreement in the app is sealed with a one-time code** sent to the Investor **both by SMS** to their phone **and
    by email**, where they have one (the Owner, 2026-10-08); entering it from either seals it. In-app agreeing works
    once either channel is set up for that Investor — paper until then. One sealing rule.
  - **The Portal Consent stays on paper**, signed at the first meeting.
  - **The Owner writes a মনোনয়নপত্র and offers it**, as an Agreement is offered; the Investor reads it in the portal and
    agrees. An Investor asking for a change in the portal may come later.
  - **A মনোনয়নপত্র naming a minor stays on paper** to start; a Receiver's SMS consent only if the advisers allow it.
  - **Paper stays available** for every paper, the Owner choosing which way.
  - **The advisers are not asked** (the Owner, 2026-10-08: "ignore advisor, go with your best recommendation"). The
    route is OpenFarm's recommendation, taken on the Owner's word; the September opinions approved stamped paper only, so
    an agreement made in the app rests on the farm's own reading of the law, which the research tickets inform.
- **Domain vocabulary** is in [`CONTEXT.md`](../../CONTEXT.md): **Agreement Offer**, **Nomination**, **Nominee**,
  **Receiver**, **Portal Consent**, **Investment Agreement**, **Amendment**. Grep it before naming anything.
- **Skills:** `/grilling` + `/domain-modeling` for grilling tickets; a background research agent for research tickets.
- **Research** findings are written at `docs/research/<name>.md`; the ticket links them.
- **Standing constraints:** the portal stays read-only except what an Agreement Offer and a Pay-in Note already allow
  (ADR 0007, 0018); the advisers' switches are the Owner's to turn on, never an agent's.

## Decisions so far

<!-- one line per closed ticket: gist + link -->

- [How others take a nomination without paper](issues/04-how-others-take-a-nomination-without-paper.md): every digital
  channel takes a nomination as the holder's act alone, sealed by a code to their phone for low-risk products; nobody
  takes a minor's guardian by SMS — keep a minor's Nomination on paper.
- [Agreeing in the app, in Shariah](issues/03-agreeing-in-the-app-in-shariah.md): valid in principle (Fiqh Academy
  Res. 52 and 230; AAOIFI SS 38), writing and witnesses recommended not required, the code is the confirmation step —
  but the Investor's agreement is the offer, which they may withdraw until the Owner approves.
- [An agreement made in the app, under Bangladeshi law](issues/02-an-agreement-made-in-the-app-under-bangladeshi-law.md):
  valid and provable if the code procedure is agreed in the paper Portal Consent; but an electronic Agreement cannot be
  stamped today, so it is inadmissible until duty and ten times it are paid (s.35) and unstamped execution is finable
  (s.62); a Nomination is probably free of duty.
- [The route, paper by paper](issues/07-the-route-paper-by-paper.md): Agreement, Amendment and মনোনয়নপত্র agreed in the
  app now (a minor's on paper), the stamp risk accepted; sealed by a code by SMS and email, the procedure agreed in the
  Portal Consent; withdrawable until approved; the proof kept and confirmed (ADR 0022).

## Not yet specified

Nothing: the way is clear. The build is planned from [The route, paper by paper](issues/07-the-route-paper-by-paper.md).

## Out of scope

- **Asking the lawyer and the Shariah scholar** — [What the September opinions said about signing electronically](issues/01-what-the-september-opinions-said-about-signing-electronically.md),
  [The questions for the lawyer and the Shariah scholar](issues/05-the-questions-for-the-lawyer-and-the-shariah-scholar.md)
  and [Take the sheet to the advisers](issues/06-take-the-sheet-to-the-advisers.md): the Owner chose not to ask them
  (2026-10-08).

- **Joining without meeting the Owner** (proving identity remotely, sending the code remotely): the first meeting stays.
- **The Portal Consent in the app**: it rides on the meeting that stays.
- **Certificate-based digital signatures** from a licensed certifying authority: costly and slow for each Investor.
- **Paying through the portal**: a separate effort (ADR 0018 keeps money outside it).
- **Paper Agreements stamped by e-challan** may not be "duly stamped" without a registering officer's or the
  Collector's endorsement within a month (Stamp Act s.32), found by
  [An agreement made in the app, under Bangladeshi law](issues/02-an-agreement-made-in-the-app-under-bangladeshi-law.md):
  about Agreements already on paper, not about signing in the app — its own effort.
- **A minor's Receiver agreeing by SMS**: no institution does it; a মনোনয়নপত্র naming a minor stays on paper.
