import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["@OpenFarm/test-harness/global-setup"],
    setupFiles: ["@OpenFarm/test-harness/setup"],
    include: ["src/**/*.test.ts"],
    /**
     * One file at a time.
     *
     * Every test here runs against one real database holding one Farm — which is the point:
     * the rules being tested are rules about a farm, and a fake would not test them. But a
     * farm has farm-wide state, and two files running at once fight over it: one tunes the
     * escalation window while another is timing an escalation, one sweeps the Alert
     * watermark into a fake year another is working in, one takes the Tag Number a third
     * expected. Those were real flakes, and none of them were bugs in the farm.
     *
     * The suite takes longer and says the same thing every time, which is the trade worth
     * making for tests anyone is meant to believe.
     */
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
