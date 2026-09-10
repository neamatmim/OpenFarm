import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["@OpenFarm/test-harness/global-setup"],
    setupFiles: ["@OpenFarm/test-harness/setup"],
    include: ["src/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
