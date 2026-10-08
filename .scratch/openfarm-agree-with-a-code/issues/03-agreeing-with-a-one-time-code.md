# 03 — Agreeing with a one-time code

**What to build:** Every agreement in the app — an **Agreement Offer** and an **Amendment** offer today, a মনোনয়নপত্র in 05 —
is sealed by a **one-time code** sent by SMS to the Investor's phone and by email to their confirmed email; entering
either seals it. The farm keeps the **proof** with the agreement and, once the Owner approves, sends a **confirmation** by
both channels with the paper's number. Refused for an Investor whose consent lacks the signing clause (01) or who has no
channel set up.

**Blocked by:** 01, 02

**Status:** open

- [ ] A `signing_code` table: what it seals (the offer and its kind), the code's hash, sent when and where (each
      channel, the destination partly hidden), expires (minutes, decide), tries, used when.
- [ ] Portal: "send me a code" for an offer, then "agree" with the code. `agreeToOffer` / `agreeToAmendment` take the code;
      a wrong, expired or used code is refused by name. Rate-limited.
- [ ] The proof kept with the agreement: who, when, which channel the entered code came by, the destination partly
      hidden, the device's address and agent, and the paper's fingerprint (already `paperHash`). Shown to the Owner on
      the offer and in the Data Copy.
- [ ] On approval, a confirmation by SMS and email: "your Agreement no. X for Venture Y is approved".
- [ ] The kept paper's copy says it was agreed in the app with a code, on what day, by which channel.
- [ ] Readiness: the Owner's screen says what in-app agreeing still needs on this farm (the switch, a gateway or an email
      sender) and for this Investor (the clause, a channel).
- [ ] Tests for each refusal, and prove the code guard by switching it off ([[prove-a-guard-by-switching-it-off]]).
- [ ] CONTEXT.md **Agreement Offer** says how it is sealed.
- [ ] Somebody agrees to an offer end to end on the seed (the switch turned on by the Owner, not by an agent).
