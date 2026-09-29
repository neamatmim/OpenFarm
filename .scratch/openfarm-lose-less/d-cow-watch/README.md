# D — The cow nobody watches: heats missed, milk falling, milk gone

On 2026-09-29 the Owner chose this gap from the second "lose less" survey (`../survey.md`). Every missed heat costs
about 21 days of milk and a calf's worth of time. The app waits for someone to see the heat; after that it counts well,
but nothing asks after a cow who goes quiet.

**What the app already does** (read from the code, 2026-09-29):

- A **Heat** raises the AI work (CONTEXT.md:187). Pregnancy Check 45 days after the Attempt, dry-off 60 days before
  calving, Repeat Breeder after 3 failures (`db/schema/farm.ts:92-111`). The Repeat Breeder queue
  (`domain/breeding.ts:160-271`) sits on the Manager's home (`routers/home.ts:98-105,165`) and the Vet's tab.
- A cow nobody saw in heat shows up nowhere until `cullOpenDays` (150) puts her on the Owner's cull list
  (`domain/cull.ts:181-186`).
- Heifers: `ageOf` exists (`domain/age.ts:42-61`); nothing reads age against service.
- A cow's milk page shows her last 30 records and lactation total (`routers/milk.ts:48,247-313`); home shows the herd's
  7-day average. Nothing compares a cow with her own recent days.
- Each Session is checked tank against cows (`domain/milk.ts:65-87`); a flagged Session is on the Mismatches tab but
  nobody is told. Tank and Dispatches are shown side by side for one day (`routers/milk.ts:180-204`), never added up
  across days, never flagged.

| #   | Ticket                                      | Blocked by |
| --- | ------------------------------------------- | ---------- |
| 01  | Research: the four husbandry numbers        | —          |
| 02  | Heat watch: after calving and after service | 01         |
| 03  | Heat watch: heifers not served              | 02         |
| 04  | Cows giving less                            | 01         |
| 05  | Milk not accounted for                      | —          |

**Settled with the Owner, 2026-09-29, and not to be re-asked:**

- **Milk not accounted for is told past an Owner-only 3%** of the week's litres to Bulk (decision 5).
- Decisions 1–4 and 6–8 stand as recommended (60 days then 24 without a heat; 18–24 return window fixed; 18 months for
  heifers pending 01; 20% over 2 days; calves shown not flagged; Staff see their Pens' tags; flagged Sessions listed
  only) until the Owner says otherwise.

**Settled in drafting:**

- **Lists, not alerts, for cows.** The heat watch and cows giving less are lists the Manager works from, as Repeat
  Breeders are. Only milk not accounted for sends a Notice, because it is money leaving the farm.
- **Worked out, never stored.** A cow leaves a list when the facts under her change; nobody ticks her off.
- **No new record.** Reads Heats, Services, Calvings, Milk Records, Dispatches the farm already keeps.
- **"heat watch" is already a glossary phrase** (CONTEXT.md:201, under Abortion) — widen **Heat**, add no word.

## Decisions for the Owner

1. **When a cow with no heat seen goes on the watch** — 60 days after calving, no heat ever / **60 days after calving,
   then any open cow with no heat in the last 24 days (recommended)** / 90 days.
2. **Return-heat window after a service** — **days 18–24, a fixed fact (recommended)** / same as a Farm Parameter /
   17–25.
3. **Heifer age for first service** — 15 / **18 months (recommended, until 01 reads NG-GLPP §12.1.1.1)** / 24 months. By
   age only; dairy heifers are rarely weighed.
4. **Milk drop** — 15% over 2 days vs previous 7 / **20% over 2 days vs previous 7 (recommended)** / 25% over 3 days.
5. **When the Owner is told about milk not accounted for** — reuse the Manager's 5% milk Tolerance / **a new Owner-only
   3% of the week's to-Bulk litres (recommended: the person checked should not set the line)** / 10 litres a day.
6. **Litres to Calves** — **show per calf per day, no flag (recommended; the calf milk allowance is still open)** / flag
   above an allowance / leave out.
7. **Barn Staff see the heat watch** — **yes, tags only, their own Pens (recommended: they see heats)** / no.
8. **A flagged Session (tank vs cows)** — **list only, count on the Manager's home (recommended)** / a Digest notice.
