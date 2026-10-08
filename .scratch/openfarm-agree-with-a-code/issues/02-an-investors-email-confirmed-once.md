# 02 — An Investor's email, confirmed once

**What to build:** An Investor (or an Organization's Signatory) may have an **email** on their record, written by the Owner
at the first meeting, optional. Before any signing code goes to it, it is **confirmed once**: the farm sends a code there
and the Investor enters it in the portal. The farm gains an **email sender** beside its SMS gateway — a provider set at
go-live by environment, silent until then, as the SMS gateway is.

**Blocked by:** —

**Status:** open

- [ ] `investor.email` and `investor.email_confirmed_at` (migration; move `LATEST_MIGRATION`; apply to both dev DBs).
      Changing the email clears the confirmation. The Owner puts it right like any other detail, the trail keeping it.
- [ ] An email transport (`email-gateway.ts`) mirroring `sms-gateway.ts`: env-configured, silent and harmless unset,
      injected so tests use a fake. Decide the provider shape (SMTP vs an HTTP API) and record it.
- [ ] Portal: "confirm your email" — send a code, enter it — rate-limited like the farm's other codes (test them one at a
      time: [[rate-limit-tests-send-one-at-a-time]]).
- [ ] The portal account page shows the email partly hidden, confirmed or not; the Data Copy lists it.
- [ ] Tests: a wrong code is refused and counted; a changed email is unconfirmed; nothing is sent while unset.
- [ ] CONTEXT.md **Investor** says the email is optional and confirmed once.
- [ ] Somebody opens the Investor sheet and the portal's confirm step, both languages, phone width.
