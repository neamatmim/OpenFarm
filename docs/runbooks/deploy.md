# Deploying OpenFarm

One farm, one deployment. Nothing here is clever, and that is the point: the person doing
this at six in the morning after a disk died should not have to think.

## What runs where

| Piece           | Where                                                                        | Who holds the credentials |
| --------------- | ---------------------------------------------------------------------------- | ------------------------- |
| The app         | The farm's own Linux server, Singapore, as `openfarm.service`                | Owner only                |
| Taking copies   | The same server, `openfarm-backup.timer` and `openfarm-backup-monthly.timer` | Owner only                |
| The database    | Managed PostgreSQL with point-in-time recovery, Singapore                    | Owner only                |
| Off-site copies | A different provider and region                                              | Owner only                |
| Push keys       | Password manager                                                             | Owner only                |
| DNS and TLS     | Registrar, and nginx with certbot on the server                              | Owner only                |

Singapore because that is the nearest region with a managed PostgreSQL that does
point-in-time recovery; a phone in a shed in Bangladesh is a long way from anywhere, and
this is the shortest of the long ways.

**The Owner holds every credential, and only the Owner deploys.** Whoever can put code on the
server can read everything the app reads — the database, the sign-in secret, the push keys —
whatever the file permissions say, so there is no such thing as deploy access without them.
The Manager has no login on the server: they run the farm in the app, and when something on
the server needs doing, they tell the Owner. That is not distrust; it is so that one person's
lost phone or laptop is not the farm's lost records.

