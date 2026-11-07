# 02 — The Owner makes an Application Link

**What to build:** the switch, the link's table, and the Owner's procedures to make, send and withdraw one.

**Blocked by:** 01

- [ ] **`farm.investor_applications`** (boolean, default false) and `investors.setApplicationsOpen`, as
      `setPayInNotes`. Turning it off withdraws no link; a link simply refuses while it is off.
- [ ] **Table `application_link`:** id, farm, kind (person / organization), name, phone, email (lowercased, as
      `emailInput`), `token_hash` (the token
      is shown once, as an invite code is), expires at (7 days), made by / at, withdrawn at / by, used at.
- [ ] **`investors.makeApplicationLink`** (Owner, personal session): refused when the switch is off, the portal is
      shut, the farm cannot text (the consent's code goes by text), or the same name and phone is already an Investor (`theSamePerson`) or has a link or
      Application still open. Answers the address once: `<portal origin>/apply/<token>`.
- [ ] **`investors.sendApplicationLink`** `{ id, by: "email" | "sms" }`: **email** the address to the link's email
      (the Owner's way, 2026-11-08), in Bangla then English as `portal.sentCode.email` is; or text it to the phone.
      Refused when the farm cannot send that way (`context.email.sends` / `context.sms.sends`). One a minute
      (`ONE_SEND_EVERY_MS`), and `EMAIL_SENDS` per link. Says where it went, masked (`maskedEmail`). The email names the
      farm and what the link is for, and nothing else: no Venture, no money, no "invest". The Owner may also copy it.
      Making a link with an email sends it by email at once unless the Owner says not to.
- [ ] **`investors.withdrawApplicationLink`**, until used. **`investors.applications`** lists links and
      Applications with their standing.
- [ ] **Audited** throughout. The token never enters the trail.
- [ ] **Tests**, each proved red with its guard off: emailed to the link's address and no other; email not set up
      refuses `by: "email"`; switch off; portal shut; already an Investor; a second open
      link for one phone; withdrawn after use is refused.
