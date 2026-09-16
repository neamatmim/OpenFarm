import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["@OpenFarm/test-harness/global-setup"],
    setupFiles: ["@OpenFarm/test-harness/setup"],
    include: ["src/**/*.test.ts"],
    /**
     * One file at a time.
     *
     * Every test here runs against a real database — which is the point: the rules being tested are rules about a
     * farm, and a fake would not test them. Each file now works on a Farm of its own, so files no longer fight over
     * one farm's state; what they still share is the database itself, and turning them loose on it together is a
     * change to make on its own, with the suite watched for flakes rather than alongside everything else.
     */
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
