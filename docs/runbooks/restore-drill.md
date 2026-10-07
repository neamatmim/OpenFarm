# Restoring the farm, and the quarterly drill

The farm can lose a day and carry on: barn work goes on paper, and the phones hold what they
recorded until there is something to send it to. What the farm cannot lose is its records.

**RPO ≤ 1 hour. RTO ≤ 1 working day.** Both are stated so they can be held to, not because
reliability is a headline promise — this is one farm, and the measures are proportionate.

## What is copied, and how often

- **Point-in-time recovery** on the managed database. This is what an RPO of an hour rests
  on; a nightly copy alone would not reach it.
- **A nightly encrypted copy** to a different provider and region, taken by
  `scripts/backup.sh nightly`, compressed before it is encrypted. Photos are included because
  they are rows, not files.
- **90 nightlies kept. Monthlies kept twelve years**, as long as the farm's privacy notice says
  it keeps a person's records, and then deleted by the monthly job itself (the Owner,
  2026-10-07). A failed monthly is tried again two hours later, up to four times, and the Owner is
  told of it.

Whether it is actually happening is a question the app answers: **Admin → Backups** shows the
last copy that worked and every attempt since. A farm that has not been copied for two nights
is one disk away from losing its own records, and that is the number to watch.

## What the host needs

