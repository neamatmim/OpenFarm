# What the portal must withstand once strangers can reach it

Status: done

Type: research

Blocked by: —

Map: [OpenFarm investor portal: the first real Investor in](../map.md)

## Question

Today only the farm's own people can reach the app. Once the portal is live, anyone on the internet can reach `/portal/login` and `/portal/join`, and `portal.join` is a public procedure. Against a recognised baseline (OWASP ASVS level 1, or its current equivalent), read the portal's surface in this repo and list what it already does and what it lacks. The surface:
- `packages/auth` (the door hooks, rate limits, sessions, cookies)
- `packages/api/src/portal-store.ts` and `routers/portal.ts`
- `apps/web/src/routes/portal`

Cover at least:
- **Guessing:** codes, passwords and phone enumeration through the different answers `join` and sign-in give.
- **Session handling:** cookie flags, the 12-hour end, signing out, a shared phone.
- **Security headers:** CSP and frame-ancestors on the portal pages.
- **Printed papers:** what their HTML can carry.
- **Leaks:** what the error bodies give away.
- **Staff and Investors on one address:** what it means that both sign in on the same origin. On 2026-09-25 a browser signed in as an Investor sent the Owner's pages to `/portal`.

Findings go in `docs/research/portal-exposure-review.md`, each item marked *has*, *lacks* or *n/a*, with the file it was read from. The findings decide whether the portal gets its own address (ticket 05), and what must be fixed before the first Investor.

## Resolution

Resolved 2026-09-25 by research, against OWASP ASVS 5.0.0 level 1. The findings are in [`docs/research/portal-exposure-review.md`](../../../docs/research/portal-exposure-review.md) (merge 70bb630).

**Must fix before the first Investor:**

1. **A mistyped `join` writes the password into the server log.** The RPC handler logs every failure whole (`apps/web/src/routes/api/rpc/$.ts:15-21`). On a validation failure, oRPC attaches the input. The review confirmed this with a probe, and it was read again on 2026-09-25. The staff password-by-code procedure has the same problem. This one is live for staff today too, not only the portal.
2. **What an Investor read stays on the phone after they sign out.** The 14-day IndexedDB cache is not cleared at portal sign-out or at the 12-hour end (ASVS 14.3.1).
3. **Sign-in names Investor phones without the password.** The door hook answers `403 portal.closed` before the password is checked; every other phone gets 401.
4. **`portal.join` has no per-address limit.** Its per-phone counter grows without bound.
5. **Common passwords are accepted** (ASVS 6.2.4).

**Should fix:**
- end Investor sessions at 12 hours inside better-auth, with `rememberMe: false`
- count sign-in failures per account, with a back-off
- a nonce `script-src` and `connect-src` in the CSP, and headers at the proxy
- block `/update-user` renames
- use up the code before setting the password
- drop the leftover `privateData` procedure
- the staff sign-out's cache gap.

**Already sound:**
- framing is refused (`frame-ancestors 'none'`, `X-Frame-Options: DENY`)
- printed papers are escaped text.

**Go-live checks:**
- the proxy must *set* `X-Forwarded-For`, not append to it
- static assets must carry the headers.

**On the portal's own address (feeds ticket 05):** a subdomain reduces four findings and removes none, so the must-fix list is the same either way. It reduces:
- separate storage, which lets `Clear-Site-Data` be sent at sign-out
- separate sessions, which ends the redirect seen on 2026-09-25
- a smaller reach for one flaw
- a CSP that means something.

It costs:
- a certificate
- a per-host better-auth base URL
- `trustedOrigins` kept apart
- one more address on the welcome sheet.
