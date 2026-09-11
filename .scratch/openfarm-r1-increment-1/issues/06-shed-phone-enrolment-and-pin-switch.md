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

**Review outcomes folded in (follow-up commit).** Two findings meant PIN Switch could not work at all, and one meant the PIN bought no security:

- **The roster was unreachable with nobody signed in**, so a freshly claimed phone could never show anyone to PIN in as. `resolveDeviceSession` now returns the device even when nobody is switched in, and the context carries the phone's Farm so a locked phone can read the roster.
- **A bad token 500'd every request**, including `devices.claim` — a revoked phone was bricked with no way to re-enrol. Resolution never throws now; it reports a `deviceStatus` (`unknown` / `revoked` / `locked` / `ok`) the phone's own screen can act on.
- **The active person was client-asserted.** Anyone holding a device token could name any enrolled person — including an Owner — and act with their Roles, because the roster hands out every salt and hash. Now `devices.switchUser` proves the PIN **on the server** and issues a switch token that *names* the person; the phone sends that token, never a user id. The local check stays, because it is what keeps PIN Switch working with no signal (ADR 0003) — but it no longer authorises anything on its own.
- A Manager could set an **Owner's** PIN, routing around the rule that only the Owner grants Roles above Staff. `setPin` now requires farm membership and restricts a Manager to Staff.
- Enrolment codes had ~1.7M possibilities, not 10^8, with no unique index and an unthrottled public `claim`. Codes are now ten characters of unambiguous base32 (~10^15) with a unique index.
- The phone auto-locked on a fixed timer rather than on inactivity (`touchActiveUser` was never called), so a worker was logged out mid-task five minutes after their PIN.
- The device's Farm was authorised and then discarded; `buildContext` now resolves the Farm the phone is enrolled on.
- `staff_pin` was keyed on the user alone despite carrying a farm; it now has a composite unique index.

PIN Switch sessions are authentication state, not farm records, so — like `lastSeenAt` and Better Auth's own session rows — they are written in the auth layer rather than through `audited()`; the *act* of switching is still audited. The write-discipline guard caught this distinction being blurred and forced it to be explicit.
