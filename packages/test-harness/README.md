# @OpenFarm/test-harness

The infrastructure behind the project's **primary test seam**: calling the oRPC router in-process, as a given Role, against a real scratch PostgreSQL. No HTTP, no UI.

## What it provides

- **Global setup** (`global-setup`): starts a `postgres:18` container via testcontainers on a random port (the repo's docker-compose pins 5432, which may be taken), creates one database for the run, applies the migrations from `packages/db/src/migrations`, and sets `DATABASE_URL` so every worker inherits it. Stops the container at the end.
- **Setup file** (`setup`): fails fast if `DATABASE_URL` is missing and fills in test values for the other required env vars before the app's env module loads.
- **`scratchDb()`**: the run's database as a Drizzle client, for asserting at the harness's own seam.
- **`createTestPrincipal(role, now)`**: seeds the deterministic person for a Role — `owner`, `manager`, `staff`, `vet` — once per run, plus a real `session` row for them dated from `now` (7-day lifetime, refreshed on each call), and returns the persisted rows. Permissions are a later ticket; today a Role selects a person.
- **`FakeClock`**: `now()`, `set()`, `advance()` plus `MINUTE`, `HOUR`, `DAY`. Structurally matches the API's `Clock`.

The **router client** lives with the API, not here, so the harness never imports the API: `packages/api/src/test/client.ts` → `createTestClient(router, { as, clock })`.

## Using it in a package

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    globalSetup: ["@OpenFarm/test-harness/global-setup"],
    setupFiles: ["@OpenFarm/test-harness/setup"],
  },
});
```

```ts
const clock = new FakeClock("2026-09-11T05:00:00Z");
const { client } = await createTestClient(appRouter, { as: "manager", clock });
clock.advance(2 * HOUR);
await client.someProcedure();
```

## Rules

- Tests assert what is observable through the seam — a response, a row, an audit event, a gate refusing — never how a module got there.
- One database per run; tests share it, so seed deterministic ids and don't assume an empty table. A Role's person is created once; its session is refreshed from each test's clock, so advancing the clock past 7 days makes the caller unauthenticated — by design.
- Docker must be running. The first run pulls the image.

## Extension points for later tickets

- **Shed Phone device sessions** (ticket 06): add a `createTestDevice()` here that returns a device session plus an active user, and teach `createTestClient` to accept it.
- **Roles → permissions** (ticket 03): `TestPrincipal.role` is the hook.
