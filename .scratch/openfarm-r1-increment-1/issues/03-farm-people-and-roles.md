# 03 — Farm, people and Roles

**What to build:** A single Farm root exists and every record created from here on belongs to it. People hold one or more Roles (Owner, Manager, Staff, Vet with full or visiting scope). The oRPC context resolves the Better Auth session to a person and their Roles, and every write records which Role was used. The Owner can create users, assign Roles and remove access from a Bangla-first admin screen; the Manager can invite Staff subject to Owner approval.

**Blocked by:** 01, 02

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 1.

- [ ] A person can hold several Roles; a procedure that needs a permission succeeds when any held Role grants it and records the Role used on the resulting Audit Event (Audit Events themselves arrive in 04 — here, on the record's `role_used` field)
- [ ] Owner can create/disable users and assign Roles; Manager can invite Staff and the invite waits for Owner approval
- [ ] A Staff person's Pen Assignments are stored and returned in the context (used by 05/08 for scoping)
- [ ] Tests through the primary seam: a Staff client is refused an Owner-only procedure; a Manager invite is not usable until approved; role_used is recorded
