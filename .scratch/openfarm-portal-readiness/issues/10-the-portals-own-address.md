# 10 — The portal's own address

**What to build:** With `PORTAL_URL` set, the portal answers at its own address. Each address serves only its own people. `/portal` on the farm's address redirects there. The door points each person to their own address once the password is right. Auth, trusted origins and the RPC door are kept apart per address. Unset, everything stays as today.

**Blocked by:** None.

**Status:** built on `feat/portal-own-address`; the two-browser sign-in waits on somebody signing in

**Spec:** [the readiness spec](../spec.md), user stories 38–45.

- [x] `PORTAL_URL` is optional. Unset, `/portal` on the one origin works exactly as now, and the whole existing suite passes.
- [x] better-auth answers on both hosts. The object `baseURL` in 1.7.3 is checked first, and the choice is written down.
- [x] A test shows a request to the farm host's `/api/auth` with the Investor host's `Origin` is refused. **Prove it by switching the check off.** Switched off by trusting the portal's origin on the farm's sign-in: the test went red.
- [x] The RPC door trusts only the host it arrived on. Proved the same way.
- [x] The door, after a right password, turns an Investor away on the farm host and anyone with a Role on the Investor host. Each is told the other address, in their own language. A wrong password gets the same answer on both.
- [x] The Investor host serves only the portal's paths and 404s the rest. The farm host redirects `/portal/*` permanently.
- [x] The Investor host sends a strict CSP.
- [x] The code dialog and the Welcome Letter use `PORTAL_URL`.
- [x] `investors.localhost` works in development.
- [x] The deploy runbook gains the nginx server block, the certificate and the env value.
- [ ] Somebody signs in as the Owner on one host and as an Investor on the other, in one browser, and both stay signed in.

## Checked before starting

- `trustedOrigins` is at `packages/auth/src/index.ts:197`, and `baseURL: authBaseUrl` at :267. The door is `turnAwayWhoseDoorIsShut` / `whyShut` (:74-130), and it already answers only after the password is right.
- The RPC door is `apps/web/src/lib/rpc-door.ts`, which trusts its own origin plus `trustedOrigins`, and `routes/api/rpc/$.ts:50-52`.
- Headers are in `apps/web/src/server.ts`. HSTS already carries `includeSubDomains`.
- The exposure review's section "Would a separate address help?" (`docs/research/portal-exposure-review.md`) lists the costs. ADR 0009 holds the decision.
- Deploy: `docs/runbooks/deploy.md`.

## What was decided while building

- **Two Better Auth instances, not the object `baseURL`.**
  - 1.7.3 has the object `baseURL` (`allowedHosts`, `fallback`, `protocol`).
  - But `getTrustedOrigins` then trusts **every** allowed host on **every** request (`context/helpers.mjs`). A portal page could sign in or act at the farm's `/api/auth`. The two addresses are one site to a browser, so the farm's SameSite=Lax cookie goes with it. That is the one thing ADR 0009 says must not happen.
  - So `createAuth(db, { address, addresses })` makes one per address, each with its own static `baseURL` and only its own origin trusted. `authFor(address)` picks one, and `/api/auth/$` answers by `addressOf(request.url)`.
  - They share the database, the secret and the rate-limit table. Each name keeps its own host-only cookie, so the two sessions never meet.
- **The origin check is on in tests too** (`advanced.disableOriginCheck: false`). Better Auth skips it under `NODE_ENV=test` by default, and it checks only requests that carry a cookie. So the test sends one, as a browser would.
- **Which address a request is for** is `hostOf` in `packages/auth/src/hosts.ts`, read from the request's host. The proxy must pass `Host` (runbook). The code calls them *hosts* (`Host`, `Hosts`, `HOSTS`), because the glossary's *address* is where somebody lives. The ADR's and the pages' words stay "address".
- **The door**: `whyShut` gains `auth.wrongAddress`.
  - After a right password, an Investor at the farm's address, or anybody else at the portal's, is signed out again.
  - The answer is `403`, with `code: "WRONG_ADDRESS"` and `address`, the other address's sign-in page. `WRONG_ADDRESS` is spelled once, in `@OpenFarm/auth/wrong-address`, for the server and the pages.
  - Both sign-in pages show it with a «আপনার ঠিকানায় যান» button (`RefusedNotice`).
  - Staff sign in by email and Investors by phone, so in practice this is met only by somebody typing the other's login by hand.
- **The gate** is `atTheWrongAddress` (`apps/web/src/lib/two-addresses.ts`), run first in `server.ts`.
  - It does what the spec lists.
  - The bare address answers **302** to `/portal`, not 301, so where the front door leads stays the farm's to change.
  - `/_serverFn/*` is let through, because the portal's pages ask who is signed in by the one server function (`getUser`). Server functions are told apart only by a hash of the build, so the gate cannot name it. Instead, a test lists every `createServerFn` in the app and fails on a second.
  - `sw.js` is not let through (ticket 11).
- **What the app's gate cannot stop.** On the built server, Nitro serves `public/` (`/assets/*`, `sw.js`, the icon) before `server.ts` runs, and without its headers. So on the Investor address, `sw.js` answers 200 from the app.
  - The nginx block, which passes only the listed paths, is what refuses it in production.
  - The block also sets `nosniff` and HSTS on `/assets/`, which answers the exposure review's open question 3.1.
  - The gate's list and nginx's are kept in step by hand. The runbook says so.
- **The farm's address still answers `portal.*` calls.** Only the pages redirect. A session made at `/portal` before the address changed goes on working until its 12 hours are up.
- **The CSP** on the Investor address is `default-src 'self'`, with `script-src 'self' 'nonce-…'`, `connect-src 'self'`, `base-uri 'none'`, inline styles and `data:`/`blob:` images.
  - The nonce is made per answer in `server.ts`. It is handed to the app in the request's own start context (`handler.fetch(request, { context })`), never in a header a caller could send. The router's `ssr.nonce` and next-themes' `nonce` put it on the inline scripts.
  - This held in development on `investors.localhost:3003`, and on a production build run on `:3004`: no violations, the page hydrates, and both scripts carry the nonce. The portal's print frame (`srcdoc`) loads its styles under it.
  - A portal page cannot even reach the farm's address, because `connect-src` stops it.
  - The farm's policy is unchanged.
- **The printed address**: once the portal has its own address, it is printed bare (`investors.<farm-domain>`, short enough to type), and the join page is under `/portal/join`.
  - It comes back with the code, as `inviteToPortal`'s `portalOrigin`. The code dialog and the Welcome Letter read the one answer, so they cannot differ, and nothing is kept on the device to go stale.
- **`PORTAL_URL`** must be HTTPS in production, a bare origin, and a different host from `BETTER_AUTH_URL`, or the app refuses to start.
  - It also refuses while `BETTER_AUTH_TRUSTED_ORIGINS` is set, because Better Auth adds those to both instances.
  - Every origin is read as `new URL(…).origin`, so a trailing slash cannot break a match.
- **The two policies are in `lib/content-policy.ts`, with a test.** The portal's fonts are bundled `.woff2` files under `/assets`, and none is inlined as `data:`, so `font-src` falling back to `'self'` holds.
