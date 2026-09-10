# Shape of an SOP

Status: resolved

Type: grilling

Blocked by: 01

Map: [OpenFarm Release 1](../map.md)

## Question

**Grilling + domain modeling.** Use the Playbook list from [List the Playbook](./01-list-the-playbook.md) — pick 3–4 representative SOPs (one per trigger type) and take them apart.

Decide what an SOP _is_ in the system, precisely enough to build the engine:

- **Steps** — is an SOP a linear checklist, or can steps branch/repeat? Can a step apply per-animal within a group task (e.g. "milk each cow" = one sub-step per cow)?
- **Evidence** — what does completing a step require: a tick, a number (litres, kg, temperature), a choice, a photo, a note? Which are mandatory?
- **Triggers** — schedule, event, animal-state; who defines them; can one SOP have several?
- **Assignment** — to a role, a named person, or a shift? Can it be reassigned?
- **Sign-off** — does someone review? What can they do: approve, reject-and-redo, annotate?
- **Missed / late** — what happens when an SOP isn't done on time: reminder, escalation to the Manager, block on a dependent SOP?
- **Versioning** — when the Owner changes an SOP, what happens to in-flight instances and to history?

Resolved when the SOP model (definition vs instance vs step completion) is written down with the vocabulary in `CONTEXT.md`.

## Answer

Decided with the Owner on 2026-09-10, anchored on the milking, treatment/withdrawal, dry-off/calving and sale SOPs from the Playbook.

### The model

- **SOP Definition** — authored procedure: name (Bangla + English), purpose, one or more **Triggers** (schedule / event / animal-state), the **role** it is assigned to, the **checker role**, a due time and grace window, and an ordered list of **Steps**.
- **SOP Version** — every change to a Definition creates a new immutable Version. History always shows which Version an instance followed. In-flight instances finish on the Version they started on; new instances use the current one.
- **SOP Instance** — one occurrence of an SOP falling due (e.g. _morning milking, 11 Sep_). Assigned to a **role**; anyone in the role can claim it; the Manager can pin it to a person or reassign. States: _due → in progress → completed → approved | sent back → (redo)_ and _overdue → missed (closed by Manager with reason)_.
- **Step** — linear, in order, no branching. A Step may be marked **repeat per animal** in the instance's group, producing one **Step Completion** per animal (milking: clean udder / milk / record litres, per cow).
- **Evidence** on a Step — any of: tick (always: who, when), number with unit and a sane range that warns outside it, choice from a list, photo, free-text note. Each is required or optional per Step.
- **Effects** — a Step may **write a farm record** (litres → milk record; weight → weigh-in; "calving confirmed" → cow to _milking_, calf created) and an animal's **state may gate** other SOPs' steps: a cow under milk withdrawal makes her per-animal milking step a **hard block** (milk to discard, not bulk); an animal under meat withdrawal makes the sale SOP refuse to complete.
- **Sign-off** — checker reviews the completed instance and evidence: **approve** or **send back with a reason** for the doer to fix/redo. Unreviewed instances sit in a visible queue.
- **Missed / late** — past due + grace ⇒ _overdue_, the Manager is alerted (channel: separate ticket). It stays open until done, or the Manager closes it as _missed_ with a reason. Nothing silently disappears.
- **Authoring** — the Owner authors. The Manager can **propose** a change; Owner approval publishes it as a new Version.

### Assumed — correct me if wrong

- In a per-animal block, an animal can be **skipped with a reason** (sick, sold, dry) and the skip is recorded as evidence.
- A schedule Trigger produces one Instance per group the SOP applies to (morning milking = one instance for the milking herd, not one per cow).

### Consequences for other tickets

- Roles matrix: needs _claim_, _pin/reassign_, _approve/send back_, _close as missed_, _propose_, _publish_ as distinct permissions.
- i18n: SOP content (names, step text, choice labels) is authored per Version in both languages.
- Offline: an instance must be claimable and its Step Completions capturable offline; gating rules need the animal's last-known state on the device.
- Audit: Versions are immutable; Step Completions, sign-offs and missed-closures are all attributed events.

ADR candidate (hard to reverse, surprising later, real trade-off): _SOP Definitions are immutable Versions and Instances pin the Version they started on._ Written: [`docs/adr/0001-immutable-sop-versions.md`](../../../docs/adr/0001-immutable-sop-versions.md).

Unblocks → [Offline capture and sync decision](./17-offline-capture-and-sync-decision.md), [Bangla/English content and i18n approach](./18-bangla-english-content-and-i18n.md), [Prototype: Barn Staff phone flow](./20-prototype-barn-staff-sop-flow.md); [Roles and permissions matrix](./14-roles-and-permissions-matrix.md) still waits on the health model.
