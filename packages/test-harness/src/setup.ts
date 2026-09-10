// Vitest setup file: runs in each worker before the test file's imports, so the
// app's env module validates against test values rather than apps/web/.env.
// DATABASE_URL is inherited from the global setup's process.
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set: the test-harness global setup must run before tests"
  );
}
process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-1234";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.NODE_ENV = "test";
