---
status: accepted
date: 2026-09-25
---

# The Investor Portal has its own address

The portal was built at `/portal` on the farm's own address. There it shares one origin with the staff app, which means one session cookie, one browser storage, one service worker and one set of security headers.

The exposure review ([What the portal must withstand once strangers can reach it](../../.scratch/openfarm-investor-portal/issues/02-what-the-portal-must-withstand-once-strangers-can-reach-it.md), `docs/research/portal-exposure-review.md`) found that a separate address **removes none** of its must-fixes. All of those were fixed on 2026-09-25 anyway. So `/portal` is safe as built.

The Owner decided on 2026-09-25, on the portal map's ticket [Does the portal get its own address?](../../.scratch/openfarm-investor-portal/issues/05-does-the-portal-get-its-own-address.md), that Investors reach it at **`investors.<farm-domain>`** all the same. The decision is made now, before the first **Welcome Letter** prints.

**Why:**

- **The address goes on paper people keep.** Moving it after letters are out leaves every one of them relying on a redirect for good.
- **A shared family phone keeps nothing.** On its own origin, portal sign-out can tell the browser to wipe the origin with `Clear-Site-Data`. On the farm's origin that would also wipe a milker's unsent Outbox. The portal also keeps no stored answers and runs no offline mode there.
- **Separate sessions.** One browser can be signed in to the staff app and the portal at once.
- **A strict CSP of its own.** A policy per path on a shared origin is weak.
- **A smaller surface on that address.** Strangers typing the Investor address reach only the portal's own paths. A flaw in the large staff app does not run on the portal's origin.

**Considered:** `/portal` on the farm's address. It is safe and costs nothing, but it gives up everything above. `invest.<farm-domain>` was rejected because it reads as an invitation to invest, which the standing notice says the portal is not.

**Consequences:**

- Each address serves only its own people:
  - The bare Investor address opens the portal's sign-in. Nothing else of the farm app is served there.
  - `/portal/...` on the farm's address redirects there permanently.
  - The sign-in door, once the password is right, turns an Investor away from the farm's address and staff away from the Investor address, each pointed to their own.
  - The Owner's **Portal Preview** stays inside the Owner's app on the farm's address.
- better-auth must answer on two addresses, with its base URL, trusted origins and the RPC door's origin check kept apart per address. A portal page must never be able to call the farm address's `/api/auth` with the Owner's cookie. That is the one place this can go wrong.
- Go-live needs a second DNS name, its certificate, and an nginx server block that passes only the portal's paths.
