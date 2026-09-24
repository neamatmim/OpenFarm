# Does the portal get its own address?

Status: open

Type: grilling

Blocked by: 02

Map: [OpenFarm investor portal: the first real Investor in](../map.md)

## Question

The portal lives at `/portal` on the same origin as the farm's own app, so the two share cookies, sessions and security headers. Decide whether, once the farm is live, Investors reach it at its own address (a subdomain such as `investors.<farm-domain>`) or at `/portal` on the farm's address. Weigh:
- **Separate sessions:** on one origin, a shared phone or browser keeps one session. On 2026-09-25 an Investor's sign-in sent the Owner to `/portal`.
- **Headers and exposure:** stricter headers for the portal alone, and whether the farm's own screens become reachable by strangers on a separate origin.
- **What the address says on the welcome sheet.**
- **What it costs:** a second certificate, the auth cookie's domain, and better-auth's trusted origins.

The exposure review (ticket 02) informs it. The answer feeds the welcome sheet (ticket 04) and the farm's go-live checklist, which is outside this map.
