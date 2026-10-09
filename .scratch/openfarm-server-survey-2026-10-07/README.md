# Survey of running the farm's own server, 2026-10-07

Three reviewers each took one part: backups and restore; deploying and starting the server; security at the server's door. The survey ran against main at 03d499e0. Each finding is marked:

- **Proven:** a temporary test, a production build or a script run against a throwaway Postgres showed it, and what was made was then removed.
- **Traced:** read line by line through the code.

Findings are numbered within their part: K for backups ("keeping"), R for running (deploy), S for security.

## Status

| Group | Status |
| ----- | ------ |
| A | Done on fix/the-door: a stint ended by Lock or a new PIN (`device_switch.ended_at`) is never stretched or kept awake again, and proves only what came before its end; wrong passwords counted per account (`password_guess`), five within the hour and the account takes one try a minute, and the Owner is told (`password_guessed`); `/verify-password` closed; portal and password codes counted per caller, never per phone or account; `getUser` hands the page who and until when only; a failure's internals never reach a phone. Migrations 20261007070701, 20261007071153, 20261007071303. Not done: the re-asked password for money acts — group E |
| B | Done on fix/start-and-stop: `stop-when-told` exits on SIGTERM once a running turn ends (built server exited in 2 s, code 0); push keys checked as the server starts (a subject without mailto: refused, proven on the build); Better Auth logs through `authLogger`, values left out; the behind message names the runbook command; a login with no rights refused at start (`whyTheDatabaseWillNotDo`); a turn keeps its causes (`causesOf`); systemd gives up after 5 starts in 5 minutes; `deploy/deploy.sh` stops at the first failure and starts the old release again if a stopped migration fails, and its check catches triggers, unique indexes and foreign keys (R9); grants after the first migration in the runbook; one pool and one guess count per process (on `globalThis`); session settings sent with the connection, the pg warning gone |
| C | Done on fix/backups: copies compressed and written under /var/tmp; the counted tables tolerate a rename (counted null) and a test ties the list to the schema; a failure keeps the tool's own words; monthlies deleted after twelve years, retried twice-hourly up to four times, and a failed one told to the Owner (`monthly_copy_failed`, migration 20261007074902); restore refuses before loading when the app login is missing, reads the database's own name (no `?dbname=` trick), refuses a psql older than the pg_dump; backups run as `openfarm-backup`; cron in UTC; the runbook points backup.env and PRODUCTION_DATABASE_URL at a restored database, re-enters the lost day from paper, redoes security acts and erasures, signs everyone out, keeps the drill copy from pushing or turning the day, drops the scratch database; Backups page says "being taken", shows size, words kinds and reasons. Round trip proven in a throwaway postgres:18 |
| D | Done on fix/papers-and-headers: an Investor's Data Copy holds their Pay-in Notes and what they agreed in the portal (test red against main's); the farm address has the portal's nonce policy (an injected script refused in the browser, theme and service worker unhurt); the runbook installs Node 24, the `openfarm` user, `/etc/openfarm` and the farm's own nginx block with nosniff/HSTS on built files; Vercel lists OPENFARM_OWNER_EMAIL; `.env.example` blank where it held samples, and a production server refuses a setting still saying example.com (`samples-left`). R9 was done in B |
| E | Done on fix/password-again: settlement approve and pay, money approve, opening the portal and an Investor's Data Copy ask for the password again once 15 minutes have passed since it was given (`password_given`, migration 20261007081751; signing in counts by the session's start); shutting the portal never asks; wrong passwords count as at sign-in and slow the account after five; the page asks in a dialog and sends the act again, cancelled it says so in Bangla (tried in the browser on the seed) |
| F | Done on fix/setup-code: S8 — a production server with no farm prints a one-time setup code in its log (once; a restart or a second instance prints none and the first stands; forgotten when the farm exists), kept only as its hash in `setup_code` (migration 20261007083850); the first Owner's sign-up must send it (the form shows a field on the first run), checked in the sign-up hook. Proven on a built server with an empty postgres:18: refused without and with a wrong code, taken with the printed one in lowercase |

## The plan