The machine that takes the nightly copy needs `pg_dump`, `psql`, `gzip`,
[`age`](https://github.com/FiloSottile/age) and [`rclone`](https://rclone.org) on its PATH —
`pg_dump` and `psql` from **PostgreSQL 18 or newer**, the database's own version: a copy taken
by a newer `pg_dump` will not load into an older `psql`, and the restore checks this before it
loads anything. It writes the copy under `/var/tmp`, not the shared `/tmp` that is often held
in memory; `BACKUP_WORK_DIR` names another place.

A machine doing a _restore_ needs those, of the same version or newer, plus `pnpm` and a
checkout of this repo with `pnpm install` run — the last step of a restore is a check that lives
in the repo. On the Owner's own laptop, check `psql --version` before the day it matters.

Both scripts look for their tools by name and stop before they start, because a job that
gets halfway and then finds it cannot encrypt has already spent the night's window and left
a dump of the whole farm lying in a temporary directory.

## Installing the nightly

Nothing takes a copy until something is scheduled to. On a host with systemd:

```sh
# The timers run the scripts from here; a deploy copies only the app, so this is done once
# and again whenever scripts/ changes.
sudo install -d -o root -g root -m 0755 /srv/openfarm/scripts
sudo install -o root -g root -m 0755 scripts/backup.sh scripts/restore.sh /srv/openfarm/scripts/
sudo cp deploy/openfarm-backup.* deploy/openfarm-backup-monthly.* /etc/systemd/system/
sudo systemctl enable --now openfarm-backup.timer openfarm-backup-monthly.timer
systemctl list-timers 'openfarm-backup*'      # and see them listed
```

Without systemd, `deploy/crontab.example` is the same two jobs at the same times.

The jobs run as **their own user, `openfarm-backup`**, never the app's: `backup.env` holds the
database owner's address, which can lift the guards on what the farm keeps as written, and a
compromised app must not be able to read it. Make the user once, and give it the file and rclone's
configuration:

```sh
sudo useradd --system --create-home --home-dir /var/lib/openfarm-backup --shell /usr/sbin/nologin openfarm-backup
sudo install -o openfarm-backup -g openfarm-backup -m 0400 backup.env /etc/openfarm/backup.env
sudo -u openfarm-backup rclone config      # the off-site remote, kept in that user's own home
```

`/etc/openfarm/backup.env` holds `DATABASE_URL` (the owner's), `BACKUP_AGE_RECIPIENT` and
`BACKUP_DESTINATION`; neither it nor `/var/lib/openfarm-backup` is readable by `openfarm`.

**Then check the app.** Admin → Backups is where you see the timer doing its job, and a timer
that exists but fails every night looks exactly like a timer that works until somebody looks.
Once the first copy is in, the farm watches too: when no copy has succeeded for a day and a
half, the Owner gets an Alert in the app and on her phone, once for each gap. A farm that has
never taken a copy is not told — that is the checklist's job.

## Restoring

```sh
export BACKUP_AGE_IDENTITY=/path/to/backup-key.txt   # from the password manager
export BACKUP_DESTINATION=offsite:openfarm

scripts/restore.sh openfarm-nightly-20260911T000000Z.sql.gz.age \
  postgres://user:password@host:5432/openfarm_scratch
```

The script refuses any target whose database, as the database itself names it, does not say
`scratch` — an address's `?dbname=` is no way round it. A restore that could touch the live farm
is not a drill. A copy taken before copies were compressed ends `.sql.age`, and restores the same
way.

It fetches, decrypts, rebuilds the schema and then checks that what came back is what the copy
held. The backup job counts the farm's key tables — its own record of itself, its people, its
herd, its Playbook and the work done on it, the milk, the trail — and writes the counts into
the copy before it takes it; the check wants every one of them back, and names any table
that came back short. **A restore that produces an empty database succeeds quietly**, which
is the worst way for a backup to be wrong: the drill passes, the runbook is ticked, and the
farm finds out on the day it matters.

So the first drill can be run the day the server is up, before a single animal is written
down: a farm with no milk yet held no milk, and gives none back. A copy taken before the job
counted is held instead to what a working farm cannot be without, herd and milk included.

## The quarterly drill

Once a quarter, and after any change to the database provider.

1. **The Owner** runs the restore above into the scratch environment and points a copy of the
   app at it — the Owner, because only the Owner has a login on the server. The copy's
   environment is **not** `app.env` as it stands: set `OPENFARM_SCHEDULER=off`, and leave out
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `SMS_GATEWAY_URL` and
   `OPENFARM_WATCH_URL`. Otherwise the copy turns the day on itself, pushes yesterday's work to
   the real staff's phones and the Owner's, and pings the outside watch — which then cannot see
   that the real server has died.
2. **The Manager** looks at four screens in it:
   - **Animals** — the herd is there, with the right count on each Side;
   - **a milking Instance** — yesterday's litres are the ones they remember, per cow;
   - **an Animal's history** — it reads back, and a Correction still shows what it replaced;
   - **Admin → Audit** — the trail reaches further back than the backup is old.
3. **Write the result down** twice: a line in the farm's ops log with the date, the backup
   used and who witnessed it — and, in the restored system itself, dismiss an Alert or make
   a note so the drill leaves an Audit Event in the copy it was run against. A drill nobody
   recorded is a drill nobody did.
4. If anything is missing, the drill has done its job. Do not tidy it away — find out why
   before the next nightly runs.
5. **Drop the scratch database** once the drill is written down. It holds the whole farm — every
   Investor's NID and bank account among it — and nothing else watches over it.

## What the farm depends on, and how each comes back

Every one of these is the Owner's, and every one needs a way back. The password manager is
the thing that makes the rest recoverable, so it is the one to protect hardest.

| Depends on                       | If it is lost                                                                                                                                                                 |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Password manager                 | Everything else is recovered _from_ here. Keep the recovery kit off-line and somewhere else; without it nothing below can be re-established.                                  |
| Managed PostgreSQL (PITR)        | Restore from PITR first, the nightly copy second. A new database means a new `DATABASE_URL` in the app's environment.                                                         |
| App host                         | Rebuild from `docs/runbooks/deploy.md`; the app holds no state of its own.                                                                                                    |
| Off-site storage (rclone remote) | Its credentials live in rclone's config on the backup host, **and a copy in the password manager**. Without that copy no backup can be fetched after the backup host is gone. |
| Backup key (age)                 | The private half is the only thing that can read a backup. Lost, every existing copy is unreadable — take a fresh one the same day and write the loss down.                   |
| Web-push keys                    | Generate new ones. Every browser silently stops being told until each agrees again in Settings; the in-app Alert carries on regardless.                                       |
| SMS gateway (increments 2–3)     | Not used yet. When it is: account with the provider, credentials in the password manager, and the farm pays the bill in BDT.                                                  |
| DNS and TLS                      | Re-point the record at the new host; the host issues its own certificate. Until then phones cannot sync, and their Outboxes hold the work.                                    |

## When it is not a drill

Work in this order:

1. **Stop writing.** Take the app down rather than let it write into a half-restored farm.
2. **Try point-in-time recovery first.** It loses minutes; the nightly copy loses a day. A
   provider's recovery usually makes a **new** instance with a new address: everything in step
   4 applies to it as much as to a restored copy.
3. **Fall back to the nightly copy** only if the provider itself is gone. Make a new, empty
   database, with the farm's owner login — and, on a new provider, **make the app's login
   first**, as the database's owner: `CREATE ROLE openfarm_app LOGIN PASSWORD '…';` with a new
   password from the password manager. The script refuses to begin without it, rather than load
   the whole farm and stop at the last step. It refuses a database that holds anything, so the
   live farm can't be written over. It runs the same checks a drill does, and gives the app's own
   login back its grants (`scripts/app-login-grants.sql`), which a copy never carries:

   ```sh
   scripts/restore.sh --into-new-database openfarm-nightly-<when>.sql.gz.age \
     postgres://<owner>:…@<host>:5432/<new database>
   ```

4. **Point everything at the new database**, not only the app:
   - `DATABASE_URL` in `/etc/openfarm/app.env`, as `openfarm_app`; restart, and check `/api/ready`;
   - `DATABASE_URL` in `/etc/openfarm/backup.env`, as the owner — or the nightly copy goes on
     copying the old database, or failing, and the restored farm is not copied at all;
   - `PRODUCTION_DATABASE_URL` in the password manager, which the next deploy migrates.

   Then run a copy by hand (`sudo systemctl start openfarm-backup.service`) and see it on
   **Admin → Backups**.

5. **Redo what was done since the copy to keep people out.** A copy carries the farm as it was:
   a phone taken off the list since, an Investor's access taken away, a PIN set anew, somebody who
   left, a password changed — all come back as they were. Redo each from the ops log, and sign
   everybody out — as the owner, in the restored database: `DELETE FROM session;`. Everybody signs
   in again; the Shed Phones keep their enrolment, and each person PINs in afresh.
   After any restore, **erase again** anybody who asked to be erased since the copy was taken: a
   copy keeps what the farm erased after it.
6. **Re-enter what the phones had already sent.** A phone keeps an entry only until the farm has
   taken it: everything recorded between the copy and the failure — up to a day of milk, feed and
   doses — was taken by the old farm and is not on any phone. It comes back from the paper the
   barn kept, written up again. What the phones still hold, they send on their own; tell the
   milkers before they sync.
7. **Write down what happened**, while it is still fresh, in the same ops log.
