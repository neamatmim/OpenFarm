# 15 — Deployment, PITR backups and restore runbook

**What to build:** The Nitro build deploys to the managed host in the Singapore region against a managed PostgreSQL with point-in-time recovery. A nightly job takes an encrypted off-site copy to a different provider/region including photos, keeping 90 nightlies and monthlies forever. A scripted restore rebuilds a scratch environment from a backup, and the test harness can run against it to verify. The runbook names who does what; the Owner holds root credentials and the Manager operational access. (Provisioning the accounts themselves is the Owner's go-live prerequisite; this ticket delivers the configuration, jobs and scripts.)

**Blocked by:** 01

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 1.

- [ ] A documented deploy command builds and ships the app; environment configuration is complete and secret-free in the repo
- [ ] PITR is enabled on the database; the nightly off-site copy runs and its success is observable
- [ ] The restore script recreates a scratch environment from a chosen backup and the harness's smoke test passes against it
- [ ] A restore-drill runbook exists for the quarterly drill, including what the Manager checks in the app
- [ ] Credential ownership is documented per the spec: Owner root, Manager operational
