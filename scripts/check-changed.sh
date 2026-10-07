#!/usr/bin/env bash
# Formats, lints and typechecks what this branch changed: everything since it left main, staged or not, and new
# files under apps/ and packages/. Exits non-zero when any of the three finds a problem, so it can gate a commit.
#
#   pnpm check:changed          check only
#   pnpm check:changed --fix    format the changed files first
#
# Typechecking takes the whole repo (a few seconds), since a change in one package can break the ones that import it.
# Tests are not run here; they need Docker and run per package.
set -uo pipefail

cd "$(git rev-parse --show-toplevel)" || exit 1

fix=false
[ "${1:-}" = "--fix" ] && fix=true

list=$(mktemp)
trap 'rm -f "$list"' EXIT

{
  git diff -z --name-only --diff-filter=ACMR "$(git merge-base HEAD main)"
  git diff -z --name-only --diff-filter=ACMR --cached
  git ls-files -z --others --exclude-standard -- apps packages scripts
} | tr '\0' '\n' | grep -E '\.(ts|tsx|js|jsx|mjs|cjs)$' | sort -u | while IFS= read -r file; do
  [ -f "$file" ] && printf '%s\0' "$file"
done > "$list"

count=$(tr -cd '\0' < "$list" | wc -c | tr -d ' ')
failed=0

if [ "$count" = "0" ]; then
  echo "changed: no code files"
else
  echo "changed: $count code files"
  if $fix; then
    xargs -0 node_modules/.bin/oxfmt < "$list" > /dev/null
  fi

  if unformatted=$(xargs -0 node_modules/.bin/oxfmt --list-different < "$list" 2>&1) && [ -z "$unformatted" ]; then
    echo "format: ok"
  else
    echo "format: FAILED (run with --fix)"
    echo "$unformatted"
    failed=1
  fi

  if lint=$(xargs -0 node_modules/.bin/oxlint --no-error-on-unmatched-pattern < "$list" 2>&1); then
    echo "lint: ok"
  else
    echo "lint: FAILED"
    echo "$lint"
    failed=1
  fi
fi

if types=$(NO_COLOR=1 FORCE_COLOR=0 pnpm check-types 2>&1); then
  echo "types: ok"
else
  echo "types: FAILED"
  echo "$types" | sed 's/\x1b\[[0-9;]*m//g' | grep -E "error TS" || echo "$types"
  failed=1
fi

exit "$failed"