| Group | Branch | Findings | What it is |
| ----- | ------ | -------- | ---------- |
| A | fix/the-door | S4, S1–S3, S6, S7 | A Lock or a new PIN ends a stint for good (the regression of 2026-10-07 first); passwords slowed per account; `verify-password` closed; codes not locked per phone; the page not handed the raw session; no SQL sent to a phone |
| B | fix/start-and-stop | R1–R8, R12, R14 | The server exits on SIGTERM; push keys checked at start; Better Auth's log redacted; the right migrate command named; a turn's cause kept; restarts bounded; grants after migrating and checked at start; one deploy script that stops at the first failure; one database pool; no pg warning |
| C | fix/backups | K1–K11, K13, K14 | Restore creates the app login; runbook steps for backup.env, the lost day, security redone, tool versions, the drill's copy; the scratch check reads the real name; backup checks tables from the schema; the owner login kept from the app user; a failed monthly told; the cause kept; cron at the farm's hour; the Backups page honest |
| D | fix/papers-and-headers | K15, S5, R9–R11, R13 | The Data Copy holds Pay-in Notes and portal agreements; the farm address's CSP and static headers; the runbook's install steps, migration check and Vercel variable; `.env.example` placeholders commented |

Order: A first (a regression of this morning's offline fix), then B, C, D.

## Decisions

Asked 2026-10-07; the Owner gave no preference on any, so the recommended choice was taken for each (they may be changed):

- S1: after 5 wrong passwords in 15 minutes an account takes one try a minute, from anywhere, for an hour; the Owner is told in the app.
- S8: on first start the server prints a one-time setup code; signing up as Owner asks for it.
- K12: monthly copies older than twelve years are deleted; the restore runbook re-applies erasures after a restore. The notice's wording stays.
- Re-asking: approving payouts and Settlements, approving money, opening the portal and Investor data copies ask for the password when it was not given in the last 15 minutes.

Defaults taken without asking, as the obvious reading:

- S4: a stint ended by Lock or a new PIN stays ended; work done before the end is still taken, nothing after it.
- R8: the "Every deploy" steps become one script that stops at the first failure and leaves the old release running.
- R12: one database pool per process.
- S3: portal and invite codes are limited per address, not per phone, as their 40 bits are already enough.

## Backups and restore

Proven with a throwaway postgres:18 container and stub age/rclone; temp test deleted.

### A. Restoring after a disaster

1. **Proven, medium.** A restore onto a new provider fails at its last step (grants: `role "openfarm_app" does not exist`, exit 3) and cannot be run again (the database now holds tables). The runbook never says to create the login first or how to finish by hand. `scripts/restore.sh:97-103`, `scripts/app-login-grants.sql:10`, `docs/runbooks/restore-drill.md:124-136`.
2. **Traced, medium.** After a restore the nightly copy keeps pointing at the old database: the runbook says to point `app.env` at the new one, never `/etc/openfarm/backup.env` / `PRODUCTION_DATABASE_URL`. The restored farm goes uncopied until the 36-hour alert; the PITR step has no follow-on. `restore-drill.md:122-136`, `deploy.md:44-46`.
3. **Traced, medium.** The runbook promises phones fill the gap; they don't — a phone deletes each entry once accepted (`apps/web/src/lib/outbox.ts:623-624`), so up to a day synced since the copy is lost. Step 4 should say re-enter that window from paper. `restore-drill.md:137-138`.
4. **Traced, medium.** A restore silently undoes security acts since the copy: sessions, portal access, PINs, memberships come back — a lost phone, a revoked Investor, a leaver let back in. `restore-drill.md:118-139`.
5. **Proven, low.** A copy from pg_dump 18.6 (`\restrict` line 5) cannot be restored with psql 17.1. The runbook names no versions. `restore.sh:90-91`, `restore-drill.md:24-28`.
6. **Proven, low.** The drill's scratch-name check reads the URL path; `?dbname=` overrides it — `…/openfarm_scratch?dbname=openfarm` dropped the live public schema. `restore.sh:43-44,79-83`; `verify-restore.ts:26` the same.

### B. Taking the copies

7. **Proven, medium.** Renaming any of 14 tables `backup.sh` counts by name stops every copy before it starts, with no `backup_run` row and a misleading message; nothing ties the list to the schema. `scripts/backup.sh:95-118`.
8. **Traced, medium.** The app and the backup both run as `openfarm`; `backup.env` holds the owner's DATABASE_URL "readable only by the service user" — the same user. A compromised app reads the login that lifts the kept-as-written guards (and maybe rclone credentials). `deploy/openfarm.service:7-8`, `deploy/openfarm-backup.service:8-12`, `restore-drill.md:50-51`.
9. **Traced, medium.** A failed monthly copy (kept forever) is never reported: `backupGap` counts any good copy; no retry (`Persistent=` covers missed, not failed). After 90 days that month has no copy. `the-machinery-notices.ts:38-61`, `deploy/openfarm-backup-monthly.*`.
10. **Traced, low.** Why a copy failed is only in the server log ("pg_dump or encryption failed"); the dump is uncompressed and held whole in shared `/tmp` (tmpfs on Debian 13) — photos will outgrow it. `backup.sh:67,132-137,146-148`.
11. **Traced, low.** `CRON_TZ` isn't supported by Debian/Ubuntu stock cron: the 01:15 Dhaka job may run at 01:15 server time. `deploy/crontab.example:8-9`.

### C. What the Owner sees, and what the farm promises

12. **Traced, medium, Owner.** The privacy notice promises 12 years then erasure on request (`packages/domain/src/standard-templates.ts:707,751`); monthly copies are kept forever and nothing erases a person from them (`backup.sh:152-153`, `restore-drill.md:15`); the farm's own research notes s.14(6) names backups (`docs/research/bangladesh-data-protection-for-the-portal.md:237`). The drill leaves a scratch copy with NIDs and bank accounts, no step to drop it.
13. **Traced, medium.** The drill's "point a copy of the app at it" (`restore-drill.md:88-89`) doesn't say `OPENFARM_SCHEDULER=off` or blank push keys / `OPENFARM_WATCH_URL`: the copy turns the day and pushes to real phones, and pings the outside watch.
14. **Traced, low.** Backups page: a copy still running shows "failed" (row inserted `ok='no'` first, `backup.sh:96-97`) — a restored farm shows its own copy's row failed forever; size never shown though the schema says a shrink is worth seeing (`db/schema/backup.ts:25`); kind and reason in English on a Bangla screen. `routes/_authenticated/farm/backups.tsx:48-62,82,98`.

### D. The Investor's Data Copy

15. **Proven, medium.** `investors.dataCopy` leaves out the Investor's Pay-in Notes (amount, TrxID, slip), and (traced) Agreements/Amendments agreed in the portal (`agreement_offer`, `amendment_offer_answer`). The paper says "everything the farm holds about you". `packages/api/src/data-copy.ts:331-372`.

### Checked and holding

- One `pg_dump` of the whole database, every table included (voided_photo, pay_in_note*, auth tables, `drizzle.__drizzle_migrations`); photos are rows.
- Encrypted before it touches disk; restore streams decrypted into psql.
- Failed dump, too-small copy and failed upload recorded (`pipefail`); values reach psql as quoted variables.
- Retention by count works; monthlies never pruned; `BACKUP_NIGHTLIES_KEPT=0` refused.
- Backup → restore into a new database round trip works; readiness can answer; grants give `openfarm_app` read on `drizzle`.
- `--into-new-database` refuses a non-empty database; without `--clean` no DROPs.
- `verify-restore` checks the 14 tables and the joins.
- Owner alerted in-app + push after 36 hours without a good copy, once per gap. Timers `Persistent=`, no restart loop.
## Deploying and starting the server

Built with `pnpm build` and ran `.output` on ports 3998/3999 against its own Postgres; migrated with `migrate-deploy.sh`; all removed after.

### A. Stopping and starting

1. **Proven, high.** SIGTERM stops listening but the process stays alive and keeps turning the day: srvx's handler never exits (`.output/server/_libs/h3+srvx.mjs:332-363`) and Nitro's cron keeps the process alive (`index.mjs:9873-9884`); no plugin hooks `close`. Every `systemctl restart` waits `TimeoutStopSec=30` then SIGKILLs: ~30 s of 502 per deploy, a turn cut off, and a stop ending `Failed with result 'timeout'` sets off the `OnFailure=` crash alarm on every deploy. `deploy/openfarm.service:24-26`.
2. **Proven, medium.** A bad `VAPID_SUBJECT` (no `mailto:`) or a missing/garbled private key makes `webPush()` fall back to silent (`packages/api/src/push-web.ts:19-34`) while `createContext` still hands browsers the public key (`context.ts:531`): phones subscribe, nothing is sent, the runbook's check passes.
3. **Proven, medium.** Better Auth logs failed queries whole — a failed `account` insert logged the Owner's scrypt hash; emails and session tokens likewise. `createAuth` sets no `logger` (`packages/auth/src/index.ts:290-370`); the redaction covers oRPC only.
4. **Proven, low-medium.** A database behind tells the Owner to run the development command (`pnpm --filter @OpenFarm/db db:migrate`, `readiness.ts:61`), which migrates the laptop's own database.
5. **Proven, low-medium.** A failed turn keeps only `error.message` (`scheduler.ts:95-96,171`; `turn-day.ts:19` re-throws): "Failed query: … params: …" without the cause ("permission denied for table scheduler_state"), and skips `asLogged`.
6. **Traced, low.** `Restart=on-failure`, `RestartSec=5`, no `StartLimit*`: a refused start loops for ever, status "activating (auto-restart)", not failed. "Listening on" prints before the refusal, so `systemctl restart` reports success.

### B. Migrations and the runbook's steps

7. **Proven, medium.** The runbook sends the Owner to "The app's own login" before any migration: on an empty database `app-login-grants.sql` stops at line 15 (`audit_event` does not exist); the drizzle grants and default privileges never run. After migrating the app starts anyway (`isBehind` reads permission denied as not behind, `readiness.ts:39-46`), answers `/api/ready` 503 and fails every turn.
8. **Traced (failure proven).** A failed `db:migrate:deploy` exits 1 and applies nothing, but the "Every deploy" block (`deploy.md:118-150`) has no `set -e`: pasted as written it switches the release and restarts into a refusal loop.
9. **Traced, low-medium.** The "safe while the old app runs?" check (`deploy.md:126`) misses `CREATE TRIGGER`, `CREATE UNIQUE INDEX`, `FOREIGN KEY` on existing tables (e.g. 20261004212349, 20261004213940).
10. **Proven/Traced, low-medium.** "Installing the app service once" (`deploy.md:197-215`) never creates the `openfarm` user, `/etc/openfarm` (`install` exits 71), Node 24 at `/usr/bin/node` (`ProtectHome=true` hides nvm), or the farm address's nginx block.
11. **Proven, low.** `vercel.md:72` migrates with `DATABASE_URL`; the script requires `PRODUCTION_DATABASE_URL` and refuses.

### C. The build and the environment

12. **Traced, low.** Two copies of the database module in the bundle — two pools (up to 20 connections) — and of `appRouter` and the PIN/code guess counter (`.output/server/index.mjs:9639`, `_ssr/auth-*.mjs:52073`, `_chunks/router.mjs:12500`, `_ssr/language-provider-*.mjs:43513`).
13. **Traced, low.** `.env.example` has live placeholder lines (`PORTAL_URL=https://investors.farm.example.com`, `OPENFARM_OWNER_EMAIL=owner@example.com`, `VAPID_SUBJECT`); a kept `PORTAL_URL` passes validation and Welcome Letters print example.com.
14. **Proven, low.** Every start logs pg's "client.query() while already executing" deprecation (session SETs on connect, `db/src/index.ts:67-69`); pg 9 makes it an error.

### Checked and holding

- The build holds all four plugins, `farm:turn-day` and the */5 cron; turns stamped; overlapping runs share one promise; the day lock holds across processes.
- Missing `BETTER_AUTH_SECRET`, a bad time zone, `OPENFARM_YEAR_STARTS=13`, a database behind, a taken port all stop with exit 1; an unreachable database answers `/api/ready` 503.
- Migrations: one transaction, `lock_timeout=5s`, nothing applied on failure; picked by name; `LATEST_MIGRATION` pinned.
- No dev `.env` baked into the build; releases keep their own files across the symlink switch.
- `/assets/*` immutable; `sw.js`, manifest, HTML not cached long; an old open page reloads once.
- Push, SMS, watch ping have timeouts; oRPC failure lines redacted; nothing written to disk; journal bounds logs.
- Batches ≤ 4 MB, photos ≤ 2 MB, nginx 8 MB; `X-Forwarded-For` as the runbook sets it.
- `TZ=UTC`, `SET TIME ZONE 'UTC'`, `statement_timeout` 30 s, idle-transaction timeout; the day lock lifts its own.
## Security at the server's door

Proven against a production build on port 3917 with its own Postgres; temp tests deleted, server and container stopped.

### A. Passwords and signing in

1. **Proven, medium.** A password can be guessed without limit from more than one address: the only limit is 5 a minute per address; nothing counts wrong passwords against the account or tells the Owner. 30 wrong from 30 addresses, then the right one signed in. Investors sign in by phone number. Bursts of 40 from one address let 5–9 through. `packages/auth/src/index.ts:315-336`; `turnAwayWhoseDoorIsShut` runs only after a right password (`index.ts:160-195`).
2. **Proven, low-medium.** `/api/auth/verify-password` answers over HTTP (marked server-only), under the general 100/min limit: 40 guesses all answered, the right one `{status:true}`; change-password stops at the 6th. Disable it (as `/update-user`) or give it the change-password rule. `packages/auth/src/index.ts:325-335`.
3. **Proven, low-medium.** Wrong portal/invite codes are counted per phone (and `setPasswordWithCode` per email) from any address: a stranger knowing an Investor's number keeps them locked out with one request every 90 s. 40-bit codes lasting days gain nothing from it. `portal-store.ts:381-395`, `routers/people.ts:751`.

### B. Shed Phones

4. **Proven, low-medium — introduced by group A of the setup/trail/offline survey (2026-10-07).** Lock, or a new PIN, does not end a stint: within 10 minutes, one entry under the old switch token via `sync.fromTheShelf` stretches it again (`provedFor` stretches before anything is checked, outside the batch's transaction, so it stays even when the entry fails; Lock and new PIN only set `expiresAt = now`). From then the token works and `keepAwake` keeps it. `routers/sync.ts:51-91`, `device.ts:197-232`, `membership.ts:555`.

### C. What the server hands out

5. **Proven, low.** The farm address's CSP has no `script-src`/`connect-src` (the portal's uses a nonce); static files carry no `nosniff`/HSTS on the farm's address (the runbook's nginx adds them for the portal only). Hardening; no injection point found. `apps/web/src/lib/content-policy.ts:8-9`, `docs/runbooks/deploy.md:259-295`.
6. **Proven, low.** `getUser` hands the page Better Auth's whole session: raw token, IP, user agent. `apps/web/src/functions/get-user.ts:7`.
7. **Traced, low.** An entry failing with anything but a farm refusal sends the phone `error.message` — for a database failure, SQL and params — stored on `sync_entry` and shown in Needs Review. `batch-store.ts:35-38,312,331`.

