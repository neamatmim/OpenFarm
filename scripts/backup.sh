#!/usr/bin/env bash
#
# Takes a copy of the farm off the machine it lives on.
#
# One pg_dump of the whole database — which includes the photos, because they are rows and
# not files — encrypted with age to a public key, and pushed somewhere that is not the
# database's own provider. Nothing here holds a secret: the age *public* key is public by
# design, and the destination's credentials belong to whatever rclone is configured with.
#
# Every attempt the database is reachable for is written to backup_run, success or failure,
# so the app can say whether the farm is being copied. When the database itself is down there
# is nowhere to write that; the job says so on stderr and exits non-zero, and the scheduler's
# own log is the record of last resort.
#
#   scripts/backup.sh nightly
#   scripts/backup.sh monthly
#
set -euo pipefail

KIND="${1:-nightly}"

case "$KIND" in
  nightly | monthly | manual) ;;
  *)
    echo "backup: '$KIND' is not a kind of copy (nightly, monthly, manual)" >&2
    exit 2
    ;;
esac

# Checked up front, by name. A job that gets halfway and then finds it cannot encrypt has
# already spent the night's window, and has left a dump of the whole farm lying in /tmp.
missing=""
for tool in pg_dump age rclone psql; do
  command -v "$tool" >/dev/null 2>&1 || missing="$missing $tool"
done
if [ -n "$missing" ]; then
  echo "backup cannot run: missing$missing" >&2
  echo "install them on the host that takes the copy (docs/runbooks/restore-drill.md)" >&2
  exit 1
fi

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT is required (an age public key)}"
: "${BACKUP_DESTINATION:?BACKUP_DESTINATION is required (an rclone remote, e.g. offsite:openfarm)}"
NIGHTLIES_KEPT="${BACKUP_NIGHTLIES_KEPT:-90}"

case "$NIGHTLIES_KEPT" in
  '' | *[!0-9]*)
    echo "backup: BACKUP_NIGHTLIES_KEPT must be a whole number of days" >&2
    exit 2
    ;;
esac
if [ "$NIGHTLIES_KEPT" -lt 1 ]; then
  # Zero would hand rclone --min-age 0d, which deletes every nightly including the one this
  # job has just uploaded.
  echo "backup: BACKUP_NIGHTLIES_KEPT must be at least 1" >&2
  exit 2
fi

# A copy smaller than this is not a copy of a farm. An empty or truncated dump encrypts to a
# few hundred bytes and would otherwise be filed as a good night's work.
MIN_PLAUSIBLE_BYTES="${BACKUP_MIN_BYTES:-4096}"

started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
name="openfarm-${KIND}-${stamp}.sql.age"
work="$(mktemp -d)"
chmod 700 "$work"
trap 'rm -rf "$work"' EXIT INT TERM HUP

if command -v uuidgen >/dev/null 2>&1; then
  run_id="$(uuidgen | tr '[:upper:]' '[:lower:]')"
else
  run_id="$(cat /proc/sys/kernel/random/uuid)"
fi

# Every value goes to psql as a parameter and is quoted by psql, never pasted into the SQL.
# A destination or a failure message is text somebody else chose, and text somebody else
# chose is not something to build a statement out of.
sql() {
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q \
    -v run_id="$run_id" -v kind="$KIND" -v started="$started_at" \
    -v destination="$BACKUP_DESTINATION" -v detail="${1:-}" \
    -v ok="${2:-no}" -v size="${3:-}" \
    -f "$work/statement.sql"
}

# The row goes in first, marked failed. A job that dies halfway leaves a row that says so,
# rather than leaving nothing at all — which reads exactly like a night nobody ran it.
cat > "$work/statement.sql" <<'SQL'
insert into backup_run (id, kind, started_at, destination, ok)
values (:'run_id', :'kind', :'started'::timestamp, :'destination', 'no');
SQL
if ! sql; then
  echo "backup failed before it began: the database is not reachable" >&2
  exit 1
fi

finish() {
  cat > "$work/statement.sql" <<'SQL'
update backup_run
   set finished_at = now(),
       ok = :'ok',
       size_bytes = nullif(:'size', ''),
       detail = nullif(:'detail', '')
 where id = :'run_id';
SQL
  sql "$1" "$2" "${3:-}" || echo "backup: could not record the outcome" >&2
}

if ! pg_dump --no-owner --no-privileges --format=plain "$DATABASE_URL" \
  | age --recipient "$BACKUP_AGE_RECIPIENT" --output "$work/$name"; then
  finish "pg_dump or encryption failed" no
  echo "backup failed: could not take or encrypt the dump" >&2
  exit 1
fi

size="$(wc -c < "$work/$name" | tr -d ' ')"
if [ "$size" -lt "$MIN_PLAUSIBLE_BYTES" ]; then
  finish "the copy came out at ${size} bytes, which is not a farm" no "$size"
  echo "backup failed: the dump is too small to be real (${size} bytes)" >&2
  exit 1
fi

if ! rclone copy "$work/$name" "$BACKUP_DESTINATION/$KIND/"; then
  finish "upload failed" no "$size"
  echo "backup failed: could not upload" >&2
  exit 1
fi

# Nightlies age out; monthlies are kept for as long as the farm keeps anything, which is for
# ever (Audit trail and correction rules).
pruned="yes"
if [ "$KIND" = "nightly" ]; then
  # Kept by count, not by age. "Ninety nightlies" has to mean ninety: after a fortnight of
  # failures, deleting everything older than ninety days would leave the farm with the one
  # copy that happened to work.
  if ! rclone lsf "$BACKUP_DESTINATION/nightly/" > "$work/nightlies.txt" 2>/dev/null; then
    echo "backup: uploaded, but could not list nightlies to prune them" >&2
    pruned="no"
  else
    # The names carry a sortable UTC stamp, so the newest are simply the last.
    total="$(wc -l < "$work/nightlies.txt" | tr -d ' ')"
    if [ "$total" -gt "$NIGHTLIES_KEPT" ]; then
      sort "$work/nightlies.txt" | head -n "$((total - NIGHTLIES_KEPT))" \
        | while IFS= read -r old; do
            [ -n "$old" ] || continue
            rclone deletefile "$BACKUP_DESTINATION/nightly/$old" \
              || echo "backup: could not delete old nightly $old" >&2
          done
    fi
  fi
fi

finish "$([ "$pruned" = "yes" ] && echo "" || echo "old nightlies were not pruned")" yes "$size"
echo "backup ok: $name ($size bytes) -> $BACKUP_DESTINATION/$KIND/"
