# 03 — They apply

**What to build:** the public procedures the link opens, the Application's tables, and the code that proves the
phone and seals the consent.

**Blocked by:** 02

- [ ] **Public procedures** (`publicProcedure`, the token their only key; nothing answers for a bad, run-out, used or
      withdrawn token, or while the switch or portal is off, and all of those refuse alike so a token cannot be
      probed):
  - `apply.open`: before the code, only the farm's name and the masked mobile. A link emailed to a mistyped address
    must tell a stranger nobody's name (02's email decision). After `apply.checkCode`, the name, kind, the email the
    link went to (to start the form's email box), the Portal Consent wording in force
    (`currentWording`, in the language chosen), and the privacy notice (`theNoticeToRead`).
  - `apply.sendCode`: a 6-digit code by text to the link's phone, 10 minutes, rate-limited with `SIGNING_SENDS` per
    link. Never to any other number.
  - `apply.checkCode`: the code entered, answering a short-lived proof for this link that `apply.open` and
    `apply.send` take; the code stays good for sealing the consent until it runs out.
  - `apply.send`: the whole form, the photos and the code. Checked as `investors.record` checks its input (reuse
    `investorInput`, the phone fixed to the link's), Nominees as `nomineesInput`. Wrong codes counted with
    `CODE_ATTEMPTS`. Uses the link up in the same transaction.
- [ ] **Tables:** `investor_application` (link, the form as sent, sent at, the consent proof: version, code channel,
      IP, browser, the wording's fingerprint as `keepPaper` takes it; the answer: approved / declined / lapsed, at, by,
      the Owner's line, the Investor it became), and `investor_application_photo` kept apart so lists never carry
      it (NID front/back; trade license and authority for an Organization), as `pay_in_note_photo`.
- [ ] **Notice `application_sent`**: immediate, pushed, Owner only, FILLINGS in `domain/notice-words.ts`.
- [ ] **Tests**: `apply.open` names nobody before the code; a token for one phone texts no other; a used link refuses a second send; wrong code ten times
      stops them; photo over the cap or not an image; a Manager is not told; refusals look alike for every bad token.