### D. Setting up

8. **Traced, low, Owner.** Whoever first signs up with the Owner's email becomes Owner; nobody checks the address is theirs; new TLS certificates are public within minutes. A one-time setup code in the server log, or "sign up before DNS goes live". `packages/auth/src/first-account.ts:12-25`, `index.ts:55-73`.

**Owner (choices):** sessions 7 days renewed on use, no absolute end, no Owner act asks for the password again; a Shed Phone's token never expires and its roster holds each PIN's salt+hash (ADR 0003 — revoking is the remedy); `SMS_GATEWAY_URL` need not be https.

### Checked and holding

- CSRF on `/api/rpc` (foreign/null Origin, sibling subdomain, portal↔farm, Sec-Fetch-Site cross-site, form bodies → 403; GET 405) and `/api/auth/*` (INVALID_ORIGIN); server functions need Sec-Fetch-Site same-origin.
- Cookie `__Secure-…; HttpOnly; Secure; SameSite=Lax`, host-only; farm and portal cookies apart.
- Security headers on pages/RPC/auth/404s; portal CSP nonce; production requires https and distinct URLs.
- `/update-user`, `/delete-user`, `/change-email`, social, verification, API reference closed; `/_nitro/tasks` 404.
- Redirects: foreign `callbackURL` refused; PIN `back` checked.
- No account enumeration on sign-in, sign-up, reset.
- Sign-in limit stored in the DB, shared, not escaped by path tricks; relies on nginx `X-Forwarded-For $remote_addr`; app on 127.0.0.1.
- An Investor reaches only public/role-free procedures; the portal address refuses every other path.
- Device/switch tokens in headers, hashed server-side; enrolment codes 10 chars/15 min; PIN guesses counted first.
- Logs carry no headers/bodies; `asLogged` strips values; error answers carry no stack/SQL.
- Photos: jpeg/png/webp, 2 MB each, 4 MB a batch, nginx 8 MB; nothing decoded server-side.
- Push endpoints limited to known services; VAPID private key in env.
