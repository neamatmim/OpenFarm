# 06 — Shed Phone enrolment and PIN Switch

**What to build:** The Manager enrols a Shed Phone, which then holds a device session. The Manager sets a 4-digit PIN for each Staff member; PIN hashes sync to enrolled devices so a Staff member can PIN Switch to themselves with no signal. The phone auto-locks after the inactivity parameter. Every write from a device session carries the active user as `recorded_by`; the server rejects a `recorded_by` who is not enrolled on that device. Vet Diagnoses and Prescriptions are never accepted from a device session. (ADR 0003.)

**Blocked by:** 03

**Status:** done (2026-09-11)

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 1.

- [x] Manager can enrol a device from its own browser (device session created), name it by Shed, and revoke it
- [x] Manager sets and rotates a Staff PIN; the hash reaches enrolled devices on next sync
- [x] PIN Switch works offline and shows the active user's name and photo; auto-lock after the parameter (default 5 min)
- [x] A write from a device session with a `recorded_by` not enrolled on that device is refused (tested through the primary seam with the device-session helper)
- [x] A Vet-only procedure called from a device session is refused even if the active user holds the Vet Role
- [x] Owner, Manager and Vet personal logins are unaffected

**Done note:** ADR 0003's two principals are now real in the type system. `Context` carries a personal `session` **or** a `device`, plus an **`actor`** — the person a write is attributed to, whichever principal it arrived by; every router reads `context.actor.id` rather than reaching into the session, which is what makes "the device is never the author" enforceable. Schema: `shed_phone` (token hash, one-time enrolment code with expiry, claimed/last-seen/revoked) and `staff_pin` (salt + derived hash), plus `farm.pin_auto_lock_minutes` (default 5).

Enrolment: the Manager creates a phone and reads out a one-time code (30 minutes); the phone exchanges it for its own token; the exchange is audited and the code is single-use. PINs are PBKDF2-SHA256 at 210k iterations with a per-user salt, derived in `@OpenFarm/domain` so the same code runs server-side and in the browser; the phone caches the roster (salt + hash, never the PIN) and verifies offline with a constant-time compare. `requirePersonalSession()` refuses office work from a shared phone whatever Role the active person holds — the mechanism increment 3's Vet-only clinical procedures will use.

**Known limit, written into the code:** a 4-digit PIN has 10,000 possibilities, so anyone holding the synced hash can search it exhaustively; the iteration count buys hours, not secrecy. What protects the farm is that a PIN is useless without a device token and the Manager can revoke a lost phone instantly — the mitigation ADR 0003 relies on. PINs gate attribution on a farm-provided phone, not remote access.

Two things fell out while here: `requireAuth` treated "no personal session" as an expired session, so a device session was refused — expiry is now checked only when there *is* a personal session, the device token and its revocation being the gate. And the write-discipline guard from ticket 04 caught `devices.claim` writing outside the audited helper; `lastSeenAt` remains a deliberate exception (telemetry, written at most once every five minutes, with a comment saying why).
