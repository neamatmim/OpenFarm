# K — One purse to an outing

Survey item K (`../survey.md`), opened 2026-10-02. CONTEXT.md:303 promises that one outing is paid for by one purse,
that every Animal on a funded outing belongs to whoever funded it, and that an outing counted home takes nothing more.
The Venture's half of that is kept; the Farm's own Float, added on 2026-09-30, was never joined to it, and a Venture's
bull bought with no outing at all is paid for by nobody the app can name.

**What the app already does** (read from the code, 2026-10-02; none of it yet proven by a failing test):

- **A Venture's Float counted home locks its outing.** `assertTripIsOpen` (`venture-store.ts:541-565`) is asked at
  Intake (`intake-store.ts:167-183`), on an outing's cost Correction (`corrections/buying-trip.ts:73`) and on an Intake
  Correction, for the outing she is on and the one she moves to (`corrections/intake.ts:172-173`). It reads only a
  Venture's reconciled `float_out`.
- **The Farm's Float counted home sets `buying_trip.float_reconciled_at`** (`cash-store.ts:475`), and only
  `requireOpenFarmTrip` reads it (`cash-store.ts:387-416`) — so it refuses a second Handover for the outing and nothing
  else. A Farm outing counted home still takes animals, Hasil and cost changes.
- **`drawFloat` refuses an outing already carrying another Venture's animals** (`routers/ventures.ts:1801-1817`), or
  one either purse has floated already (`ventures.ts:1857-1870`). Its owner check is
  `owner !== null && owner !== row.id` (`ventures.ts:1812`), so the Farm's own animals pass, and `paidFromTheFloat`
  then moves the whole outing's cost into the Venture's purse (`ventures.ts:1884`, `trip-store.ts:103-130`).
- **`assertSheBelongsWithTheFloat` reads only a Venture's `float_out`** (`intake-store.ts:192-210`): a Venture's
  animal may go on an outing the Farm floated. Intake Correction asks it only when the owner changes
  (`corrections/intake.ts:181-191`), so a Correction that moves her **outing alone** is not asked at all — not in the
  survey, read here.
- **A Venture's Intake needs no outing, and no Float.** `bookIntakeMoney` books her price and Hasil as a Money Event
  in the Venture's purse, cash by default (`intake-store.ts:132-161`). A cash one names the writer's hand
  (`money-store.ts:372-390`), but Cash in Hand reads the Farm's purse alone (`cash-store.ts:49`), and a Venture
  Account's balance is folded from Venture Movements alone (`venture-store.ts:158-167`, `488-521`) — so nobody's hand
  is down by her price and the account still believes it holds it. At Settlement that is a remainder of a taka or more,
  neither swept nor blocked (`settlement-store.ts:118-129`, `483-489`; plan L, 01).
- **The Intake sheet** offers every outing the trips list returns and says only a Venture's Float on it
  (`routers/trips.ts:89-140`, `intake-sections.tsx:296-301`); a Farm-floated or counted-home outing looks like any
  other. Whose she is, is a choice whenever a Venture is buying.
- The seed buys a Venture's cattle off a Float and nothing else (`seed/ventures.ts:341-345`); 28 api test files take
  an animal in with a `ventureId`, most with no outing and in cash.

| #   | Ticket                                          | Blocked by |
| --- | ----------------------------------------------- | ---------- |
| 01  | The Farm's Float counted home shuts its outing (done) | —          |
| 02  | One purse to an outing, both ways (done) | 01         |
| 03  | A Venture's bull with no outing is paid by bank | 02         |

**Settled with the Owner, 2026-10-02, and not to be re-asked:**

- **A bull bought for a Venture with no Buying Trip** — at the farm gate, from a neighbour — **is allowed, but only
  paid by bank transfer or cheque straight from the Venture Account, with its reference.** Never cash, so no pocket
  ever carries Investors' money.
- The three defects (a counted Farm Float still open; `drawFloat` over the Farm's animals; a Venture's animal on a
  Farm-floated outing, at Intake and on Correction) are fixed as CONTEXT.md:303 already says, without a question.

**Settled in drafting** (the Owner may overrule):

- **A Venture's animal on an outing goes on that Venture's Float, drawn first.** An outing no Float has gone on yet
  refuses her (`no_float_on_the_trip`, the word the Farm's float already uses) — CONTEXT.md:301 says the Float is
  "drawn before the lorry went". With 03's rule this leaves exactly two ways a Venture pays for a bull: its Float, or
  the bank with no outing. Without it, a Venture's bull on an un-floated outing is the same pocket-money hole as one
  with no outing.
- **The direct payment is a Venture Movement written from the Intake**, as a Sale's is written from the Sale
  (CONTEXT.md:329): kind `intake_out`, cattle money off the Cattle Budget as a Float is, moved when the Intake's price
  is put right and never corrected on its own. **Venture Movement** is widened rather than a new word.
- **A Venture's Intake with no outing is the Owner's.** The Venture Account is hers and every movement on it is her
  personal-session act; the Manager is told so on the sheet.
- **A Correction may still change her owner** (the survey lists an owner Correction moving her money with her as
  handled): making a no-outing Intake a Venture's asks for the bank and its reference and writes the movement; making
  it the Farm's takes the movement away, and the Bank Check month it sat in goes stale as any changed month does.
- **The Farm's Handover refusing an outing that carries a Venture's animals is not built.** After 02 and 03 no
  Venture's animal can stand on an outing without her own Float, which `requireOpenFarmTrip` already refuses; a guard
  nothing can reach cannot be proven by switching it off.
