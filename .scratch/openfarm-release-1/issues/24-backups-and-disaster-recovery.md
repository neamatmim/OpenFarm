# Backups and disaster-recovery targets

Status: resolved

Type: grilling

Blocked by: —

Map: [OpenFarm Release 1](../map.md)

## Question

**Grilling.** [Audit trail and correction rules](./16-audit-trail-and-correction-rules.md) decided indefinite retention with off-site backups, and the system is cloud-hosted ([Offline capture and sync decision](./17-offline-capture-and-sync-decision.md)). Reliability was _not_ chosen as a headline guarantee, so keep this proportionate to one farm. Decide:

- **RPO** (how much data may be lost): recommended ≤ 1 hour, given phones hold an outbox that can replay recent entries anyway.
- **RTO** (how long the farm can be without the system): recommended ≤ 1 working day — barn work continues on paper for a day; longer and the Playbook stops being enforced.
- Backup cadence and location: managed Postgres point-in-time recovery + nightly off-site copy (different provider/region), photos included.
- Restore drill: who tests a restore, how often (recommended quarterly, Manager-witnessed).
- Hosting provider/region for Bangladesh latency, and who holds the credentials (Owner).

Resolved when RPO, RTO, cadence, location, drill and provider are written down. Offer an ADR only if the provider choice is unusual.

## Answer

Decided with the Owner on 2026-09-10. Proportionate to one farm; reliability is not a headline guarantee, but these targets are stated so the spec can be held to them.

- **RPO ≤ 1 hour · RTO ≤ 1 working day.** Phones hold an outbox, so recent barn entries replay after a restore; the farm can run a day on paper.
- **Backups**: managed Postgres with **point-in-time recovery**; **nightly encrypted off-site copy** to a _different provider/region_; **photos backed up the same night**; **90 nightlies kept, monthlies kept forever** (honours indefinite retention).
- **Restore drill**: **quarterly**, into a scratch environment; **verified by the Manager opening the Inspector view**; result recorded (as an Audit Event of the scratch system, and a line in the farm's ops log).
- **Hosting**: managed Postgres + app host in the **Singapore region**; provider is an implementation detail provided it offers PITR and the region. The repo's docker-compose stays for local development only. **Owner holds all root credentials** in a password manager; **Manager gets operational access only**.

### External dependencies to list in the spec

Postgres provider (PITR) · app host · off-site backup storage · web-push service keys · SMS gateway (BDT billing) · DNS/TLS · password manager. Each has an owner (Owner) and a documented recovery step.

### Not needed

No ADR — nothing unusual in the provider shape.
