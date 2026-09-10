# 01 — Test harness & scratch database

**What to build:** Running `pnpm test` starts a scratch PostgreSQL 18 from the repo's docker-compose (one database per run, dropped afterwards), migrates it with drizzle-kit, and runs the test suite with vitest through vite-plus. The first test calls a procedure through the in-process oRPC client (`createRouterClient`) as the Owner and passes. This is the primary test seam the spec names; every later ticket adds tests to it.

**Blocked by:** None — can start immediately

**Status:** done (2026-09-10)

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 1.

- [x] `pnpm test` works from a clean checkout with Docker running; no manual database setup
- [x] A helper creates a router client for a given Role (Owner, Manager, Staff, Vet) and, for later tickets, a Shed Phone device session plus active user
- [x] A controllable clock is injected into the context so time-based rules can be tested deterministically
- [x] One passing test proves the seam: a procedure called as Owner returns the expected result and the scratch database was used
- [x] The harness is documented in a short README next to the tests; the two research and two prototype branches are left untouched

**Done note:** implemented on `main` as `@OpenFarm/test-harness` + `packages/api/src/test/client.ts`. One deviation from the wording above: the scratch database is started through testcontainers on a random port using the same `postgres:18` image, not via the repo's docker-compose, because compose hard-pins 5432 (occupied on the dev machine). Extension points for tickets 03 (Roles → permissions) and 06 (Shed Phone device sessions) are named in the harness README.
