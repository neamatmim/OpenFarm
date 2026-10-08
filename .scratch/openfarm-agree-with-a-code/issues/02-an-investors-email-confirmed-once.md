# 02 — An Investor's email, confirmed once

**What to build:** An Investor (or an Organization's Signatory) may have an **email** on their record, written by the Owner
at the first meeting, optional. Before any signing code goes to it, it is **confirmed once**: the farm sends a code there
and the Investor enters it in the portal. The farm gains an **email sender** beside its SMS gateway — a provider set at
go-live by environment, silent until then, as the SMS gateway is.

**Blocked by:** —

**Status:** done, pending merge

- [x] `investor.email` and `investor.email_confirmed_at` (migration; move `LATEST_MIGRATION`; apply to both dev DBs).
      Changing the email clears the confirmation. The Owner puts it right like any other detail, the trail keeping it.
- [x] An email transport (`email-gateway.ts`) mirroring `sms-gateway.ts`: env-configured, silent and harmless unset,
      injected so tests use a fake. Decide the provider shape (SMTP vs an HTTP API) and record it.
- [x] Portal: "confirm your email" — send a code, enter it — rate-limited like the farm's other codes (test them one at a
      time: [[rate-limit-tests-send-one-at-a-time]]).
- [x] The portal account page shows the email partly hidden, confirmed or not; the Data Copy lists it.
- [x] Tests: a wrong code is refused and counted; a changed email is unconfirmed; nothing is sent while unset.
- [x] CONTEXT.md **Investor** says the email is optional and confirmed once.
- [x] Somebody opens the Investor sheet and the portal's confirm step, both languages, phone width.

## What was decided while building

- **SMTP, through nodemailer** (`email-gateway.ts`): every provider offers SMTP, a Gmail or Workspace app password
  included, where each HTTP API is shaped its own way. `EMAIL_SMTP_URL` (a connection URL) and `EMAIL_FROM`; unset, the
  transport is `silentEmail` with `sends: false`, and the portal says the farm sends no email instead of offering to.
  nodemailer 10.0.10 ships its own types; added to the lockfile by hand so oxfmt/oxlint stayed put.
- **The pending code is its own table**, `email_code`: one per Investor, hashed, with the address it went to and a
  30-minute life; replaced by the next one sent, gone once entered. A code is checked against the email on the record
  now, so one sent while the Owner changed it confirms nothing (a race test leaves exactly that row).
- **Six digits**, read in Bangla digits too. Ten wrong in a quarter hour stop the Investor (`CODE_ATTEMPTS`, counted
  before checking); sends are one a minute and five an hour (`EMAIL_SENDS`, plus the row's `sentAt`).
- **One email in both languages**, Bangla first: the farm does not know which the reader reads.
- **Changing the email** (`update`) clears the confirmation and the pending code; the same address however typed keeps
  it. A new Signatory (`changeSignatory`) brings their own email, unconfirmed.
- The confirmation is an audited change to the Investor, made by them; the Data Copy lists the email and whether and
  when it was confirmed.
- **Not looked at:** the portal step at phone width — the browser window would not shrink, and the farm refuses to be
  framed. Desktop, both languages, the Owner's sheet and the Preview were looked at.
