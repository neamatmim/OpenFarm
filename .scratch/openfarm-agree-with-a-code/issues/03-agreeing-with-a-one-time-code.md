# 03 — Agreeing with a one-time code

**What to build:** Every agreement in the app — an **Agreement Offer** and an **Amendment** offer today, a মনোনয়নপত্র in 05 —
is sealed by a **one-time code** sent by SMS to the Investor's phone and by email to their confirmed email; entering
either seals it. The farm keeps the **proof** with the agreement and, once the Owner approves, sends a **confirmation** by
both channels with the paper's number. Refused for an Investor whose consent lacks the signing clause (01) or who has no
channel set up.

**Blocked by:** 01, 02

**Status:** done, pending merge

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

## What was decided while building

- **Two codes, not one:** a text code and a different email code for the same paper, so the code entered says which
  way it came (`signing_code` keeps both hashes and both destinations, mostly hidden). Ten minutes; one send a minute
  per paper and five an hour (`SIGNING_SENDS`); ten wrong in a quarter hour stop them (`CODE_ATTEMPTS`, counted in
  memory before checking, as every code the farm takes). Tries are not a column: guess counts stay in memory
  (production decisions, 2026-09-22).
- **Refusals by name:** `wrong_code`, `code_expired`, `code_used`, `too_many_codes`, `code_sent_just_now`,
  `code_not_sent`, `no_signing_clause`, `no_way_to_send_a_code`, `already_agreed`. Paper refusals (not theirs,
  withdrawn, Venture moved on, paper changed) come before the code is looked at, so they never count as a wrong guess.
- **The proof** is its own table, `signing_proof`, written in the agreement's transaction with the code marked used:
  who, when, channel, destination, code sent at, caller address, browser (`context.callerAgent`, from the request's
  user-agent, cut to 300), and the paper's fingerprint. Shown on the Owner's offer and Amendment lines, in the Data
  Copy's "Agreed in the portal", and as "Agreed {day} with a code sent by text/email" on the copy of the paper.
- **Confirmation** after approval, outside the transaction, by text in the Investor's account language and by email in
  both; the proof records when and which ways went (`confirmedAt`, `confirmedBySms`, `confirmedByEmail`).
- **Readiness:** `investors.list` says `codesBy` for the farm and per Investor. The farm's portal settings say under the
  in-app switch which ways codes go; an Investor's page says, while the switch is on and they are in, whether they can
  agree in the app or what is missing.
- `SmsTransport` gained `sends`, as `EmailTransport` has. Test portal clients text into a kept outbox by default
  (`textsKept`, `codeTextedTo`, `aSigningCode`).
- **Looked at end to end on the seed, 2026-10-08:** the switch turned on at the Owner's word; Hashem replaced his consent
  and agreed by a texted code in Bangla; Kamrul confirmed an email and agreed by the emailed code in English; both
  approved, each told by text (and Kamrul by email). The caller's address shows "—" on a dev server with no proxy in
  front. The switch's words now say the stamp risk is accepted (ADR 0022) instead of waiting on the advisers.
