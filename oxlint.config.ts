import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import tanstack from "ultracite/oxlint/tanstack";

export default defineConfig({
  extends: [core, react, tanstack],
  ignorePatterns: [
    ...core.ignorePatterns,
    // shadcn's components and hook, kept in shadcn's own style so a `shadcn add` over one reads as a small diff.
    "packages/ui/src/components/**",
    "packages/ui/src/hooks/use-mobile.ts",
    // drizzle-kit and defineRelations need one module exporting every table.
    "packages/db/src/schema/index.ts",
  ],
  overrides: [
    {
      // better-auth's schema: `/* @__PURE__ */` marks for the bundler sit inline by nature.
      files: ["packages/db/src/schema/auth.ts"],
      rules: { "no-inline-comments": "off" },
    },
    {
      // Declares a global Nitro injects at build time, which is the point of the file.
      files: ["apps/web/server/nitro-auto-imports.d.ts"],
      rules: { "no-implicit-globals": "off" },
    },
  ],
});
