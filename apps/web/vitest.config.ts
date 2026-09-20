import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
  /** The same `@/` the app and tsconfig use, so a module is not left untestable for importing by it. */
  resolve: {
    alias: { "@": fileURLToPath(new URL("src", import.meta.url)) },
  },
});
