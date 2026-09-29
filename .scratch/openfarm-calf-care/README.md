# Calf care — the first day, the first months, and what the farm loses

On 2026-09-29 the Owner asked whether the app has every way for the farm to lose less, and chose calf care as one of the
first two gaps to close. Calves are usually the largest share of a dairy farm's deaths. In Bangladesh, calf mortality
was 6.29% on small farms (Islam 2015) and 12.28% on 73 commercial farms (Parvez 2020); DLS's guideline calls more than
10% before weaning unacceptable. Diarrhoea is the commonest illness, then navel ill and pneumonia; pneumonia kills most;
the first month is the deadliest. (`docs/research/newborn-calf-care.md` §8. An earlier draft of this plan quoted 30.9% /
8.64%, which is an Ethiopian study and is not used.)

**What the app already does** (read from the code, 2026-09-29):

- A **Calving** is recorded by a Step. Each live calf becomes an Animal (State `calf`, Dairy side, her dam's Pen, the
  next dairy Tag Number). A stillborn calf is created and leaves as Died with cause "stillbirth".
- A live calf fires the `arrival` event (at the moment the Calving was recorded), which can raise per-animal work.
- The daily health round offers "Scours" (diarrhoea) and "Laboured breathing" for every animal, calves included.
- The Standard Playbook has **no** calf care. The Release 1 plan listed "Newborn calf care — colostrum within hours,
  navel care, tagging — event: calf born" (SOP 19), and it was never built.
- **Weaning** is a glossary word and nothing else: nothing records it, and a bull calf crosses to Fattening only by a
  Move somebody remembers to make.
- Nothing reports calf deaths apart from other deaths, or deaths by age.

| #   | Ticket                                  | Blocked by  |
| --- | --------------------------------------- | ----------- |
| 01  | Research, and the questions for the Vet | —           |
| 02  | Newborn calf care                       | 01          |
| 03  | Weaning                                 | 02          |
| 04  | Calf doses in the Standard Playbook     | 01, the Vet |
| 05  | What the farm loses in calves           | 03          |

04 is built now and **adopted** only once the Vet has named each product and its withdrawal days, as the fattening
doses wait today. Each ticket ends with somebody opening the pages in both languages.

**Settled with the Owner, 2026-09-29, and not to be re-asked:**

- **Colostrum is late after 2 hours.** The newborn work is due when the Calving is recorded and overdue two hours on:
  the Manager is told, then the Owner after the farm's escalation window. The second feed is due within 12 hours.
- **Weaning at 3 months.** Weaning work is raised at 90 days, with a weigh-in. The day stays the Owner's to change, as
  any Version's offset is.
- **Every calf is weighed at birth**, on a scale or with a weigh tape. It sets her colostrum (about a tenth of her
  weight) and starts her growth record.
- **Calf doses are built now and adopted later**: deworming at about two weeks, FMD and anthrax at four months with
  the FMD booster a month on, HS and BQ at six months — each waiting for the Vet's product and withdrawal days.

**Settled in drafting** (the Owner may still change these):

- **Calf rearing lives in SOP Steps, not a new model** (Release 1 spec). The one new record is Weaning, because a bull
  calf's crossing to Fattening hangs on it and nothing else can say when a calf stopped being one.
- **The newborn work is per calf**, raised by her arrival, as a bought bull's Arrival check is. The Calving Step stays
  as it is: it records the birth, and the first day's care is a job with its own clock.
- **"Calf lost" means died before weaning**, stillbirths counted apart, so the figure the Owner reads is what the
  farm's own care changes.
- **Brucellosis (female calves, 4–8 months) is left out of 04.** A procedure cannot yet be told "heifers only"; it
  waits until the Owner asks, or a Step learns to skip by sex.
