# 04 — Audit Event on every write

**What to build:** Every state change goes through one transactional write helper that also inserts an append-only Audit Event — actor, Role used, device id and sequence (null for personal sessions), `recorded_at` and `received_at`, entity, action, before/after payload — in the same transaction. Facts change only by Correction rows that supersede with a reason; no delete exists. The Owner and Manager can browse the audit log; every other Role sees only their own actions.

**Blocked by:** 03

**Status:** done (2026-09-11)

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 1.

- [x] Every procedure that writes uses the helper; a lint or test guard fails when a write bypasses it
- [x] Forcing a failure after the domain row but before the Audit Event leaves neither row (tested)
- [x] The Audit Event carries actor, role_used, device_id, device_seq, recorded_at, received_at, entity, entity_id, action, before, after
- [x] A Correction row supersedes a record with a reason and the original stays readable; there is no delete procedure for farm records
- [x] Owner/Manager see the full log filtered by entity, person and date; Staff and Vet see only their own actions

**Done note:** `audit_event` table (farm, entity, entity_id, action, actor, role_used, device_id, device_seq, recorded_at, received_at, before, after, reason, supersedes_id; UUIDv7 ids from `@OpenFarm/db/ids`) and `role_assignment.revoked_at` (roles are revoked, never deleted), one migration. `audited(context).write(event, apply)` runs the domain write and the Audit Event in one transaction; `auditedBootstrap` covers the one write before a Farm exists. Every existing writer (language, farm bootstrap, invites, approvals, role assignment, disable/enable) moved onto it; a guard test fails the suite if any router calls `context.db.insert/update/delete` or `.delete(` at all. `people.correctName` is the first Correction (reason required, `supersedes_id` to the previous event, original readable in `before`). `audit.list` filters by entity, entity id, person and date; Owner/Manager see all, Staff/Vet only their own. Web: `/admin/audit` in Bangla with filters and before/after detail. Forced-failure test uses a context whose farm does not exist so the audit insert's foreign key fails after the domain write — both roll back.

**Review outcomes folded in (multi-agent review of 03 + 04):** `audited(context, farmId?)` takes the farm explicitly (null for the few pre-farm events; `audit_event.farm_id` nullable) and `roleUsed` is a real `Context` field set by `requireRole`, which now runs on the post-auth context only. `before`/`after` may be readers that run inside the same transaction, so snapshots cannot lie; NOT_FOUND is thrown inside `apply`, so no audit row commits for a missing record. Roles live in `roles-store.ts` (`activeRolesFor`, `grantRoles`, `revokeRoles`, `ACTIVE_ROLE`): kept Roles and their attribution are untouched on re-assignment, revoked ones are reactivated only by an Owner's explicit assignment, the farm always keeps an Owner, and a person invited before signing up receives their Roles on first sight (never resurrecting revoked ones). `approveInvite` is atomic again (status/farm in the update predicate). `disable` expires sessions in the same transaction and Better Auth refuses sign-in for a disabled person. Bootstrap takes an advisory lock and re-checks. `latestEventFor` tie-breaks on the UUIDv7 id. Audit day filters are farm-local half-open days computed by the API. Web: admin routes gated by Role, `/setup` redirect when no farm, header links by Role, person rows re-keyed on roles, awaiting-signup invites shown, language toggle errors toasted. The write guard reads once and uses stateless regexes.
