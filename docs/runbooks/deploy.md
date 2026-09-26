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
- [ ] The proxy **sets** `X-Forwarded-For` to the address it saw, rather than adding to what
      the caller sent (nginx: `proxy_set_header X-Forwarded-For $remote_addr;`). Sign-in and
      Shed Phone enrolment count wrong guesses per address, read from that header; a proxy
      that appends lets a script name a new address on every try.
- [ ] The proxy passes the **Host** the browser asked for (nginx: `proxy_set_header Host $host;`).
      The app tells the farm's address from the Investor Portal's by it; a proxy that sends
      `127.0.0.1` makes every request the farm's.
- [ ] `/api/health` returns 200 and `/api/ready` returns 200 through the public hostname.
- [ ] **The Owner signs up the moment the app is up.** Until a Farm exists the door is open,
      and whoever opens the app first and creates the Farm becomes its Owner. Once it exists,
      an account opens only for somebody the farm invited.

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

# Readiness asks the database whether it has applied the newest migration this build expects, so it
# fails on a database that is unreachable and on one a migration was forgotten for.
curl --fail --silent --show-error --max-time 10 https://farm.example.com/api/ready

```

Migrations run before the new app starts, never after. Every migration in this repo is
additive or backfills what it adds, so the old app keeps working against the new schema for
the minute between the two.

Started against a database a migration was forgotten for, the new app refuses: it prints which
migration is missing and exits 1, so `systemctl status openfarm` shows it failed rather than running.
Migrate and restart. A database it cannot reach does not stop it; readiness reports that one.

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

## The Investor Portal's own address

Investors reach the portal at `investors.<farm-domain>` (ADR 0009), a second name on the same
app. Until it is set up the portal stays at `/portal` on the farm's address, so this can wait
until the first Investor is invited — but not until after their Welcome Letter is printed,
because the letter prints whichever address the app has.

1. **DNS:** an `A` (and `AAAA`) record for `investors.farm.example.com` pointing at the same
   host as the farm's name.
2. **Certificate:** one for the new name. With certbot, add it beside the farm's:
   `sudo certbot --nginx -d farm.example.com -d investors.farm.example.com`.
3. **The environment:** add `PORTAL_URL=https://investors.farm.example.com` to
   `/etc/openfarm/app.env` and restart. It must use HTTPS, be the bare address with no path,
   and be a different name from `BETTER_AUTH_URL`, or the app refuses to start. It also
   refuses while `BETTER_AUTH_TRUSTED_ORIGINS` is set, since Better Auth would trust those
   on both addresses.
4. **nginx:** a server block of its own that passes only the portal's paths, so a stranger
   typing the Investor address never reaches the staff app even if the app's own check were
   wrong. The app checks the same list (`apps/web/src/lib/two-addresses.ts`); change both
   together.

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name investors.farm.example.com;
    # ssl_certificate lines as certbot wrote them

    # What every request passes on: the name asked for, and the address it came from.
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;

    # The front door, the portal's pages and the files they load.
    location = / { proxy_pass http://127.0.0.1:3001; }
    location /portal { proxy_pass http://127.0.0.1:3001; }
    # The built files are served before the app sees the request, so they carry none of its headers.
    location /assets/ {
        proxy_pass http://127.0.0.1:3001;
        add_header X-Content-Type-Options nosniff always;
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    }
    location ~ ^/(icon\.svg|portal\.webmanifest|robots\.txt)$ { proxy_pass http://127.0.0.1:3001; }

    # Signing in and out, the session, and the password.
    location ~ ^/api/auth/(sign-in/email|sign-out|get-session|change-password|revoke-other-sessions)$ {
        proxy_pass http://127.0.0.1:3001;
    }

    # The portal's own calls, who is asking, the language they read in, and who is signed in.
    location ~ ^/api/rpc/(portal/[^/]+|people/me|language/[^/]+)$ { proxy_pass http://127.0.0.1:3001; }
    location /_serverFn/ { proxy_pass http://127.0.0.1:3001; }

    # Nothing else of the farm app — the service worker included, which the app itself cannot refuse: like the
    # built files, it is served before the app's own check runs.
    location / { return 404; }
}

server {
    listen 80;
    listen [::]:80;
    server_name investors.farm.example.com;
    return 301 https://$host$request_uri;
}
```

The farm's own server block needs `proxy_set_header Host $host;` too. It does not need to
redirect `/portal` itself: the app answers `/portal/...` on the farm's address with a
permanent redirect to the same page on the Investor address.

**Check it:**

- `curl -I https://investors.farm.example.com/` answers 302 to `/portal`.
- `curl -I https://investors.farm.example.com/login` answers 404.
- `curl -I https://farm.example.com/portal/login` answers 301 to the Investor address.
- `curl -sI https://investors.farm.example.com/portal/login | grep -i content-security`
  shows a policy with `script-src 'self' 'nonce-…'`.
- Sign in as the Owner on the farm's address and as an Investor on the Investor address in one
  browser: both stay signed in, because each name keeps its own cookie.

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
