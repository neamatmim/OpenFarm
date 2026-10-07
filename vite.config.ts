import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: {
    ignorePatterns: [
      "node_modules/**",
      "**/node_modules/**",
      "apps/web/dist/**",
      "apps/web/.vinxi/**",
      "apps/web/.tanstack/**",
      "apps/web/src/routeTree.gen.ts",
      "packages/db/dist/**",
      "packages/db/src/migrations/**",
      // drizzle-kit and defineRelations need one module exporting every table
      "packages/db/src/schema/index.ts",
    ],
    options: {
      typeAware: false,
      typeCheck: false,
    },
  },
  fmt: {
    ignorePatterns: [
      "node_modules/**",
      "**/node_modules/**",
      "apps/web/dist/**",
      "apps/web/.vinxi/**",
      "apps/web/.tanstack/**",
      "apps/web/src/routeTree.gen.ts",
      "packages/db/dist/**",
      "packages/db/src/migrations/**",
    ],
    singleQuote: false,
    semi: true,
    sortPackageJson: true,
  },
  // Run by .vite-hooks/pre-commit. Checks only, so a commit never rewrites a file behind the committer's back; the
  // repo's formatter is oxfmt with oxfmt.config.ts (`vp fmt` wraps at a different width). Fix with
  // `pnpm check:changed --fix`.
  staged: {
    "*.{ts,tsx,js,jsx,mjs,cjs}": [
      "oxfmt --check",
      "oxlint --no-error-on-unmatched-pattern",
    ],
  },
});