So the `openfarm` user's SSH key, the root login and the database's own credentials live in
the Owner's password manager and on the Owner's machine, and nowhere else.

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
- [ ] **The app signs in as its own login, `openfarm_app`**, not the database's owner — see
      [The app's own login](#the-apps-own-login), done after the first migration. `/etc/openfarm/app.env` names it;
      `/etc/openfarm/backup.env` and `PRODUCTION_DATABASE_URL` keep the owner's, which migrations and
      copies need.
- [ ] **The database itself runs at UTC**: `ALTER DATABASE <name> SET timezone = 'UTC';` in the
      provider's console, then `SHOW timezone;` in a new session says `UTC`. Every moment the farm keeps
      carries its zone, so any session reads the same instant; but the app works in UTC days, and the
      provider's own console, `psql` and a restore drill would otherwise cut a moment to its day — or
      show it — at whatever zone the server keeps.
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
- [ ] The proxy takes a request of up to **8 MB** and no more (nginx: `client_max_body_size 8m;`).
      nginx's own default is 1 MB, which refuses a Shed Phone's batch of photographs (up to 4 MB, as
      a phone sends them); without any limit, one signed-in phone could send hundreds of megabytes
      for the app to read.
- [ ] The proxy passes the **Host** the browser asked for (nginx: `proxy_set_header Host $host;`).
      The app tells the farm's address from the Investor Portal's by it; a proxy that sends
      `127.0.0.1` makes every request the farm's.
- [ ] `/api/health` returns 200 and `/api/ready` returns 200 through the public hostname.
- [ ] `OPENFARM_OWNER_EMAIL` is the Owner's own address. Until a Farm exists, whoever opens
      the first account and creates the Farm becomes its Owner, so only this address may; left
      unset, the app lets nobody in at all. Once the Farm exists, an account opens only for
      somebody the farm invited.
- [ ] **The Owner signs up with that address and sets the farm up** as soon as the app is up. A
      production server with no farm prints a one-time **setup code** in its log as it first starts,
      and the sign-up asks for it, so somebody who only knows the Owner's address cannot take the
      account first: `journalctl -u openfarm | grep 'setup code'`. The same code stands across
      restarts until the farm is set up, and is forgotten then. Lost, delete it as the owner
      (`DELETE FROM setup_code;`) and restart for another.

```sh
# The push keys, generated once and kept for ever.
pnpm dlx web-push generate-vapid-keys

# The backup keypair. The public half goes in the environment; the private half goes in the
# password manager and nowhere else, because it is the only thing that can read a backup.
age-keygen -o backup-key.txt
```

## The app's own login

The farm's trail and every Version it agreed to are kept by the database itself: a change or a
removal is refused whoever asks. But the database's owner can lift that, and the app should not be
able to. So the app signs in as a login of its own that can read and write the farm's records and
nothing more: it cannot change a table, lift a guard, or change or remove what is kept.

Run once, in the provider's console as the owner, with a new password from the password manager:

```sql
CREATE ROLE openfarm_app LOGIN PASSWORD '…';
```

Then give it what it may do, from the repository, still as the owner — **after the first migration
has run**: the grants name the farm's tables, and on an empty database they stop at the first one
missing, leaving the login with no rights at all. On a first deploy, that means running
`PRODUCTION_DATABASE_URL='postgresql://…' pnpm --filter @OpenFarm/db db:migrate:deploy` once before
this. The grants are kept in one file, `scripts/app-login-grants.sql`, which a restore into a new
database runs too, so the two can never say different things:

```sh
psql "<the owner's database url>" -v ON_ERROR_STOP=1 -v app_role=openfarm_app \
  -f scripts/app-login-grants.sql
```

Then put `postgresql://openfarm_app:…@…` in `/etc/openfarm/app.env` as `DATABASE_URL`, restart,
and check `/api/ready`. A login with no rights is refused as the server starts, and says so. If a migration ever adds a table the app is refused, its grant was made by a
login other than the owner's: run `scripts/app-login-grants.sql` again.

## Every deploy

Each deploy is a release of its own under `/srv/openfarm/releases/`, named for when it was
built and the commit it was built from. The service runs whatever `/srv/openfarm/current`
points at. A new release is copied in beside the running one, and the switch is one rename, so
the app is never served half-copied and the last release is still there to go back to.

Every deploy is one script, `deploy/deploy.sh`, run from the machine that builds it. It stops at
the first step that fails, and everything before the switch leaves the running release as it was: a
migration the database refuses leaves the farm on the release it was on, answering, rather than
switched to one that will not start.

```sh
OPENFARM_HOST=openfarm@farm.example.com OPENFARM_URL=https://farm.example.com \
  PRODUCTION_DATABASE_URL='postgresql://…' deploy/deploy.sh
```

It builds and checks (`pnpm release:check`), copies the release in beside the running one,
migrates before the new app starts, switches with one rename, restarts, asks `/api/ready` until it
answers, and keeps the last five releases. The farm's database is named from the password manager;
the migration script refuses this machine's own.

Before it copies anything it looks at the migrations since the running release. **If none of them
may break the running app**, it goes straight on: the old app keeps working on the new schema for the
minute between the two. **If one may** — it renames or drops something, changes what a column takes,
or adds a trigger, a unique index or a foreign key that can refuse the old app's writes — it names
them and stops. The check errs towards stopping: a minute stopped costs less than finding out which.
Tell the Manager first: for a minute or two nobody can save, and the phones keep what they record in
their outbox and send it when the farm is back. Then run it again with `STOPPED=yes`, which stops the
app across the migration and starts the new one after it — or, if the migration fails, the old one
again. On the very first deploy there is no running release, and it takes the first path.

Started against a database a migration was forgotten for, or with a login that may not read it, the
new app refuses: it says which and exits 1. systemd tries again five times in five minutes and then
gives up, so `systemctl status openfarm` shows it failed; until then it reads "activating
(auto-restart)". Migrate, or run the grants, then `sudo systemctl reset-failed openfarm && sudo
systemctl start openfarm`. A database it cannot reach does not stop it; readiness reports that one.
A stop or a restart lets a turn of the farm's day already running finish, and takes two or three
seconds.

### Going back to the last release

```sh
ssh openfarm@HOST 'ls -1 /srv/openfarm/releases; readlink /srv/openfarm/current'
ssh openfarm@HOST "ln -sfn releases/<the one before> /srv/openfarm/current.next \
  && mv -T /srv/openfarm/current.next /srv/openfarm/current \
  && sudo systemctl restart openfarm"
```

Never back past a release whose migrations renamed or dropped something: the older app starts —
it refuses only a database that is _behind_ it — and then fails on every request that reads what
is gone. Fix forward instead.

## Installing the app service once

A release contains only `apps/web/.output`, copied as shown above. The releases belong to the
`openfarm` user, who deploys them and may restart, stop and start the service and nothing else.
Install the checked-in unit once, keep its environment root-owned, and let the reverse proxy own
TLS:

First the machine itself, once: **Node 24** at `/usr/bin/node` (the unit runs it from there, and
the repo pins 24), the `openfarm` user that owns the releases, and `/etc/openfarm` for the two
environments — the app's, read by systemd as root, and the backup job's, read only by its own user
(see the restore runbook).

```sh
# Node 24 from NodeSource; `node --version` must say v24.
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - && sudo apt-get install -y nodejs
node --version
sudo useradd --system --create-home --home-dir /home/openfarm --shell /bin/bash openfarm
sudo install -d -o root -g root -m 0755 /etc/openfarm
```

Then the releases and the service:

```sh
sudo install -d -o openfarm -g openfarm -m 0755 /srv/openfarm /srv/openfarm/releases
echo 'openfarm ALL=(root) NOPASSWD: /usr/bin/systemctl restart openfarm, /usr/bin/systemctl stop openfarm, /usr/bin/systemctl start openfarm' \
  | sudo tee /etc/sudoers.d/openfarm && sudo chmod 0440 /etc/sudoers.d/openfarm && sudo visudo -c
# The first release, by the steps under "Every deploy", before the service is started.
sudo install -o root -g root -m 0600 /path/to/app.env /etc/openfarm/app.env
sudo install -o root -g root -m 0644 deploy/openfarm.service /etc/systemd/system/openfarm.service
sudo systemctl daemon-reload
sudo systemctl enable --now openfarm
systemctl status openfarm
journalctl -u openfarm --since today
```

The environment file contains the runtime values from `.env.example`, each one filled in — the
server refuses to start on a value still saying `example.com`. `BETTER_AUTH_URL` must be the public
HTTPS origin. The service runs unprivileged, restarts after failures, and writes structured
application events to the system journal.

### The farm's own address in nginx

The app answers on `127.0.0.1:3001` and nginx stands in front of it with the certificate
(`sudo certbot --nginx -d farm.example.com`). The built files and the service worker are served
before the app sees the request, so they carry none of the headers it sets on its pages; nginx adds
the two that matter for them.

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name farm.example.com;
    # ssl_certificate lines as certbot wrote them

    # A Shed Phone's batch of photographs, and no more.
    client_max_body_size 8m;
    # What every request passes on: the name asked for, and the address it came from — set, not added to.
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;

    location / { proxy_pass http://127.0.0.1:3001; }
    # The built files and those in public/, served before the app's own headers are set.
    location ~ ^/(assets/|sw\.js$|icon\.svg$|manifest\.webmanifest$|portal\.webmanifest$|robots\.txt$) {
        proxy_pass http://127.0.0.1:3001;
        add_header X-Content-Type-Options nosniff always;
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    }
}

server {
    listen 80;
    listen [::]:80;
    server_name farm.example.com;
    return 301 https://$host$request_uri;
}
```

**Check it:** `curl -sI https://farm.example.com/sign-in | grep -i content-security` shows a
policy with `script-src 'self' 'nonce-…'`, and `curl -sI https://farm.example.com/sw.js` shows
`x-content-type-options: nosniff`.

## The outside watch

The farm tells the Owner itself when its day stops turning or its copies stop coming, but only
while the app is running to say so. A server that is down, or an app that has died, says nothing.
So something outside the farm listens for it, once, at go-live:

1. Make a check at a check-in service (healthchecks.io's free tier is enough): expected every
   **5 minutes**, with **30 minutes'** grace, alerting the Owner by email and SMS.
2. Put its address in `/etc/openfarm/app.env` as `OPENFARM_WATCH_URL`, and restart. After each
   whole turn of the farm's day the server tells it; when it stops, the watch tells the Owner.
3. And for the service itself, so a crash loop is heard of at once, not after the grace:

```sh
sudo systemctl edit openfarm   # add, under [Unit]:
#   OnFailure=openfarm-failed.service
# where openfarm-failed.service runs once, e.g.
#   ExecStart=/usr/bin/curl -fsS -m 10 --retry 3 "<the watch's address>/fail"
```

Test it once: stop the service and wait for the watch to say so.

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

The farm's own server block, above, already passes the Host. It does not need to
redirect `/portal` itself: the app answers `/portal/...` on the farm's address with a
permanent redirect to the same page on the Investor address.

**Check it:**

- `curl -I https://investors.farm.example.com/` answers 302 to `/portal`.
- `curl -I https://investors.farm.example.com/sign-in` answers 404.
- `curl -I https://farm.example.com/portal/sign-in` answers 301 to the Investor address.
- `curl -sI https://investors.farm.example.com/portal/sign-in | grep -i content-security`
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

If the first is empty and it should not be, the schedule has not run. It runs inside the app
every five minutes, whether or not anybody has it open; opening the app does not start it.
Wait five minutes, then look under **Admin → Backups** for when it last ran. If it has not,
check that `OPENFARM_SCHEDULER` is not `off` in `/etc/openfarm/app.env`, and read
`journalctl -u openfarm --since today` for the error it failed with.
