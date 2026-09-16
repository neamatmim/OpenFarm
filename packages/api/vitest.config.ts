import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["@OpenFarm/test-harness/global-setup"],
    setupFiles: ["@OpenFarm/test-harness/setup"],
    include: ["src/**/*.test.ts"],
    /**
     * One file at a time.
     *
     * Every test here runs against a real database — which is the point: the rules being
     * tested are rules about a farm, and a fake would not test them. This was turned off
     * because two files running at once fought over one Farm's state: one tuned the
     * escalation window while another was timing an escalation, one swept the Alert
     * watermark into a fake year another was working in, one took the Tag Number a third
     * expected. Those were real flakes, and none of them were bugs in the farm.
     *
     * A Farm per file takes that fight away. What the files still share is the database
     * itself, which those flakes say nothing about either way — so turning them loose again
     * is a change to make on its own, with the suite watched, rather than alongside
     * everything else.
     */
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
