# Deploying OpenFarm on Vercel

OpenFarm can run on Vercel as a TanStack Start application. Nitro emits the
Vercel Function, static assets, and protected five-minute Cron Job from the same
build. The database and database backups remain external services.

## Required plan and services

- Use a Vercel Pro or Enterprise team. OpenFarm turns the farm day every five
  minutes; Vercel Hobby cron jobs may run only once per day and will reject this
  deployment configuration.
- Provision managed PostgreSQL with point-in-time recovery in Singapore. Use
  its pooled/PgBouncer connection URL for `DATABASE_URL`; serverless instances
  must not connect through an unpooled endpoint.
- Keep database backups outside Vercel. The checked-in `pg_dump`/`rclone`
  backup job needs a long-running host, or replace it with an equivalent managed
  backup and tested restore process.

## Create the Vercel project

1. Push this repository to GitHub, GitLab, or Bitbucket.
2. In Vercel, select **Add New → Project** and import the repository.
3. Set **Root Directory** to `apps/web`.
4. Keep **Include source files outside of the Root Directory in the Build Step**
   enabled so Vercel can build the workspace packages.
5. Vercel should detect **TanStack Start** from `apps/web/vercel.json`. Do not
   override the install, build, or output-directory settings.
6. Keep the function region as `sin1` (Singapore), matching the database.

The repository pins Node.js 24 and pnpm 12.3.4. Vercel reads both from the root
`package.json`.

## Configure environment variables

Add these under **Project → Settings → Environment Variables** before the first
build. Mark secrets as Sensitive.

| Name                 | Required | Value                                                   |
| -------------------- | -------- | ------------------------------------------------------- |
| `DATABASE_URL`       | Yes      | Pooled TLS PostgreSQL URL in Singapore                  |
| `BETTER_AUTH_SECRET` | Yes      | Unique random value, at least 32 characters             |
| `BETTER_AUTH_URL`    | Yes      | Canonical production origin, such as `https://farm.tld` |
| `CRON_SECRET`        | Yes      | A second unique random value, at least 32 characters    |
| `NODE_ENV`           | Yes      | `production`                                            |
| `VAPID_*`            | No       | Web Push credentials from `.env.example`                |
| `SMS_GATEWAY_*`      | No       | SMS provider credentials from `.env.example`            |

Generate the two secrets separately:

```sh
openssl rand -base64 32
openssl rand -base64 32
```

Do not set `OPENFARM_SCHEDULER=off` on the production project. Nitro generates a
Vercel Cron route and verifies Vercel's bearer token using `CRON_SECRET`.

Preview deployments must use a separate non-production database and a separate
`BETTER_AUTH_SECRET`; never point arbitrary branches at the farm's live data.
OpenFarm automatically trusts the current Vercel preview origin for Better Auth.

## Apply migrations

Migrations are deliberately not part of the Vercel build. Running them in every
preview build would let concurrent or untrusted branches change a shared
database. Apply them once before the first deploy and before promoting future
schema changes. Use the provider's **direct** (unpooled) URL here, not the pooled one
the app uses: a transaction-mode pooler may hand each statement of a migration to a
different server connection.

```sh
DATABASE_URL='postgresql://DIRECT_PRODUCTION_URL' \
  pnpm --filter @OpenFarm/db db:migrate:deploy
```

Run `pnpm release:check` before pushing the production commit. After migrations
finish, deploy by pushing the production branch or with `vercel --prod` from the
repository root.

## Verify the deployment

After assigning the custom domain, set `BETTER_AUTH_URL` to that exact HTTPS
origin and redeploy. Then verify:

```sh
curl --fail --silent --show-error https://farm.example.com/api/health
curl --fail --silent --show-error https://farm.example.com/api/ready
```

In Vercel, open **Settings → Cron Jobs** and confirm the five-minute job exists.
After it runs, **Admin → Backups** should show the farm schedule as running.
Also test sign-in, one write, sign-out, and Web Push permission if push keys are
configured.

## Operational boundary

Vercel hosts the web application and its scheduled HTTP invocation. PostgreSQL
owns durable records and schedule status. Point-in-time recovery plus the
off-provider backup/restore drill remain required; a Vercel deployment is not a
database backup.
