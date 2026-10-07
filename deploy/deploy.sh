#!/usr/bin/env bash
# One deploy of the farm, run from the machine that builds it (docs/runbooks/deploy.md, "Every deploy").
#
# It stops at the first step that fails, and every step before the switch leaves the running release untouched: a
# migration the database refuses leaves the farm on the old release, answering as it was, rather than switched to a
# new one that will not start. A migration since the running release that may rename or drop what the old app reads
# stops it before anything is copied, unless STOPPED=yes says the app is to be stopped across the migration.
#
#   OPENFARM_HOST=openfarm@farm.example.com OPENFARM_URL=https://farm.example.com \
#     PRODUCTION_DATABASE_URL='postgresql://…' deploy/deploy.sh
set -euo pipefail

host="${OPENFARM_HOST:?Name the server of the farm: OPENFARM_HOST=openfarm@…}"
url="${OPENFARM_URL:?Name the address of the farm: OPENFARM_URL=https://…}"
: "${PRODUCTION_DATABASE_URL:?Name the database of the farm, from the password manager: PRODUCTION_DATABASE_URL=…}"
stopped="${STOPPED:-no}"

cd "$(git rev-parse --show-toplevel)"

echo "== building and checking"
pnpm install --frozen-lockfile
pnpm release:check

echo "== what has changed in the database since the running release"
live="$(ssh "$host" 'basename "$(readlink /srv/openfarm/current 2>/dev/null)" 2>/dev/null || true')"
if [ -n "$live" ]; then
  # Anything that renames or drops what the old app reads, changes what a column takes, or adds a trigger, a unique
  # index or a foreign key that can refuse the old app's writes in the minute before it is switched.
  risky="$(git diff --name-only "${live##*-}" HEAD -- packages/db/src/migrations \
    | grep 'migration.sql$' \
    | xargs -r grep -liE '\b(drop|rename)\b|alter column .* type|set not null|add constraint .* (check|unique|foreign key)|create (unique )?index|create trigger|references' \
    || true)"
  if [ -n "$risky" ] && [ "$stopped" != "yes" ]; then
    echo "These migrations may break the running app while they apply:" >&2
    echo "$risky" >&2
    echo "Tell the Manager, then run again with STOPPED=yes to stop the app across the migration." >&2
    exit 2
  fi
else
  echo "(no release running yet: the first deploy)"
fi

release="$(date -u +%Y%m%dT%H%MZ)-$(git rev-parse --short=8 HEAD)"

echo "== copying $release beside the running release"
rsync -a apps/web/.output/ "$host:/srv/openfarm/releases/$release/"

if [ "$stopped" = "yes" ]; then
  echo "== stopping the app across the migration"
  ssh "$host" 'sudo systemctl stop openfarm'
fi

echo "== migrating: before the new app starts, never after"
if ! pnpm --filter @OpenFarm/db db:migrate:deploy; then
  # Nothing was applied (the migrations run in one transaction), so the old release still fits the database.
  if [ "$stopped" = "yes" ]; then
    echo "The migration failed: starting the old release again." >&2
    ssh "$host" 'sudo systemctl start openfarm'
  fi
  echo "The migration failed; the farm is on the release it was on." >&2
  exit 1
fi

echo "== switching and restarting"
ssh "$host" "ln -sfn releases/$release /srv/openfarm/current.next \
  && mv -T /srv/openfarm/current.next /srv/openfarm/current \
  && sudo systemctl restart openfarm"

echo "== asking whether it is ready"
# A few tries: the new release is up within seconds, but not within the first one.
for try in 1 2 3 4 5 6; do
  if curl --fail --silent --show-error --max-time 10 "$url/api/ready"; then
    echo
    break
  fi
  if [ "$try" = 6 ]; then
    echo "Not ready. See: ssh $host 'journalctl -u openfarm -n 50'" >&2
    exit 3
  fi
  sleep 5
done

echo "== keeping the last five releases"
ssh "$host" 'cd /srv/openfarm/releases && ls -1 | head -n -5 | xargs -r rm -rf --'

echo "Deployed $release."
