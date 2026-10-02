# N — Weights nobody checks

Survey item N (`../survey.md`), drafted 2026-10-02. A bull is bought, sold and bought back by the kilo, and each time
the kilo is a figure somebody typed: the Manager at the haat, the Manager at the sale, the Owner's own scale weeks ago.
The farm weighs every fattening animal every fortnight, and sets none of those readings against the typed ones.

**What the app already does** (read from the code, 2026-10-02):

- An **Intake** keeps the weight she came off the lorry at (`schema/fattening.ts:75-76`, "Weight on arrival"); it is
  the first point her gain is read from, and it cannot be corrected (`corrections/intake.ts:83-95` corrects price,
  Hasil, seller, payment, Venture and window only). Her later readings are **Weigh-ins** (`schema/fattening.ts:159-185`),
  fortnightly, Quarantine included (`standard-playbook.ts:383-397`).
- A Weigh-in is judged only against the Weigh-in before it: `effects/weigh-in.ts:58-71` reads her last unflagged
  Weigh-in, never her Intake weight, and `implausibleChange` returns nothing when there is none
  (`domain/fattening.ts:42-60`). **Her first Weigh-in is never set against what she was bought at.** Her gain on her
  Ration is not judged until she has settled in, 21 days (`domain/expected-gain.ts:51`).
- **Early losses by seller** count, for the Owner, the Intakes of the last year that died, were culled or were diagnosed
  within thirty days, by seller and by haat (`early-losses-store.ts`, `domain/early-losses.ts`,
  `components/home/early-losses.tsx`). Weight is not among them.
- A **Sale** keeps the weight typed on the day — "not her last Weigh-in: a beast loses weight on a lorry"
  (`schema/fattening.ts:261-263`). `tellIfSoldUnderCost` tells the Owner of a fattening Sale under her cost, or under
  that typed weight at the low price a kilo (`animal-price-store.ts:181-259`, `domain/animal-price.ts:78-96`). **A
  weight typed low lowers the floor with it.**
- **Shrink** (`domain/shrink.ts`) is shown — on the sale sheet as the weight is typed (`sale/sale-sheet.tsx:296-318`),
  on each Selling Trip (`routers/selling-trips.ts:57-92`) and on the sale's papers (`routers/papers.ts:332`) — and
  said with its age past 21 days (`SHRINK_STALE_DAYS`). **It is never told to anybody.**
- The **Internal Sale** and the **Wind-up Period**'s buy-back both price an animal on `whatSheLastWeighed`
  (`venture-store.ts:611-628`): her latest Weigh-in of any age, a flagged one included. Only "never weighed" is refused
  (`routers/ventures.ts:2139-2146`, 2973-2985). The Internal Sale's picker says the day she was weighed
  (`ventures/internal-sale-sheet.tsx:40-53`); **the buy-back sheet does not** — `whatIsLeft` returns her kilos alone
  (`routers/ventures.ts:2837-2865`, `ventures/buy-what-is-left-sheet.tsx:35-55`).

| #   | Ticket                                               | Blocked by |
| --- | ---------------------------------------------------- | ---------- |
| 01  | The lorry weight against her first Weigh-in          | —          |
| 02  | Weighed short, by seller                             | 01         |
| 03  | A Sale floored on her last Weigh-in, and Shrink told | —          |
| 04  | No price on an old Weigh-in                          | —          |

**Nothing was asked of the Owner.**

**Settled in drafting** (the Owner may overrule; nothing here was asked):

- **The weight off the lorry is set against her first Weigh-in within her first thirty days** (the quarantine, as Early
  losses count it). The arrival weight is taken off a lorry and already shrunk; a fortnight on, a well bull weighs
  more, not less. Her first reading under it by more than a Farm Parameter, **`arrival_short_percent`, 5% by default,
  the Owner's alone** (the Manager buys), is told to the Owner in the evening's post, once per Intake. A convention,
  not a measured line. **Told, never refused, and never a Needs Review**: the reading is right; it is the purchase the
  Owner asks about. The implausible-jump check is left as it is — the Intake weight does not become a Weigh-in.
- **Weighed short is counted beside the seller and the haat** on the Early losses card, as a fourth figure; a seller
  with none lost and none weighed short is still not named.
- **A Sale's floor is worked on the heavier of** the weight typed on the day and her last unflagged Weigh-in within 21
  days (`SHRINK_STALE_DAYS`) less the farm's allowance for Shrink — **`shrink_tell_percent`, 8% by default, the Owner's
  alone** (the Manager sells). Older or flagged, the typed weight stands alone, as today. The notice says which weight it
  was worked on.
- **Shrink over that same allowance is told to the Owner** in the evening's post, once per Sale, fattening animals only
  (as Sold under cost is), and never on a last weighing older than 21 days. One parameter for both: what the farm
  allows a lorry to take off a bull is one figure.
- **An Internal Sale or the buy-back on a Weigh-in older than `price_weigh_in_days` — 14 by default, the fortnightly
  round; the Owner's alone — is refused**, naming the animal and how old her weighing is. Refused rather than asked
  again: the Owner can put her on the scale tomorrow, and the buy-back has no last day. The buy-back sheet says each
  animal's weighing day and names the stale ones before she commits, as it names the unweighed.
- **Left:** pricing past a flagged Weigh-in (an open implausible-weight Needs Review) at an Internal Sale — the
  Manager's review is the place; the bull bought dear told to the Owner (survey "smaller", a plan of its own).
