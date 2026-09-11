# Deploying OpenFarm

One farm, one deployment. Nothing here is clever, and that is the point: the person doing
this at six in the morning after a disk died should not have to think.

## What runs where

| Piece | Where | Who holds the credentials |
| --- | --- | --- |
| The app | Managed Node host, Singapore region | Owner (root), Manager (operational) |
| The database | Managed PostgreSQL with point-in-time recovery, Singapore | Owner only |
| Off-site copies | A different provider and region | Owner only |
| Push keys | Password manager | Owner only |
| DNS and TLS | Registrar and host | Owner only |

Singapore because that is the nearest region with a managed PostgreSQL that does
point-in-time recovery; a phone in a shed in Bangladesh is a long way from anywhere, and
this is the shortest of the long ways.

**The Owner holds every root credential.** The Manager can deploy, read logs and restart the
app, and cannot reach the database, the backups or the keys. That is not distrust; it is so
that one person's lost phone is not the farm's lost records.

## Before the first deploy

The Owner provisions the accounts — that is a go-live prerequisite, not a step here — and
puts every value from `.env.example` into the password manager.

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
pnpm check-types          # the whole workspace, web app included
pnpm test                 # against a real scratch database
pnpm build                # Nitro output in apps/web/.output

pnpm db:migrate:deploy    # migrations first: the app expects the schema it was built for
# then ship apps/web/.output to the host and restart it
```

Migrations run before the new app starts, never after. Every migration in this repo is
additive or backfills what it adds, so the old app keeps working against the new schema for
the minute between the two.

## Afterwards

Open the app and look at three things:

1. **Today** — the day's work is there.
2. **To check** — the sign-off queue loads.
3. **Settings → Being told** — this device can still agree to be told.

If the first is empty and it should not be, the scheduler has not been triggered: opening
the app does that, so open it again.
