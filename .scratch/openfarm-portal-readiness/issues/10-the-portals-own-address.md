# 10 — The portal's own address

**What to build:** With `PORTAL_URL` set, the portal answers at its own address. Each address serves only its own people. `/portal` on the farm's address redirects there. The door points each person to their own address once the password is right. Auth, trusted origins and the RPC door are kept apart per address. Unset, everything stays as today.

**Blocked by:** None.

**Status:** open

**Spec:** [the readiness spec](../spec.md), user stories 38–45.

- [ ] `PORTAL_URL` is optional. Unset, `/portal` on the one origin works exactly as now, and the whole existing suite passes.
- [ ] better-auth answers on both hosts. The object `baseURL` in 1.7.3 is checked first, and the choice is written down.
- [ ] A test shows a request to the farm host's `/api/auth` with the Investor host's `Origin` is refused. **Prove it by switching the check off.**
- [ ] The RPC door trusts only the host it arrived on.
- [ ] The door, after a right password, turns an Investor away on the farm host and anyone with a Role on the Investor host. Each is told the other address, in their own language. A wrong password gets the same answer on both.
- [ ] The Investor host serves only the portal's paths and 404s the rest. The farm host redirects `/portal/*` permanently.
- [ ] The Investor host sends a strict CSP.
- [ ] The code dialog and the Welcome Letter use `PORTAL_URL`.
- [ ] `investors.localhost` works in development.
- [ ] The deploy runbook gains the nginx server block, the certificate and the env value.
- [ ] Somebody signs in as the Owner on one host and as an Investor on the other, in one browser, and both stay signed in.

## Checked before starting

- `trustedOrigins` is at `packages/auth/src/index.ts:197`, and `baseURL: authBaseUrl` at :267. The door is `turnAwayWhoseDoorIsShut` / `whyShut` (:74-130), and it already answers only after the password is right.
- The RPC door is `apps/web/src/lib/rpc-door.ts`, which trusts its own origin plus `trustedOrigins`, and `routes/api/rpc/$.ts:50-52`.
- Headers are in `apps/web/src/server.ts`. HSTS already carries `includeSubDomains`.
- The exposure review's section "Would a separate address help?" (`docs/research/portal-exposure-review.md`) lists the costs. ADR 0009 holds the decision.
- Deploy: `docs/runbooks/deploy.md`.
