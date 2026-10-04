#!/usr/bin/env bash
# Pushes the schema straight to a development database on this machine, and refuses any other: a database somebody
# keeps is changed only by migrations, which say what they did and can be read before they run.
set -euo pipefail

if [ -f ../../apps/web/.env ]; then
  set -a
  # shellcheck disable=SC1091
  . ../../apps/web/.env
  set +a
fi
case "${DATABASE_URL:-}" in
  *@localhost[:/]* | *@127.0.0.1[:/]* | *@\[::1\][:/]*) exec drizzle-kit push ;;
esac
echo "db:push changes only a database on this machine; migrate any other." >&2
exit 1
