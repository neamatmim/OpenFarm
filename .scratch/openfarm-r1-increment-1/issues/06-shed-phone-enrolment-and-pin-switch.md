# 06 — Shed Phone enrolment and PIN Switch

**What to build:** The Manager enrols a Shed Phone, which then holds a device session. The Manager sets a 4-digit PIN for each Staff member; PIN hashes sync to enrolled devices so a Staff member can PIN Switch to themselves with no signal. The phone auto-locks after the inactivity parameter. Every write from a device session carries the active user as `recorded_by`; the server rejects a `recorded_by` who is not enrolled on that device. Vet Diagnoses and Prescriptions are never accepted from a device session. (ADR 0003.)

**Blocked by:** 03

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 1.

- [ ] Manager can enrol a device from its own browser (device session created), name it by Shed, and revoke it
- [ ] Manager sets and rotates a Staff PIN; the hash reaches enrolled devices on next sync
- [ ] PIN Switch works offline and shows the active user's name and photo; auto-lock after the parameter (default 5 min)
- [ ] A write from a device session with a `recorded_by` not enrolled on that device is refused (tested through the primary seam with the device-session helper)
- [ ] A Vet-only procedure called from a device session is refused even if the active user holds the Vet Role
- [ ] Owner, Manager and Vet personal logins are unaffected
