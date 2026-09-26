# 11 — Nothing kept on the phone

**What to build:** On the Investor address, the portal keeps nothing on the device: no persisted answers, and no service worker. Sign-out sends `Clear-Site-Data`, and so does the first visit after a sign-in has run its day. The manifest stays for Add to home screen. With no connection the portal says so.

**Blocked by:** 10.

**Status:** done on `feat/nothing-kept-on-the-phone`

**Spec:** [the readiness spec](../spec.md), user stories 46–49.

- [x] On the Investor host, `keptOnDevice` is false for every query, and a test says so.
- [x] No service worker registers on the Investor host, and one already there is unregistered.
- [x] The sign-out response carries `Clear-Site-Data` on the Investor host and never on the farm host (the Outbox lives there). **Without `"cookies"`, by the user's decision (below).**
- [x] The ended-sign-in path sends the same header.
- [x] The manifest still serves, so Add to home screen gives an icon to the Investor address. It is a manifest of its own, starting at `/portal`.
- [x] With no connection, the portal shows "no connection", not old figures.
- [x] Somebody signs out and checks, in the browser's site data, that nothing is left. **Done 2026-09-26 on a desktop browser**, on a seed server run with `PORTAL_URL=http://investors.localhost:3003`, signed in as আবুল হাশেম মিয়া. Before sign-out, the kept cache was empty and no service worker was registered. A marker was put into localStorage, and then the Investor signed out from the menu. Afterwards there was no localStorage, sessionStorage, IndexedDB, Cache Storage, service worker, cookie or session, and the Owner at `localhost:3003` was still signed in. Not yet done on a phone.

## Checked before starting

- The persisted cache is `apps/web/src/lib/query-cache.ts` (`keptOnDevice`, 14 days). Portal answers are already not persisted (`forgetWhatThisPhoneRead` runs at portal sign-out, in `portal-shell.tsx` and `_in.tsx`).
- The service worker is registered in `apps/web/src/lib/install.ts:26` (`/sw.js`, scope `/`).
- The 12-hour end is `signInHasRunItsDay` / `endSignIn` (`portal-store.ts:406-421`), then login with `ended`.

## What was decided while building

- **No `"cookies"` in the wipe, by the user's choice (2026-09-26).**
  - A browser clears cookies for the whole registered domain, subdomains included. So a portal sign-out at `investors.farm.tld` would also sign that browser out of `farm.tld`.
  - The wipe is `"cache", "storage"`. Better Auth's sign-out deletes the portal's own session cookie.
  - A sign-in that has run its day is already expired at the server when the ended page wipes.
  - This could not be seen locally, because `localhost` has no public suffix.
- **Which address a page is on is stamped by the server** on `<html data-host>`, from the request's start context (`lib/page-context.ts`, which was `nonce.ts`). The browser reads it back (`pageHost`). It never learns `PORTAL_URL` itself.
- **The cache:**
  - `keptOnDevice(query, host)` is false for everything on the portal's address.
  - `keepQueriesOnDevice` does not persist there. It deletes the `openfarm-queries` database outright, because opening it to empty it would make one where there was none.
- **Service workers:** the root unregisters every registration on the portal's address (`forgetShell`). The wipe's `"storage"` takes them too. Nothing on that address ever registers one; only `_auth` does.
- **The wipe** is `wipesTheDevice` and `withTheWipe` (`lib/wipe.ts`, tested with a real `Response`), applied in `server.ts`. It covers POST `/api/auth/sign-out`, and `/portal/login?ended=true` (`ENDED_SIGN_IN_PAGE`), on the portal's address only.
- **Leaving a sign-in that has run its day** is `leaveTheEndedSignIn` (`lib/ended-sign-in.ts`).
  - It forgets what was read. Then, on the portal's address, it replaces the page with the ended sign-in page and waits for it, so the server answers and wipes, and nothing is drawn meanwhile. On the farm's address it stays a client redirect, as before.
  - The layout's guard uses it at the next page.
  - `PortalShell` also watches every question: the first one answered `signed_in_too_long` leaves at once. A tab left open past its day does not go on showing its figures.
  - The page's own path could not be driven here, since that needs a sign-in 12 hours old. The server's answer to `/portal/login?ended=true` was checked instead: it carries the wipe.
- **Clearing takes a few seconds.** Chrome holds the sign-out answer while it clears, so the portfolio stays on screen for those seconds before the sign-in page. Left as it is.
- **The manifest:** the farm's manifest starts at `/today`, which the portal's address answers 404. So that address links `/portal.webmanifest`, which starts at `/portal`. The gate and the nginx block pass it instead of the farm's.
- **No connection:**
  - `useOnline` (`lib/online.ts`) watches the browser's online and offline events.
  - While offline, `PortalShell` shows «সংযোগ নেই» in place of the page, so figures the tab read earlier are not shown as today's. The page comes back with the connection.
  - The Preview uses the same shell, so it does the same.
  - It was checked by telling the page it was offline, not by pulling a phone's signal. The window could not be narrowed to phone width.
  - A phone on a signal too weak to answer, while the browser still says it is online, is not caught. Its questions fail, and the page shows what it read until they do.
