# Deploying OpenFarm

One farm, one deployment. Nothing here is clever, and that is the point: the person doing
this at six in the morning after a disk died should not have to think.

## What runs where

| Piece           | Where                                                     | Who holds the credentials           |
| --------------- | --------------------------------------------------------- | ----------------------------------- |
| The app         | Managed Node host, Singapore region                       | Owner (root), Manager (operational) |
| The database    | Managed PostgreSQL with point-in-time recovery, Singapore | Owner only                          |
| Off-site copies | A different provider and region                           | Owner only                          |
| Push keys       | Password manager                                          | Owner only                          |
| DNS and TLS     | Registrar and host                                        | Owner only                          |

Singapore because that is the nearest region with a managed PostgreSQL that does
point-in-time recovery; a phone in a shed in Bangladesh is a long way from anywhere, and
this is the shortest of the long ways.

**The Owner holds every root credential.** The Manager can deploy, read logs and restart the
app, and cannot reach the database, the backups or the keys. That is not distrust; it is so
that one person's lost phone is not the farm's lost records.

## Before the first deploy

The Owner provisions the accounts — that is a go-live prerequisite, not a step here — and
puts every value from `.env.example` into the password manager. Then this checklist, which
is the part that is easy to believe was done and was not:

- [ ] `NODE_ENV=production` is set. Left unset the app runs as development.
- [ ] **Point-in-time recovery is on**, and its window is at least a day. This is what an
      RPO of an hour rests on; a nightly copy alone cannot reach it. Check it in the
      provider's console and write down the window you saw — a provider that _offers_ PITR
      is not a database that _has_ it.
- [ ] The database is in the Singapore region, and so is the app host.
- [ ] The off-site remote is on a **different provider**, not another bucket on the same one.
- [ ] The nightly timer is installed and listed — see the restore runbook.
- [ ] A first copy has run by hand and **Admin → Backups** shows it.
- [ ] A first restore drill has been done. A backup nobody has restored is a hope.
- [ ] TLS terminates in front of the app and plain HTTP redirects to HTTPS. The app binds to
      `127.0.0.1:3001`; it must not be exposed directly to the internet.
- [ ] `/api/health` returns 200 and `/api/ready` returns 200 through the public hostname.

```sh
# The push keys, generated once and kept for ever.
pnpm dlx web-push generate-vapid-keys

# The backup keypair. The public half goes in the environment; the private half goes in the
# password manager and nowhere else, because it is the only thing that can read a backup.
age-keygen -o backup-key.txt
```

## Every deploy

```sh
pnpm install --frozen-lockfile
pnpm release:check        # types, tests against PostgreSQL, then the production build

# Migrations first: the app expects the schema it was built for.
pnpm --filter @OpenFarm/db db:migrate:deploy

# Then the app itself. Nitro's output is self-contained, so this is a copy and a restart.
rsync -a --delete apps/web/.output/ openfarm@HOST:/srv/openfarm/app/
ssh openfarm@HOST 'sudo systemctl restart openfarm'

# Readiness checks the database and an application table, so it also catches a missing migration.
curl --fail --silent --show-error --max-time 10 https://farm.example.com/api/ready

```

Migrations run before the new app starts, never after. Every migration in this repo is
additive or backfills what it adds, so the old app keeps working against the new schema for
the minute between the two.

## Installing the app service once

The release directory contains only `apps/web/.output`, copied to `/srv/openfarm/app` as
shown above. Install the checked-in unit once, keep its environment root-owned, and let the
reverse proxy own TLS:

```sh
sudo install -o root -g root -m 0600 /path/to/app.env /etc/openfarm/app.env
sudo install -o root -g root -m 0644 deploy/openfarm.service /etc/systemd/system/openfarm.service
sudo systemctl daemon-reload
sudo systemctl enable --now openfarm
systemctl status openfarm
journalctl -u openfarm --since today
```

The environment file contains the runtime values from `.env.example`. `BETTER_AUTH_URL`
must be the public HTTPS origin. The service runs unprivileged, restarts after failures, and
writes structured application events to the system journal.

## Afterwards

Open the app and look at four things:

1. **Today** — the day's work is there.
2. **To check** — the sign-off queue loads.
3. **Settings → Being told** — this device can still agree to be told.
4. **A bought-in bull's money tab** — her Hasil, her share of the outing that brought her,
   and her part of the month's Herd Costs read as figures rather than zeros. All three at
   zero after a few days of real work means something did not take. Set the Fodder Price on
   the home-grown Feed Items first, or the farm's own grass still costs the animals nothing
   and every Margin reads high.

If the first is empty and it should not be, the scheduler has not been triggered: opening
the app does that, so open it again.
