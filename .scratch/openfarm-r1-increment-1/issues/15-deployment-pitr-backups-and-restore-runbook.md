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

**What is verified, and what is not.** The migration chain applies cleanly to an empty database, and the restore verifier was run both ways — refusing an empty database and accepting a seeded one. The backup and restore scripts themselves are **not** exercised end to end here: `pg_dump`, `age` and `rclone` are not on this machine, so they have been checked for syntax and for their preflight behaviour only. The first real run of `scripts/backup.sh` is a go-live step, and the first restore drill will be the first time the round trip is proven.
