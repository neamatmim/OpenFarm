# 02 — The Owner makes an Application Link

**What to build:** the switch, the link's table, and the Owner's procedures to make, send and withdraw one.

**Blocked by:** 01

**Status:** done (2026-11-08); the switch's place on Farm settings → Portal is in 06

- [x] **`farm.investor_applications`** (boolean, default false) and `investors.setApplicationsOpen`, as
      `setPayInNotes`. Turning it off withdraws no link; a link simply refuses while it is off.
- [x] **Table `application_link`:** id, farm, kind (person / organization), name, phone, email (lowercased, as
      `emailInput`), `token_hash` (the token
      is shown once, as an invite code is), expires at (7 days), made by / at, withdrawn at / by, used at.
- [x] **`investors.makeApplicationLink`** (Owner, personal session): refused when the switch is off, the portal is
      shut, the farm cannot text (the consent's code goes by text), or the same name and phone is already an Investor (`theSamePerson`) or has a link or
      Application still open. Answers the address once: `<portal origin>/apply/<token>`.
- [x] **`investors.sendApplicationLink`** `{ id, by: "email" | "sms" }`: **email** the address to the link's email
      (the Owner's way, 2026-11-08), in Bangla then English as `portal.sentCode.email` is; or text it to the phone.
      Refused when the farm cannot send that way (`context.email.sends` / `context.sms.sends`). One a minute
      (`ONE_SEND_EVERY_MS`), and `EMAIL_SENDS` per link. Says where it went, masked (`maskedEmail`). The email names the
      farm and what the link is for, and nothing else: no Venture, no money, no "invest". The Owner may also copy it.
      Making a link with an email sends it by email at once unless the Owner says not to.
- [x] **`investors.withdrawApplicationLink`**, until used. **`investors.applications`** lists links and
      Applications with their standing.
- [x] **Audited** throughout. The token never enters the trail.
- [x] **Tests**, each proved red with its guard off: emailed to the link's address and no other; email not set up
      refuses `by: "email"`; switch off; portal shut; already an Investor; a second open
      link for one phone; withdrawn after use is refused.

**As built:** `schema/application.ts` (`application_link`, `kind_known` check by hand), `farm.investor_applications`,
migration `20261107192145_application_links`. `api/src/application-links.ts`; procedures under
`investors.applications.*` (`routers/applications.ts`): `links`, `makeLink`, `sendLink`, `withdrawLink`, plus
`investors.setApplicationsOpen` and `applicationsOpen` on `investors.list`. Sending again makes a new secret, so the
address sent before stops opening. A made link stands even if its email fails (`sent: null`). Words
`portal.apply.link.*`. Found by the tests: the Bangla text glued "-এ" onto the address, so a phone would open a broken
link; the address now ends the text on its own line.
