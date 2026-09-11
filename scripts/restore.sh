#!/usr/bin/env bash
#
# Rebuilds a scratch copy of the farm from a backup, and proves it is really there.
#
# Never points at anything but a scratch database: restoring is how a drill is done, and a
# drill that could touch the live farm is not a drill. The script refuses a target that does
# not say "scratch" in its name.
#
#   scripts/restore.sh openfarm-nightly-20260911T000000Z.sql.age postgres://…/openfarm_scratch
#
set -euo pipefail

missing=""
for tool in psql age rclone; do
  command -v "$tool" >/dev/null 2>&1 || missing="$missing $tool"
done
if [ -n "$missing" ]; then
  echo "restore cannot run: missing$missing" >&2
  exit 1
fi

BACKUP_NAME="${1:?usage: restore.sh <backup-file-name> <scratch database url>}"
TARGET_URL="${2:?usage: restore.sh <backup-file-name> <scratch database url>}"
: "${BACKUP_AGE_IDENTITY:?BACKUP_AGE_IDENTITY is required (path to the age private key)}"
: "${BACKUP_DESTINATION:?BACKUP_DESTINATION is required (an rclone remote)}"

case "$TARGET_URL" in
  *scratch*) ;;
  *)
    echo "refusing: the target does not look like a scratch database" >&2
    echo "a restore drill that could touch the live farm is not a drill" >&2
    exit 1
    ;;
esac

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

kind="${BACKUP_NAME#openfarm-}"
kind="${kind%%-*}"

echo "fetching $BACKUP_NAME…"
rclone copy "$BACKUP_DESTINATION/$kind/$BACKUP_NAME" "$work/"

echo "decrypting…"
age --decrypt --identity "$BACKUP_AGE_IDENTITY" "$work/$BACKUP_NAME" > "$work/restore.sql"

echo "restoring into the scratch database…"
psql "$TARGET_URL" -v ON_ERROR_STOP=1 -q <<SQL
drop schema if exists public cascade;
create schema public;
SQL
psql "$TARGET_URL" -v ON_ERROR_STOP=1 -q -f "$work/restore.sql"

echo "checking the farm is really there…"
DATABASE_URL="$TARGET_URL" pnpm --filter @OpenFarm/test-harness verify:restore

echo
echo "restored $BACKUP_NAME into the scratch database, and it holds a farm."
echo "now the part a script cannot do: open the app against it and look."
