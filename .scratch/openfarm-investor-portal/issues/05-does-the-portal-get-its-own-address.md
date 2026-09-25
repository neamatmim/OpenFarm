# Does the portal get its own address?

Status: done

Assignee: Neamat Khan Mim

Type: grilling

Blocked by: 02

Map: [OpenFarm investor portal: the first real Investor in](../map.md)

## Question

The portal lives at `/portal` on the same origin as the farm's own app, so the two share cookies, sessions and security headers. Decide whether, once the farm is live, Investors reach it at its own address (a subdomain such as `investors.<farm-domain>`) or at `/portal` on the farm's address. Weigh:
- **Separate sessions:** on one origin, a shared phone or browser keeps one session. On 2026-09-25 an Investor's sign-in sent the Owner to `/portal`.
- **Headers and exposure:** stricter headers for the portal alone, and whether the farm's own screens become reachable by strangers on a separate origin.
- **What the address says on the Welcome Letter.** Its QR and printed address go to the portal's front door, the one address the Investor keeps using (ticket 04).
- **What it costs:** a second certificate, the auth cookie's domain, and better-auth's trusted origins.

The exposure review (ticket 02) informs it. The answer feeds the Welcome Letter (ticket 04, done) and the farm's go-live checklist, which is outside this map.

## Resolution

Grilled with the Owner, 2026-09-25. Recorded as [ADR 0009: The Investor Portal has its own address](../../../docs/adr/0009-the-investor-portal-has-its-own-address.md). The **Investor Portal** entry in [`CONTEXT.md`](../../../CONTEXT.md) now says so.

- **Its own address: `investors.<farm-domain>`.** It is decided now and built before the first Welcome Letter prints, because the address goes on paper people keep. `/portal` was safe as built (ticket 02 found the subdomain removes no must-fix), and the Owner chose the depth anyway. `portal.` says nothing about whose portal it is. `invest.` reads as an invitation to invest, which the notice says the portal is not. A Bangla word in Latin letters has no one spelling.
- **Each address serves only its own people.**
  - The bare Investor address opens the portal's sign-in, which is where the Welcome Letter's QR points. Only the portal's own pages and calls are served there; everything else is not found.
  - `/portal/...` on the farm's address redirects permanently to the same page on the Investor address.
  - The door checks the address as well as the person, only after the password is right. An Investor on the farm's address is told their own address, with a link, and staff on the Investor address are told the farm's. A wrong password gets the same answer everywhere, as now.
  - The Portal Preview stays inside the Owner's app on the farm's address.
- **Nothing is kept on the phone.**
  - The Investor address has no persisted answers and no offline mode.
  - At sign-out, `Clear-Site-Data: "cache", "cookies", "storage"` is sent.
  - The same wipe happens on the next visit after the 12-hour sign-in has run its day.
  - "Add to home screen" still works, as an icon that stores nothing.
  - With no signal, the portal says so rather than showing old figures.

**Work handed off with the build:**
- better-auth on two addresses: a per-request base URL, and trusted origins and the RPC door's origin check kept apart per address. A portal page must never be able to call the farm address's `/api/auth` with the Owner's cookie.
- A strict CSP on the Investor address.
- The door's per-address turn-away.
- The `/portal` redirect.
- The storage rules above.
- The code dialog and the Welcome Letter printing the Investor address.
- A local-development equivalent (e.g. `investors.localhost`).

**For the farm's go-live checklist**, outside this map: a second DNS name, its certificate, and an nginx server block that passes only the portal's paths.
