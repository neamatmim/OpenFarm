# 11 — Nothing kept on the phone

**What to build:** On the Investor address, the portal keeps nothing on the device: no persisted answers, and no service worker. Sign-out sends `Clear-Site-Data`, and so does the first visit after a sign-in has run its day. The manifest stays for Add to home screen. With no connection the portal says so.

**Blocked by:** 10.

**Status:** open

**Spec:** [the readiness spec](../spec.md), user stories 46–49.

- [ ] On the Investor host, `keptOnDevice` is false for every query, and a test says so.
- [ ] No service worker registers on the Investor host, and one already there is unregistered.
- [ ] The sign-out response carries `Clear-Site-Data: "cache", "cookies", "storage"` on the Investor host and never on the farm host (the Outbox lives there).
- [ ] The ended-sign-in path sends the same header.
- [ ] The manifest still serves, so Add to home screen gives an icon to the Investor address.
- [ ] With no connection, the portal shows "no connection", not old figures.
- [ ] Somebody signs out on a phone and checks, in the browser's site data, that nothing is left.

## Checked before starting

- The persisted cache is `apps/web/src/lib/query-cache.ts` (`keptOnDevice`, 14 days). Portal answers are already not persisted (`forgetWhatThisPhoneRead` runs at portal sign-out, in `portal-shell.tsx` and `_in.tsx`).
- The service worker is registered in `apps/web/src/lib/install.ts:26` (`/sw.js`, scope `/`).
- The 12-hour end is `signInHasRunItsDay` / `endSignIn` (`portal-store.ts:406-421`), then login with `ended`.
