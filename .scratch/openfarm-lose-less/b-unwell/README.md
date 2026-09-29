# B — A sick animal nobody answers for

On 2026-09-29 the Owner chose this gap from the second "lose less" survey (`../survey.md`). A cow seen off her feed on
Monday can wait unseen until the Vet's weekly visit, and drop off the Vet's list a fortnight later.

Words: CONTEXT.md avoids "sighting" (Observation), "case" (Diagnosis), "outbreak" (Notifiable Disease). No new nouns.

**What the app already does** (from the code, 2026-09-29):

- The health round offers eleven words (`standard-playbook.ts:162-174`). "Well" is a skip: no Observation is written.
- Only a Heat raises work; the Observation effect does nothing more for any other word (`effects/observation.ts:40`).
  Only Heats are read as happenings (`instances-store.ts` ~457).
- Other Observations sit on the Vet's `waiting` list (`routers/diagnoses.ts` ~250) for 14 days (`VET_WINDOW_DAYS`, :38),
  those with no Diagnosis (`unanswered`, :89). The Manager's home (`routers/home.ts:76-112`), notices and Digest never
  show them.
- Milking's skip "Unwell" (`standard-playbook.ts:55`) writes nothing. An effect is told only `skipped: boolean`, not the
  reason (`effects/effect.ts:183`, `effects/milk.ts:38`).
- A Calving puts the dam into Milking and sets `stateChangedAt` to the calving time (`herd-store.ts:670-671`). No work
  follows for her; no round word covers milk fever or a retained afterbirth.
- A Diagnosis has no outcome (`db/schema/health.ts:77-101`). Nothing counts how often one animal falls ill.
- Several animals with mouth or feet sores in one Pen raise nothing. Notifiable matching compares exact words, by design
  (`health-store.ts:476`).

| #   | Ticket                                  | Blocked by |
| --- | --------------------------------------- | ---------- |
| 01  | An Observation raises work with a clock | —          |
| 02  | "Unwell" at milking is an Observation   | 01         |
| 03  | The fresh-cow check                     | 01         |
| 04  | Sores in one Pen tell the Owner         | 01         |
| 05  | Ill again: outcome and count            | —          |

**Settled with the Owner, 2026-09-29, and not to be re-asked:**

- **An unanswered Observation is late after 24 hours** (a Farm Parameter); **bloat, laboured breathing, down cow and a
  retained afterbirth after 1 hour** (decisions 1–2).
- **A Diagnosis answers it, or the Manager** recording "Vet called — coming on (date)" or "watching, looked again"
  (decision 3).
- Decisions 4–7 stand as recommended (5-day fresh-cow check; 3 sores in a Pen in 48 h told at once; `unwell` its own
  word; ill-again on the Manager's queue only) until the Owner says otherwise.

**Settled in drafting:**

- **The answer is SOP work, not a new record.** A Heat already raises work through a FarmEvent (`sop.ts:158`). An
  Observation that is not a Heat does the same, so Overdue, Escalation to the Owner (`instances-store.ts:763`,
  `farm.escalationMinutes`) and the Manager's late-work queue come for free, with no new Alert kind.
- **A Diagnosis answers it.** A Diagnosis on the Observation calls the work off. The Manager's own answer is the work's
  Steps, never a Diagnosis (BVC Act, `diagnoses.ts:40-48`).
- **The fresh-cow check hangs on the State** `milking` with an offset, as weaning hangs on `calf`. No Calving event.

## Decisions for the Owner

1. **Hours before an unanswered Observation is late** — 12 / **24 (recommended, a Farm Parameter)** / 48. The next
   morning's round finds it late; the Vet comes weekly.
2. **Urgent words told at once** (bloat, laboured breathing, down cow, afterbirth) — **yes, 1 hour (recommended)** /
   same clock as the rest. Bloat and milk fever kill within hours.
3. **Who answers an Observation** — only a Diagnosis / **a Diagnosis, or the Manager recording "Vet called" or
   "watching" (recommended)** / Barn Staff too.
4. **Fresh-cow check length** — 3 / **5 days (recommended)** / 10. Milk fever and a retained afterbirth show in 1–3
   days; ketosis in the first week.
5. **Mouth/feet sores in a Pen** — **3 animals in 48 h, told at once (recommended)** / in the Digest / leave it to the
   Vet.
6. **Milking's "Unwell"** — **its own word `unwell` (recommended)** / mapped to "Off feed".
7. **Ill again and again** — a fourth Cull Reason at 3 Diagnoses in 12 months / **on the Manager's queue only, first
   (recommended)**.
