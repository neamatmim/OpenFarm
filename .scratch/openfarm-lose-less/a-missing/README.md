# A — A missing animal, and a head count

On 2026-09-29 the Owner chose this gap from the second "lose less" survey (`../survey.md`). One bull costs ৳1–2 lakh.
Today the farm could lose one and the app would not notice.

**What the app already does** (read from the code, 2026-09-29):

- The 08:00 health round looks at every animal, Pen by Pen, checked by the Manager (`standard-playbook.ts:152-156`). Its
  skip reason "Animal not found" (:180) writes nothing and tells nobody (`effects/observation.ts:63-72`, checked).
  Effects are told only _that_ a Step was skipped (`effect.ts:183`); the reason is on the completion only
  (`db/schema/instance.ts:118`).
- An animal leaves only as Sold, Died or Culled (`lifecycle.ts:17-25`, `herd.ts:17-28`). A Mortality is died or culled
  (`herd.ts:293`) and needs a burial or burning (`routers/animals.ts` ~821). No Exit for a missing or stolen animal.
- The herd is counted once, in the opening register. Feed is the only count procedure, and it has no trigger.
- A Venture animal that dies ends its Holding with ৳0 back (`holding.ts:205`). Settlement is blocked while any animal
  still stands (`settlement-store.ts:211-215`).

| #   | Ticket                     | Blocked by |
| --- | -------------------------- | ---------- |
| 01  | "Not found" is heard       | —          |
| 02  | Found, or written off Lost | 01         |
| 03  | The evening Head Count     | 01         |
| 04  | A Venture's lost animal    | 02, Owner  |

**Settled with the Owner, 2026-09-29, and not to be re-asked:**

- **The herd is counted every evening** at lock-up, Pen by Pen, blind (D1).
- **A missing animal is told by push only**, to the Owner and the Manager at once — no SMS (D3).
- **A lost Venture animal is made good by the Farm** at her cost to date (D6). The lost/stolen clause is new investor
  paper wording and goes to the lawyer and the Shariah scholar before 04 is built.
- The other decisions (D2 Staff count / Manager recounts on a difference, D4 written off by hand, asked after 7 days,
  D5 GD number required for theft) stand as recommended until the Owner says otherwise.

**Settled in drafting:**

- **A missing animal is still in the herd until somebody writes her off.** She stays on her Pen's board and the round.
  Missing is a record against her, not a State.
- **Lost is the fourth Exit**, not a Mortality: no carcass, no cause of death, no burial.
- **Stolen or strayed is the cause, in free text**, as a Mortality's cause is. Not two States.
- **Only the Manager's "found" closes a Missing.** A later "Well" is a skip and could be the wrong cow.

## Decisions for the Owner

- **D1. How often the herd is counted** — **every evening at lock-up, per Pen (recommended: theft is at night; the
  evening count and the 08:00 round bracket it)** / weekly / only the round's "not found".
- **D2. Who counts, who checks** — **Barn Staff count, the Manager recounts on a difference (recommended)** / the
  Manager checks every count / two staff count apart.
- **D3. How a missing animal is told** — **Alert + SMS to Owner and Manager at once (recommended: the first hours decide
  whether a stolen bull is found before a haat; the third SMS kind, CONTEXT.md:438)** / push only / Manager now, Owner by
  escalation.
- **D4. When Missing becomes Lost** — **the Owner writes her off by hand, asked after 7 days, a Farm Parameter
  (recommended)** / automatically after N days / only with a thana GD number.
- **D5. Thana GD number on a write-off** — optional / **required when the cause is theft (recommended)**.
- **D6. Who bears a lost Venture animal** — the Venture, as a death / **the Farm makes it good at her cost to date
  (recommended: the signed agreements make only a death the Venture's loss, `standard-templates.ts:101`; keeping the
  cattle is the Farm's job; `docs/research/cattle-investment-schemes.md:478`)** / Farm pays for theft, Venture for
  strays. **Touches investor paper wording the lawyer and Shariah scholar approved — any change goes back to them
  before 04 is built.**
