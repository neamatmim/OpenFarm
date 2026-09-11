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

The machine that takes the nightly copy — and any machine doing a restore — needs four
things on its PATH: `pg_dump`, `psql`, [`age`](https://github.com/FiloSottile/age) and
[`rclone`](https://rclone.org). Both scripts check for them by name and stop before they
start, because a job that gets halfway and then finds it cannot encrypt has already spent
the night's window and left a dump of the whole farm lying in a temporary directory.

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
2. **The Manager** points the app at it and opens the **Inspector view**, then checks:
   - the herd is there, with the right count of animals on each Side;
   - yesterday's milking shows the litres they remember;
   - an Animal's history reads back — a Correction still shows what it replaced;
   - the audit trail reaches back further than the backup is old.
3. **Write the result down**: a line in the farm's ops log, with the date, the backup used,
   and who witnessed it. A drill nobody recorded is a drill nobody did.
4. If anything is missing, the drill has done its job. Do not tidy it away — find out why
   before the next nightly runs.

## When it is not a drill

Work in this order:

1. **Stop writing.** Take the app down rather than let it write into a half-restored farm.
2. **Try point-in-time recovery first.** It loses minutes; the nightly copy loses a day.
3. **Fall back to the nightly copy** only if the provider itself is gone. Restore into a new
   database, run the checks above, and point the app at it.
4. **Tell the milkers before they sync.** Their phones are holding work; an outbox replays
   into whatever it is pointed at, and it will fill the gap the restore left.
5. **Write down what happened**, while it is still fresh, in the same ops log.
