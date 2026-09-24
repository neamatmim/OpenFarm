# What the portal must withstand once strangers can reach it

Status: open

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
