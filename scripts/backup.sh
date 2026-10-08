#!/usr/bin/env bash
#
# Takes a copy of the farm off the machine it lives on.
#
# One pg_dump of the whole database — which includes the photos, because they are rows and
# not files — compressed, encrypted with age to a public key, and pushed somewhere that is not
# the database's own provider. Nothing here holds a secret: the age *public* key is public by
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
for tool in pg_dump age rclone psql gzip; do
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
# Monthlies are kept as long as the farm's privacy notice says it keeps a person's records, and no longer (the Owner,
# 2026-10-07): twelve years.
MONTHLY_YEARS_KEPT="${BACKUP_MONTHLY_YEARS_KEPT:-12}"

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

case "$MONTHLY_YEARS_KEPT" in
  '' | *[!0-9]* | 0)
    echo "backup: BACKUP_MONTHLY_YEARS_KEPT must be a whole number of years, at least 1" >&2
    exit 2
    ;;
esac

# A copy smaller than this is not a copy of a farm. An empty or truncated dump encrypts to a
# few hundred bytes and would otherwise be filed as a good night's work.
MIN_PLAUSIBLE_BYTES="${BACKUP_MIN_BYTES:-4096}"

started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
name="openfarm-${KIND}-${stamp}.sql.gz.age"
# Not the shared /tmp, which is often in memory: a farm's photos one day outgrow it, and every night would fail.
work="$(mktemp -d "${BACKUP_WORK_DIR:-/var/tmp}/openfarm-backup.XXXXXX")"
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
#
# It also says how many rows the farm's key tables held, and it goes in before the dump, so
# the copy carries its own row: a restore of it is checked against what it held, not against
# what a farm is supposed to have. A farm set up yesterday holds no milk yet, and its first
# restore drill must pass; a farm with a year of milk must get every liter of it back.
cat > "$work/statement.sql" <<'SQL'
insert into backup_run (id, kind, started_at, destination, ok, held)
values (:'run_id', :'kind', :'started'::timestamptz, :'destination', 'no',
        -- Counted by name, each only if its table is there: a table renamed since must not stop every copy
        -- before it starts. One that is gone is counted as null, and the restore check says so.
        (select jsonb_object_agg(t, case when to_regclass(format('public.%I', t)) is null then null
                  else (xpath('/row/c/text()',
                        query_to_xml(format('select count(*) as c from public.%I', t), false, true, '')))[1]::text::bigint
                  end)
           from unnest(array['farm', 'user', 'animal', 'animal_photo', 'sop_definition', 'sop_version',
                             'sop_instance', 'step_completion', 'completion_photo', 'milking_session',
                             'milk_record', 'feeding', 'sale', 'audit_event']) as t));
SQL
if ! sql; then
  echo "backup failed before it began: could not write its row to backup_run — is the database reachable, and migrated?" >&2
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

# What went wrong is kept with the row, not only in the server's log: the Owner reads the Backups page, not the journal.
# pg_dump's own words name a version it will not dump, a table it may not read — never a row's values.
if ! pg_dump --no-owner --no-privileges --format=plain "$DATABASE_URL" 2> "$work/dump.err" \
  | gzip -6 \
  | age --recipient "$BACKUP_AGE_RECIPIENT" --output "$work/$name" 2> "$work/age.err"; then
  why="$(tail -n 1 "$work/dump.err" "$work/age.err" 2>/dev/null | grep -v '^==>' | grep -v '^$' | tail -n 1 | cut -c1-300)"
  finish "pg_dump or encryption failed${why:+: $why}" no
  echo "backup failed: could not take or encrypt the dump${why:+ ($why)}" >&2
  exit 1
fi

size="$(wc -c < "$work/$name" | tr -d ' ')"
if [ "$size" -lt "$MIN_PLAUSIBLE_BYTES" ]; then
  finish "the copy came out at ${size} bytes, which is not a farm" no "$size"
  echo "backup failed: the dump is too small to be real (${size} bytes)" >&2
  exit 1
fi

if ! rclone copy "$work/$name" "$BACKUP_DESTINATION/$KIND/" 2> "$work/upload.err"; then
  why="$(grep -v '^$' "$work/upload.err" | tail -n 1 | cut -c1-300)"
  finish "upload failed${why:+: $why}" no "$size"
  echo "backup failed: could not upload${why:+ ($why)}" >&2
  exit 1
fi

# Nightlies age out by count; monthlies after twelve years.
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

if [ "$KIND" = "monthly" ]; then
  # Older than twelve years by the stamp in its name, which sorts as it reads: openfarm-monthly-YYYYMMDDTHHMMSSZ.
  cutoff="$(( $(date -u +%Y) - MONTHLY_YEARS_KEPT ))$(date -u +%m%d)"
  if ! rclone lsf "$BACKUP_DESTINATION/monthly/" > "$work/monthlies.txt" 2>/dev/null; then
    echo "backup: uploaded, but could not list monthlies to prune them" >&2
    pruned="no"
  else
    while IFS= read -r old; do
      taken="${old#openfarm-monthly-}"
      taken="${taken:0:8}"
      case "$taken" in
        [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]) ;;
        *) continue ;;
      esac
      if [ "$taken" -lt "$cutoff" ]; then
        rclone deletefile "$BACKUP_DESTINATION/monthly/$old" \
          || echo "backup: could not delete old monthly $old" >&2
      fi
    done < "$work/monthlies.txt"
  fi
fi

finish "$([ "$pruned" = "yes" ] && echo "" || echo "old copies were not pruned")" yes "$size"
echo "backup ok: $name ($size bytes) -> $BACKUP_DESTINATION/$KIND/"
