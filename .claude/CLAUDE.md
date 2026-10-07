# OpenFarm

- **Vocabulary**: `CONTEXT.md` is the glossary. Name things with its words, and grep it before coining one.
- **Decisions**: `docs/adr/` records why the design is as it is; read the matching ADR before changing that design.
- **Checks**: `pnpm check:changed --fix` formats, lints and typechecks what the branch changed since main, and exits
  non-zero on any problem. Run it after the last file is written, then commit in a separate call. A pre-commit hook
  refuses unformatted or unlinted staged code.
- **Formatter**: oxfmt with `oxfmt.config.ts`, which the Write/Edit hook runs on the edited file. Format a file
  edited from the shell with `node_modules/.bin/oxfmt <files>`.
- **Lint rules**: oxlint with Ultracite's preset (`oxlint.config.ts`); the linter is the source of truth for code
  style. Vendored or generated files are exempted there, each with its reason.
