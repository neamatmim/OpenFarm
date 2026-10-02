# 03 — A Venture's bull with no outing is paid by bank

**What to build:** A Venture pays for a bull one of two ways: its own Float on the outing she came home on, or — with no
outing, at the farm gate or from a neighbour — by bank transfer or cheque straight from the Venture Account, with its
reference, which takes her price and Hasil out of the account as a Venture Movement written from her Intake. Never
cash, and never on an outing no Float of hers paid for.

**Blocked by:** 02

**Status:** open.

- [ ] **Glossary:** **Venture Movement** widened — an Animal bought with no outing, paid straight from the account and
      written from her Intake, moved when the Intake's price is put right and never corrected on its own (as a Sale's
      is). **Intake** — a Venture's is paid by its Float or, with no outing, by bank from its account. **Buying Float**
      — a Venture's animal on an outing goes on that Venture's Float, drawn first. **Venture Account** unchanged: it
      already says "never cash".
- [ ] **Schema:** `intake_out` added to `VENTURE_MOVEMENT_KINDS` (cattle money on the `spentBdt` line, as a Float is,
      in `WHAT_IT_DOES`); `venture_movement.intake_id`, by id and not by foreign key, as `sale_id` is. Migration
      `…_venture_bought_by_bank`, both dev databases, then the seed. **Before migrating,** list the Venture Intakes with
      no outing or on an outing without their Venture's Float on the dev databases (none expected on the seed, which buys
      only off Floats); the live farm's are the Owner's to give references for when she deploys — none is guessed.
- [ ] **Rule — Intake:** a `ventureId` with no `buyingTripId` needs the Owner (`owner_only`), payment by bank
      (`venture_buys_by_bank`, new) and a reference; the movement is written in the Intake's own transaction for price +
      Hasil, refused over what the Cattle Budget holds (`cattle_budget_short`, as `drawFloat` is). A `ventureId` on an
      outing with no Float of hers is refused `no_float_on_the_trip` (the word exists, line 173 of
      `correction-refusal.ts`; its English says "trip" — read it again beside a Venture before reusing it), asked after
      `assertSheBelongsWithTheFloat` so that 02's refusals keep their own words. The Money
      Event in the Venture's purse stays, as the costing's record of what she cost, and names no hand.
- [ ] **Rule — Correction** (`corrections/intake.ts`): one function, as `bookSaleProceeds` is, decides after every
      Intake Correction whether she is paid from the account and writes, moves or removes the movement — a price or
      Hasil change moves its amount; making a no-outing Intake a Venture's needs the bank and a reference; making it the
      Farm's, or putting her on an outing, removes it; taking a Venture's bull off her outing needs the bank and a
      reference. `whyItStands` (`corrections/venture-movement.ts`) refuses correcting an `intake_out` movement on its own
      (`correct_the_record`, as a Sale's).
- [ ] **Refusal words:** `venture_buys_by_bank` in `apps/web/src/lib/correction-refusal.ts`, `refusal.ventureBuysByBank`
      in both message files ("A Venture's bull bought with no outing is paid from its account by bank, with the
      reference").
- [ ] **Screen:** the Intake sheet, a Venture chosen and no outing: the Owner sees the payment fixed to bank, the
      reference and the day it moved; the Manager is told the Owner takes this one in and is not offered the Venture
      there. The Venture's money list shows the movement as "কেনা (খামারের গেট) · tag", read from the Intake.
- [ ] **Tests** (a new `routers/venture-bought-by-bank.test.ts`):
  - **First, red before the fix:** a Venture's bull taken in with no outing and in cash — accepted today, the Venture
    Account's balance unmoved by her price; refused `venture_buys_by_bank`.
  - By bank with a reference: the balance and the Cattle Budget fall by price + Hasil, the movement names her Intake,
    and the Settlement's account adds up with her in it.
  - The Manager refused; over the Cattle Budget refused; on an outing no Float of hers paid for refused.
  - Correction: her price moves the movement; made the Farm's removes it; the movement refuses a Correction of its own.
  - **Proved by switching off** the bank rule, the un-floated outing, the Owner's gate and the Cattle Budget: each red.
  - The existing test files that take a Venture's bull in with no outing in cash are moved to the bank or to a Float,
    through one shared helper rather than file by file — and every file's count read from Test Files, not Tests.
- [ ] **Somebody opens it** (seed): the Owner takes in a bull for a Venture in Buying (one started in the browser if the seed has none buying) at the gate, by cheque
      "চেক ১২৩৪"; the Venture card's Cattle Budget falls by her price and her line reads in its money list. The Manager
      opening the same sheet is told it is the Owner's.
