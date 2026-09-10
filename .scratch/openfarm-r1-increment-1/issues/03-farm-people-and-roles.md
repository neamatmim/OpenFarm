# 03 — Farm, people and Roles

**What to build:** A single Farm root exists and every record created from here on belongs to it. People hold one or more Roles (Owner, Manager, Staff, Vet with full or visiting scope). The oRPC context resolves the Better Auth session to a person and their Roles, and every write records which Role was used. The Owner can create users, assign Roles and remove access from a Bangla-first admin screen; the Manager can invite Staff subject to Owner approval.

**Blocked by:** 01, 02

**Status:** done (2026-09-11)

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 1.

- [x] A person can hold several Roles; a procedure that needs a permission succeeds when any held Role grants it and records the Role used on the resulting Audit Event (Audit Events themselves arrive in 04 — here, on the record's `role_used` field)
- [x] Owner can create/disable users and assign Roles; Manager can invite Staff and the invite waits for Owner approval
- [x] A Staff person's Pen Assignments are stored and returned in the context (used by 05/08 for scoping)
- [x] Tests through the primary seam: a Staff client is refused an Owner-only procedure; a Manager invite is not usable until approved; role_used is recorded

**Done note:** `farm`, `role_assignment` (unique per farm/user/role, with `granted_by_role`), `invite` (pending → approved/revoked, with `invited_by_role`) and `pen_assignment` tables plus `user.disabled_at`, one migration. The API `Context` now resolves the Farm, the person, their Roles and Pen Assignments per request; `requireRole(...)` picks the highest held Role that grants the permission and puts it on the context as `roleUsed`, which invite and role-assignment writes record. Routers: `farm.bootstrap` (first signed-in person names the Farm and becomes Owner; refused once a Farm exists) and `farm.current`; `people.me/list/invite/approveInvite/assignRoles/disable/enable`. A Manager's invite is `pending` and may only carry the Staff Role; an Owner's is approved at once; approval grants the Roles to the person with that email when they exist. Disabled people are refused everywhere even with a live session. Harness seeds the Farm and a Role per principal, plus a "newcomer" with none. Web: `/_auth/admin/people` (Bangla; Owner edits Roles/access and approves; Manager sees and invites Staff) and `/_auth/setup`. Pen Assignments are stored with an opaque `pen_id` until Pens arrive in 05, which adds the foreign key. Vet full/visiting scope is deferred to the roles-matrix ticket.
