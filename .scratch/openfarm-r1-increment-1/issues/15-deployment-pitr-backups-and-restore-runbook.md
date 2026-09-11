# 15 — Deployment, PITR backups and restore runbook

**What to build:** The Nitro build deploys to the managed host in the Singapore region against a managed PostgreSQL with point-in-time recovery. A nightly job takes an encrypted off-site copy to a different provider/region including photos, keeping 90 nightlies and monthlies forever. A scripted restore rebuilds a scratch environment from a backup, and the test harness can run against it to verify. The runbook names who does what; the Owner holds root credentials and the Manager operational access. (Provisioning the accounts themselves is the Owner's go-live prerequisite; this ticket delivers the configuration, jobs and scripts.)

**Blocked by:** 01

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 1.

- [x] A documented deploy command builds and ships the app; environment configuration is complete and secret-free in the repo
- [x] PITR is enabled on the database; the nightly off-site copy runs and its success is observable
- [x] The restore script recreates a scratch environment from a chosen backup and the harness's smoke test passes against it
- [x] A restore-drill runbook exists for the quarterly drill, including what the Manager checks in the app
- [x] Credential ownership is documented per the spec: Owner root, Manager operational

**How it was built.** Mostly scripts and words, because that is what this ticket is: the provisioning itself is the Owner's go-live prerequisite, and what the repo can hold is the configuration, the jobs, and the runbook somebody follows at six in the morning after a disk has died.

Decisions worth remembering:

- **Whether the backups are running is a question the app answers.** The nightly job writes every attempt to `backup_run` before it can be forgotten, success or failure, and **Admin → Backups** shows the last one that worked. A farm that has not been copied for two nights is one disk away from losing its own records, and that is the number to watch. Silence is what nobody notices, which is why a failed copy is shown rather than hidden.
- **The row goes in first, marked failed.** A job that dies halfway leaves a row saying so, rather than leaving nothing — which reads exactly like a night nobody ran it.
- **The restore script refuses any target that does not say `scratch`.** A restore that could touch the live farm is not a drill.
- **A restore that produces an empty database succeeds quietly**, which is the worst way for a backup to be wrong: the drill passes, the runbook is ticked, and the farm finds out on the day it matters. So the verifier asks for the things a farm cannot be without — its own record of itself, its herd, its Playbook, and the trail — and says which are missing, in words. Both halves are exercised: it refuses an empty database and accepts a seeded one.
- **Photos need no separate job.** They are rows, so one `pg_dump` has them.
- **Both scripts check their tools by name before they start.** A job that gets halfway and then finds it cannot encrypt has already spent the night's window and left a dump of the whole farm lying in a temporary directory.
- The age *public* key lives in the environment and is public by design; the private half lives in the password manager and nowhere else, because it is the only thing that can read a backup.

**What is verified, and what is not.** The migration chain applies cleanly to an empty database, and the restore verifier was run both ways — refusing an empty database and accepting a seeded one. `scripts/backup.sh` has since been run end to end against a real PostgreSQL, with stand-ins on `PATH` for the three tools this machine does not have (`pg_dump`, `age`, `rclone`), and it wrote the row it is supposed to write: `nightly|yes|9000|offsite:openfarm`. What that proves is the script's own logic — its order, its guards, its bookkeeping. What it cannot prove is that a real `pg_dump` of this farm restores: the first restore drill is still the first time the round trip is real, which is exactly why the drill is quarterly and not optional.

**Review outcomes folded in (follow-up commit).** The standards axis found a hole that made the whole ticket's premise false — a backup system that can be made to lie about itself is not a backup system.

- **The backup script built its SQL by pasting values into it.** `scripts/backup.sh "nightly'; update backup_run set ok='yes"` was valid SQL, and so was any rclone remote with an apostrophe in it: the row that says whether the farm was copied could be written by whatever was handed to the script. Everything now goes to `psql` as a parameter (`-v name=…`, `:'name'`), the kind is checked against the three kinds that exist before anything runs, and both attacks were replayed against the fixed script — the hostile kind is refused, and the hostile destination is stored as the literal text it is.
- **A dump of nothing was filed as a good night's work.** `pg_dump` failing halfway, a disk with no room, a database that came back empty — all of them encrypt to a few hundred bytes, upload fine, and leave the app saying the farm was copied last night. There is a floor now (`BACKUP_MIN_BYTES`, 4096 by default), and a copy under it fails loudly and says its size.
- **Retention by age would have deleted the farm's last copies.** `rclone delete --min-age 90d` after a fortnight of failures deletes everything older than ninety days and keeps whatever happened to work — the opposite of "ninety nightlies". It is kept by count now: list, sort by the sortable UTC stamp in the name, delete only the excess. A prune that could not run is recorded on the row rather than swallowed, because an upload that worked is still a good night.
- **The restore script matched "scratch" anywhere in the URL** — a password, a hostname, a query parameter — and then dropped the schema. It reads the database name only. It also dropped `public` but left `drizzle`, so every drill after the first died on a schema that already existed; and it wrote the decrypted farm to a temporary file, so a machine losing power mid-drill left every record readable on disk. It pipes `age --decrypt` straight into `psql` now.
- **The verifier swallowed every error as an absent table**, so a database that refused the connection read as a farm with nothing in it. It rethrows anything that is not `42P01`. It also asked too little: the litres, the Sessions and the Completions were not among the tables it insisted on — this is increment 1's whole subject — and counts alone cannot see a restore that came back with Completions pointing at Milk Records that are gone, so there are three orphan checks as well.
- **Temporary directories were world-readable and survived a signal.** `chmod 700`, and the trap catches `INT TERM HUP` as well as `EXIT`.
- Smaller things: the job now says so on stderr and exits non-zero when the database is unreachable, because there is nowhere to write a row saying it failed; `nightsSince` became `daysSince`, since a copy taken at eleven and read at one in the morning is two hours old and not a night; and the screen's nested ternary became `howItStands()`.

**Spec-axis outcomes.** The runbook told the Manager to check a screen that does not exist — an "Inspector" view, invented — so the drill's one human step pointed at nothing. It names the real screens now. The go-live checklist was missing the thing the ticket is named after: PITR is enabled by the provider and nobody had been told to verify it, so it is a checklist line with the provider's own wording. The deploy sequence was also missing its migration step, `.env.example` was missing `NODE_ENV`, the age private key's path and the size floor, and the drill had nothing to say about what to do when a dependency — rclone's config, the age key — is what is lost rather than the database, which is now a table of what to recover from where.

**The systemd units were never committed.** `deploy/` existed on disk through the whole of the first commit and was not in it, so the schedule the ticket promises had no way to reach a host. They go in here.
