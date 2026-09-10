# Staff onboarding and training

Status: resolved

Type: grilling

Blocked by: —

Map: [OpenFarm Release 1](../map.md)

## Question

**Grilling.** Barn Staff will meet the app on their own Android phones, in Bangla, with icons and photos. Decide how they get started and what the spec must include for it:

- Device: staff's own phones, or farm-provided? Minimum Android/Chrome version; who installs the PWA and logs them in (Manager, per the roles matrix).
- First-run: a guided first SOP with the Manager beside them, or a practice mode with fake animals?
- Login model for shared phones: one phone per person, or a shared parlour phone with quick user switching (PIN)? This affects attribution (recorded_by) and must be decided before build.
- Training material: none beyond the app; a one-page Bangla card per SOP; short videos?
- Who trains new hires later — the Manager, using what?

Resolved when the device and login model, the first-run approach, and the training material list are written down.

## Answer

Decided with the Owner on 2026-09-10.

### Devices & login

- **Shed Phones**: one or two farm-provided rugged Android phones per shed, charged and on the wall; **Android 10+, Chrome**, installed PWA. Staff with their own suitable Android may install it too.
- **PIN Switch**: a Shed Phone holds a **device session** (enrolled by the Manager); each Staff member **switches to themselves with a 4-digit PIN** before recording. The active person is stamped on every entry as `recorded_by`; the device session is what syncs. Auto-lock after inactivity (farm parameter, default 5 min) so nobody records as the previous person.
- Owner, Manager and Vet use **their own phones** with a normal personal login.

### First run

The **Manager stands beside a new Staff member for their first real SOP instance**; the app shows a **one-time Coach Overlay** on each new screen type (dismissable, re-openable from a help icon). No practice mode.

### Training material (Release 1)

**One-page Bangla SOP Card per SOP**, generated from the published SOP Version (name, steps, icons, evidence), printable and shown in-app; regenerates on each new Version. Videos and a shed-wall cheat-sheet are not in R1.

### Later hires

The **Manager** trains, the same way. When the Manager marks it, the app records **"trained on SOP X by Y on date"** as an Audit Event — traceability for "did this person know the procedure?".

### Consequences

- **Auth model**: two kinds of principal — a _personal session_ (Owner/Manager/Vet/Staff on own phone) and a _device session + active user via PIN_ (Shed Phone). Better Auth holds the device session; PINs are per-user secrets verified locally against a synced hash so PIN Switch works **offline**. `recorded_by` is always the active user, never the device. This refines [Offline capture](./17-offline-capture-and-sync-decision.md) (attribution from session at capture) and [Roles](./14-roles-and-permissions-matrix.md) (Manager enrols Shed Phones and sets Staff PINs).
- **ADR candidate**: shared Shed Phones with PIN-switched users on a device session — hard to reverse in the auth design and surprising to a later reader. Written: [`docs/adr/0003-shed-phones-with-pin-switched-users.md`](../../../docs/adr/0003-shed-phones-with-pin-switched-users.md).
- Glossary: Shed Phone, PIN Switch, Coach Overlay, SOP Card.
