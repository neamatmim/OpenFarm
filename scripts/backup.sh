#!/usr/bin/env bash
#
# Takes a copy of the farm off the machine it lives on.
#
# One pg_dump of the whole database — which includes the photos, because they are rows and
# not files — encrypted with age to a public key, and pushed to somewhere that is not the
# database's own provider. Nothing here holds a secret: the age *public* key is public by
# design, and the destination's credentials belong to whatever `rclone` is configured with.
#
# Every attempt is written to backup_run before it can be forgotten, success or failure, so
# the app can say whether the farm is being copied. Silence is what nobody notices.
#
#   scripts/backup.sh nightly
#   scripts/backup.sh monthly
#
set -euo pipefail

KIND="${1:-nightly}"

# Checked up front, by name. A job that gets halfway and then finds it cannot encrypt has
# already spent the night's window, and has left a dump of the whole farm lying in /tmp.
missing=""
for tool in pg_dump age rclone psql; do
  command -v "$tool" >/dev/null 2>&1 || missing="$missing $tool"
done
if [ -n "$missing" ]; then
  echo "backup cannot run: missing$missing" >&2
  echo "install them on the host that takes the nightly copy (see docs/runbooks/restore-drill.md)" >&2
  exit 1
fi

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT is required (an age public key)}"
: "${BACKUP_DESTINATION:?BACKUP_DESTINATION is required (an rclone remote, e.g. offsite:openfarm)}"
NIGHTLIES_KEPT="${BACKUP_NIGHTLIES_KEPT:-90}"

started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
name="openfarm-${KIND}-${stamp}.sql.age"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# uuidgen where there is one, the kernel's own where there is not. No Python on a backup
# host: the fewer things this needs, the fewer things can be missing at three in the morning.
if command -v uuidgen >/dev/null 2>&1; then
  run_id="$(uuidgen | tr '[:upper:]' '[:lower:]')"
else
  run_id="$(cat /proc/sys/kernel/random/uuid)"
fi

# The row goes in first, marked failed. A job that dies halfway leaves a row that says so,
# rather than leaving nothing at all — which reads exactly like a night nobody ran it.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<SQL
insert into backup_run (id, kind, started_at, destination, ok)
values ('${run_id}', '${KIND}', '${started_at}', '${BACKUP_DESTINATION}', 'no');
SQL

finish() {
  local ok="$1" detail="$2" size="${3:-}"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<SQL
update backup_run
   set finished_at = now(),
       ok = '${ok}',
       size_bytes = $( [ -n "$size" ] && echo "'${size}'" || echo "null" ),
       detail = $( [ -n "$detail" ] && echo "\$detail\$${detail}\$detail\$" || echo "null" )
 where id = '${run_id}';
SQL
}

if ! pg_dump --no-owner --no-privileges --format=plain "$DATABASE_URL" \
  | age --recipient "$BACKUP_AGE_RECIPIENT" --output "$work/$name"; then
  finish no "pg_dump or encryption failed"
  echo "backup failed: could not take or encrypt the dump" >&2
  exit 1
fi

size="$(wc -c < "$work/$name" | tr -d ' ')"

if ! rclone copy "$work/$name" "$BACKUP_DESTINATION/$KIND/"; then
  finish no "upload to ${BACKUP_DESTINATION} failed"
  echo "backup failed: could not upload" >&2
  exit 1
fi

# Nightlies age out; monthlies are kept for as long as the farm keeps anything, which is for
# ever (Audit trail and correction rules).
if [ "$KIND" = "nightly" ]; then
  rclone delete --min-age "${NIGHTLIES_KEPT}d" "$BACKUP_DESTINATION/nightly/" || true
fi

finish yes "" "$size"
echo "backup ok: $name ($size bytes) -> $BACKUP_DESTINATION/$KIND/"
