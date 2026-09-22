# Restoring the farm, and the quarterly drill

The farm can lose a day and carry on: barn work goes on paper, and the phones hold what they
recorded until there is something to send it to. What the farm cannot lose is its records.

**RPO ≤ 1 hour. RTO ≤ 1 working day.** Both are stated so they can be held to, not because
reliability is a headline promise — this is one farm, and the measures are proportionate.

## What is copied, and how often

- **Point-in-time recovery** on the managed database. This is what an RPO of an hour rests
  on; a nightly copy alone would not reach it.
- **A nightly encrypted copy** to a different provider and region, taken by
  `scripts/backup.sh nightly`. Photos are included because they are rows, not files.
- **90 nightlies kept. Monthlies kept for ever**, which is what indefinite retention means
  in practice.

Whether it is actually happening is a question the app answers: **Admin → Backups** shows the
last copy that worked and every attempt since. A farm that has not been copied for two nights
is one disk away from losing its own records, and that is the number to watch.

## What the host needs

The machine that takes the nightly copy needs four things on its PATH: `pg_dump`, `psql`,
[`age`](https://github.com/FiloSottile/age) and [`rclone`](https://rclone.org).

A machine doing a _restore_ needs those, plus `pnpm` and a checkout of this repo with
`pnpm install` run — the last step of a restore is a check that lives in the repo.

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

Either way the job reads `/etc/openfarm/backup.env` — root-owned, readable only by the
service user, holding `DATABASE_URL`, `BACKUP_AGE_RECIPIENT` and `BACKUP_DESTINATION`.

**Then check the app.** Admin → Backups is where you see the timer doing its job, and a timer
that exists but fails every night looks exactly like a timer that works until somebody looks.
Once the first copy is in, the farm watches too: when no copy has succeeded for a day and a
half, the Owner gets an Alert in the app and on her phone, once for each gap. A farm that has
never taken a copy is not told — that is the checklist's job.

## Restoring

```sh
export BACKUP_AGE_IDENTITY=/path/to/backup-key.txt   # from the password manager
export BACKUP_DESTINATION=offsite:openfarm

scripts/restore.sh openfarm-nightly-20260911T000000Z.sql.age \
  postgres://user:password@host:5432/openfarm_scratch
```

The script refuses any target that does not say `scratch` in its name. A restore that could
touch the live farm is not a drill.

It fetches, decrypts, rebuilds the schema and then checks that what came back holds a farm —
its own record of itself, its herd, its Playbook and the trail. **A restore that produces an
empty database succeeds quietly**, which is the worst way for a backup to be wrong: the drill
passes, the runbook is ticked, and the farm finds out on the day it matters.

## The quarterly drill

Once a quarter, and after any change to the database provider.

1. **The Owner** runs the restore above into the scratch environment.
2. **The Manager** points the app at it and looks at four screens:
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
2. **Try point-in-time recovery first.** It loses minutes; the nightly copy loses a day.
3. **Fall back to the nightly copy** only if the provider itself is gone. Restore into a new
   database, run the checks above, and point the app at it.
4. **Tell the milkers before they sync.** Their phones are holding work; an outbox replays
   into whatever it is pointed at, and it will fill the gap the restore left.
5. **Write down what happened**, while it is still fresh, in the same ops log.
