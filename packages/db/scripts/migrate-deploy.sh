#!/usr/bin/env bash
# Migrates the farm's own database, and only that: named out loud in PRODUCTION_DATABASE_URL, never read from the
# .env this machine keeps for its own development database.
set -euo pipefail

url="${PRODUCTION_DATABASE_URL:-}"
if [ -z "$url" ]; then
  echo "Name the farm's database: PRODUCTION_DATABASE_URL=postgresql://… pnpm --filter @OpenFarm/db db:migrate:deploy" >&2
  exit 1
fi
case "$url" in
  *@localhost[:/]* | *@127.0.0.1[:/]* | *@\[::1\][:/]*)
    echo "PRODUCTION_DATABASE_URL names this machine; the farm's database is not here." >&2
    exit 1
    ;;
esac

# Every migration not yet applied runs in one transaction. Waiting behind the app's work for a lock, it would hold every
# request queued behind it in turn; five seconds, and it gives up instead — nothing applied, run it again.
separator="?"
case "$url" in *\?*) separator="&" ;; esac
DATABASE_URL="${url}${separator}options=-c%20lock_timeout%3D5s" exec drizzle-kit migrate
