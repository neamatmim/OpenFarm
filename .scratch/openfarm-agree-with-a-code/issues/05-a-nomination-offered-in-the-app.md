# 05 — A মনোনয়নপত্র offered in the app

**What to build:** The Owner writes a মনোনয়নপত্র as today and, instead of printing it, **offers** it in the app; the
Investor reads it in the portal and agrees with the code (03); the Owner approves, and it becomes the list in force — a
Nomination made in the app, its kept paper the proof, no photo needed. One naming a **minor** is refused in the app: it
stays on paper, as the market does.

**Blocked by:** 03

**Status:** done, pending merge

- [x] A Nomination offer, following the Agreement Offer's pattern (kept paper, fingerprint, offered/agreed/approved),
      and a Nomination `how` for one made in the app.
- [x] Refused with a minor among the Nominees, and for an Organization (it names none).
- [x] The Nominees section and the history say where the list came from: "agreed in the app on <day>".
- [x] Withdrawing (04) applies to it too.
- [x] CONTEXT.md **Nomination** says it may be agreed in the app.
- [x] Somebody offers, agrees to and approves one on the seed, both languages.

## What was decided while building

- **`nomination_offer`**, as `agreement_offer` (paper + fingerprint, offered/agreed/approved/withdrawn,
  `agreement_withdrawn_at`), one standing per Investor (a partial unique index and a refusal,
  `nomination_offer_standing`). Approved, it writes a Nomination `how: "in_app"`, signed on the day agreed, its Version
  the offer's; `nomination_offer.nomination_id` links the two. No photo is asked of it.
- **Refused:** a list naming a minor on the day offered (`minor_signs_on_paper`), an Organization
  (`organization_names_no_nominee`), the switch off, an Investor not in the portal; approval of one not agreed, withdrawn,
  or older than a paper on file (`signed_before_in_force`). Approval re-reads it behind the Farm lock, which the
  Investor's withdrawal takes too.
- **Signing Codes and proofs** take a third kind, `nomination_offer`; the approval is texted and emailed with the paper's
  number and no Venture ("your মনোনয়নপত্র no. X is approved").
- **Screens:** the মনোনয়নপত্র sheet offers it in the app beside Print while the switch is on and they are in the portal,
  saying why not for a minor; the Nominees section shows the offer waiting, its proof, Approve and Withdraw; the portal's
  home shows it to read and agree to, and to withdraw once agreed; the history reads "মনোনয়নপত্র agreed in the app".
  The Data Copy lists it under "Agreed in the portal" with how it was sealed.
- **Looked at on the seed, 2026-10-09, at phone width:** the Owner offered Hashem a মনোনয়নপত্র from the sheet ("অ্যাপে
  পাঠান"); he read it in the portal in English, agreed with the texted code, and was offered "Withdraw my agreement"; the
  Owner approved it from the Nominees section, which now reads "…অ্যাপে কোড দিয়ে সম্মত মনোনয়নপত্র" with no photo asked
  for; the approval text named the paper and its number.
- **After the code review (2026-10-09):** approval re-checks the Investor (a retired one is refused, `investor_retired`)
  and writes the offer's own approval event; the one-at-a-time check runs behind the Farm lock, so two offers sent at
  once refuse the second by name; the Bangla code text says «মনোনয়নপত্রে» (`signing.paperIn.*`); an approved
  মনোনয়নপত্র is refused in the portal as `nomination_approved`, worded as the list in force; the approval words are
  chosen by the kind of paper; the sheet offers it only while the portal is open; "names a minor" is one domain rule
  (`namesAMinor`) for the sheet and the server. **Left:** the three offer stores (Agreement, Amendment, মনোনয়নপত্র)
  repeat one lifecycle — a shared one is its own refactor.
