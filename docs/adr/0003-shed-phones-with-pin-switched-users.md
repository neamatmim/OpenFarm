---
status: accepted
date: 2026-09-10
---

# Shared Shed Phones hold a device session; people are identified by PIN Switch

Barn Staff at one farm cannot be assumed to own a suitable Android phone, and a milking parlour is not a place to type a password, yet every entry must be attributed to a person for the audit trail. We decided that farm-provided Shed Phones hold a Better Auth _device session_ enrolled by the Manager, and that a Staff member becomes the active user by entering a personal 4-digit PIN, verified locally against a synced hash so it works without signal; the phone auto-locks after inactivity. Every entry carries the active user as `recorded_by` and the device as `device_id`; the device session is what syncs the outbox. Owner, Manager and Vet keep ordinary personal logins on their own phones. We rejected one-login-per-person on shared devices (people would stay logged in as each other) and a single anonymous "barn" login (no attribution — breaks the audit trail and the regulatory treatment records).

**Consequences**: the auth layer has two principals — personal session, and device session + active user — and the roles matrix must treat "enrol a Shed Phone" and "set a Staff PIN" as Manager permissions; PIN hashes are per user and must be rotated by the Manager if a phone is lost; the server rejects an entry whose `recorded_by` is not a user enrolled on that device; Vet diagnoses and prescriptions are never accepted from a device session, only from the Vet's personal session.

Decided on the wayfinder map: `.scratch/openfarm-release-1/issues/26-staff-onboarding-and-training.md`; see also ADR 0002 for the outbox this attribution rides on.
