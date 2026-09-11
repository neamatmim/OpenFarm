#!/usr/bin/env bash
#
# Rebuilds a scratch copy of the farm from a backup, and proves it is really there.
#
# Never points at anything but a scratch database: restoring is how a drill is done, and a
# drill that could touch the live farm is not a drill.
#
#   scripts/restore.sh openfarm-nightly-20260911T000000Z.sql.age \
#     postgres://user:pass@host:5432/openfarm_scratch
#
set -euo pipefail

missing=""
for tool in psql age rclone pnpm; do
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

# The database's *name*, not the whole URL. A password that happens to contain "scratch", or
# a host called scratch-01, would otherwise wave through a drop of the live farm's schema.
target_db="${TARGET_URL##*/}"
target_db="${target_db%%\?*}"
case "$target_db" in
  *scratch*) ;;
  *)
    echo "refusing: the database is named '${target_db}', which is not a scratch database" >&2
    echo "a restore drill that could touch the live farm is not a drill" >&2
    exit 1
    ;;
esac

work="$(mktemp -d)"
chmod 700 "$work"
trap 'rm -rf "$work"' EXIT INT TERM HUP

kind="${BACKUP_NAME#openfarm-}"
kind="${kind%%-*}"

echo "fetching $BACKUP_NAME…"
rclone copy "$BACKUP_DESTINATION/$kind/$BACKUP_NAME" "$work/"

echo "clearing the scratch database…"
# Both schemas: the dump recreates drizzle's own, and leaving it behind makes every drill
# after the first fail on a CREATE SCHEMA that already exists.
psql "$TARGET_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
drop schema if exists public cascade;
drop schema if exists drizzle cascade;
create schema public;
SQL

echo "decrypting and restoring…"
# Straight from age into psql. The farm's records never touch the disk in the clear: a
# machine that loses power mid-drill would otherwise leave the whole farm readable in a
# temporary directory the cleanup never reached.
age --decrypt --identity "$BACKUP_AGE_IDENTITY" "$work/$BACKUP_NAME" \
  | psql "$TARGET_URL" -v ON_ERROR_STOP=1 -q -f -

echo "checking the farm is really there…"
DATABASE_URL="$TARGET_URL" pnpm --filter @OpenFarm/test-harness verify:restore

echo
echo "restored $BACKUP_NAME into $target_db, and it holds a farm."
echo "now the part a script cannot do: open the app against it and look."
