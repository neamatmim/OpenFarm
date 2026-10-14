# Feed made on the farm is a transfer inside the store

Date: 2026-10-14

A dairy and fattening farm in Bangladesh makes some of its own feed. The Manager mixes a concentrate (দানাদার মিশ্রণ)
from wheat bran, broken maize, oil cake, salt and a mineral premix, made the same day; and the farm packs silage — chopped
maize or napier with molasses — into a pit or bags, opened thirty to forty-five days on, with less coming out than went
in. Until now nothing turned one Feed Item into another (`domain/standard.ts` lists «ভুট্টার সাইলেজ» as a feed the farm
only harvests), so a home mix was entered as a Purchase at a price somebody worked out by hand, and its bran stayed in
the store as if nobody had used it. The flow survey of 2026-10-13 (G5) asked for "feed made on the farm". The Owner
delegated the open choices; each is decided below on the recommendation, and why.

## Decision

- **A Feed Making** (CONTEXT.md): one record that takes stated amounts of input Feed Items out of the store and brings
  an amount of one output Feed Item in. Each input in its own unit — kilos of bran, liters of molasses, bundles of
  napier — never added up across units. Its made feed comes in as a **Feed In** of a third kind, `made`, linked to the
  Making (`feed_in.feed_making_id`, set exactly for that kind, once). So it is listed under «Came in» with what went into
  it, has a Lot whose «left» is read like any delivery's, and is counted by the Stock Count like any feed. Only the
  Making writes one: `stock.receive` takes `purchase` or `harvest`, never `made`, and a made Feed In is never put right
  as a Feed In (`made_feed_is_its_making`) — only through its Making.
- **Priced from what went in, worked out, never kept.** The made feed's worth is each input at the store's moving
  average price the moment it was taken out, added up; its price a unit is that worth over what came out. It is worked
  out every time the store is read (`bringMakingsIn`, in the same replay the costs, the store's value and Stock on Hand
  read), not stored on the row. A Purchase put right, or a Fodder Price set at last on a cut that went into the pit,
  re-prices what was made from it and every Feeding of it since, without anybody remembering to. Makings are read in
  the order they were made, so a feed made from a made feed reads that feed at its own made price. Each Feed Item's
  store is read forward once per reading however many Makings take from it: a daily five-input mix over three years
  (133,000 movements, 1,095 Makings) is brought in in about 25 ms, where reading each input's whole history again for
  each Making took 2.4 s on every read of the store.
- **Silage enters the store when the pit is opened, at what came out.** Its inputs leave the store the day it is packed;
  the made feed comes in on the day it is opened, by the amount that came out, typed then (`feedMaking.cameOut`). A mix
  is the same record with both on the same day. Chosen over bringing it in at packing with an expected amount, put right
  on opening, because:
  - **Stock on Hand stays honest.** The store says what can be fed today. Sealed silage cannot be; at packing it would
    show ten tonnes the feeders cannot touch, Running Low would read a month of feed that is not there, and the weekly
    blind Stock Count would have to count a sealed pit — or find it "short" and book a loss that is only fermentation.
  - **The feed cost is right without a correction.** What the pit lost is paid for by what came out: ten tonnes of maize
    at ৳3 and molasses at ৳50 a liter packed for ৳35,000, 8.5 tonnes out, is ৳4.12 a kilo. Brought in at an expected
    amount, every Feeding before the opening's correction would be charged a price the pit did not keep — and the
    correction would then reach back into Ventures' months.
  - **Nothing is lost from the books meanwhile.** While it is in the pit its worth is still the farm's: the month's
    store value (and so Capital Employed, ADR 0023) counts a pit packed by then and not yet opened at what went into it
    (`inThePitAt`). Only Stock on Hand leaves it out.
  - The person packing may say when it should be ready («আনুমানিক খোলার দিন»), shown beside it on «Made on the farm»;
    nobody is told by Notice. A mix has no ready day (`ready_day_is_for_a_pit`).
  - A pit opened and written up on a later day is dated by its day's start, which can fall before the moment it was
    packed that same day; its made feed then comes in at the packing, never before it (`bringMakingsIn`).
- **The store must have held it, then and since.** A Making takes no more of any input than the store could spare from
  the moment it was made on: the least it held at that moment or after any movement since — so a Making dated back
  past the week's Feedings, which the store held that morning but fed out by Friday, is refused
  (`not_enough_in_the_store`, naming each feed short and the most that could have been spared of it, which the screens
  say by name). The same rule judges every Correction, the store read before and after it: inputs put right upwards,
  the day moved back, less made than a later Making or Feeding drew on. It refuses only where the write takes the
  store below nothing where it was not already that low. A Feeding may take the store below nothing — a lorry nobody
  wrote down — but a Making is the Manager's own act at the store, and a mix made from bran the books never had would
  carry no price for it. A Making is never made from the feed it makes, nor takes one feed twice, nor a retired feed.
- **Fodder with no price leaves the made feed unpriced**, never priced on what had one, and never refused. That is how
  a Harvest with no Fodder Price behaves: the store holds it, a Pen fed from it is "unpriced", a Venture month waits on
  it (`a_price_is_missing`). When the Owner sets the first Fodder Price the cut takes it (2026-10-06), and the made feed
  — worked out, not kept — is priced with it. Refusing would only push the farm to type a price it does not have.
- **Not a purchase, not a Feeding.** A Making books no Money Event, so the money book, the monthly cash and the Closed
  Month never see it; no Feed Purchase price-jump notice compares a made feed's price, and no purchase is compared
  against one (made feed has no price per unit as a purchase, `unitPriceOf`). Its inputs going out are no Feeding: no
  Animal is charged for them; the Animals that eat the made feed are, at its made price — a Venture's bull included, so
  the Farm is reimbursed for the bran at what it cost, once. Costs by Side, the monthly report and a Venture's monthly
  feed all read the same Feedings, so nothing is counted twice. Nor is it how fast a feed is fed: ten tonnes of chopped
  maize packed in one day does not make the maize Running Low by its days (`StockMovement.into`).
- **Who.** The Owner and the Manager, as the store is theirs (roles matrix: Feed stock). Barn Staff and the Vet never:
  it carries prices. Online only, as a delivery is; the screen's own id makes a second tap the same Making.
- **Put right or voided** like a Feed In: a Correction with a reason, the Manager in his Correction Window and the Owner
  at any time, on the trail (`feed_making`). What went in — a feed added or taken away — the day it was made, how much
  came out and the day: each may be put right, judged again against the store as above; moving a mix's day moves the
  day it came out with it. What came out and the day are put right in the window of the opening that wrote them, not
  the packing a month before; what went in keeps the packing's (`CorrectionKind.entryFor`).
- **Used is any use of the made feed.** Once anything was taken from the made feed's Feed Item — fed, or made into
  another feed — at or after the moment the made feed came in, the Making is never voided, and its made feed never
  moved to come in after that use (`making_output_used`): those Feedings happened and were charged at its price. Read
  off the store, not the made Lot's «left»: a Lot with no expiry is drawn last, so a mix fed out the day it was made
  could read as untouched. The amount can still be put right, which re-prices them, as long as the store does not go
  below nothing for it; or a Stock Count says what is really there. A Feeding a Shed Phone held offline and sent after
  its Making was voided is not refused (barn work never is, ADR 0002): it shows as the store running short, like any
  feeding past what was written down coming in.
- **A settled Venture is never re-priced through made feed.** Its Animals' feed was priced through every Making down
  the chain — bran into a mix, the mix into pellets. A Feed In put right refuses where it moves the price of any feed
  made from it since, not only its own Feed Item; a Making put right refuses for its output, its inputs and everything
  made from them since; and a Making made, or a pit opened, whose made feed would move the price of Feedings a settled
  Venture was charged — dated back before them — is refused too (`venture_is_settled`). Asked only where a settled
  Venture exists and the feed was fed from that moment, so a day's mix never loads the costing.
- **Days are farm days.** `feed_making.made_on` and `ready_on` are kept as the farm's day, `YYYY-MM-DD`, as most days
  in the schema are; the made feed's day is its Feed In's `received_on`, as every Feed In's is.
- **A Closed Month** (ADR 0028) does not refuse it, as it does not refuse a Harvest or a Feeding: no money moves. A
  Making written late into a closed month can move that month's feed charges and store value — the known limit that
  ADR names for barn records and the Owner's prices.

## Considered

- **Price kept on the made Feed In at the moment it was made**, as a Harvest keeps its Fodder Price's worth. Simpler to
  read, but a corrected Purchase of bran or a first Fodder Price would leave the mix at the old figure for ever, and an
  unpriced pit would never price itself — the very trap the Owner closed for Harvests on 2026-10-06.
- **Silage in the store at packing, at an expected amount.** Rejected above: it makes Stock on Hand, Running Low and the
  blind count say what cannot be fed, and charges Feedings a price the pit did not keep.
- **A recipe** (a named mix whose lines the Making copies). Not built: a farm mixes a few ways, and the sheet fills a new
  Making's inputs as the last Making of the same feed had them, which is the recipe in practice without one more thing
  to keep. Can be added if the farm keeps several mixes of one feed.
- **Opening a pit in parts** (bag by bag). Not built: a Making's made feed comes in once. Bags packed on different days
  are different Makings; a pit opened and fed over weeks is in the store from its opening, and a weekly count catches
  what spoils after.

## Consequences

- The Feed page has a tab «Made on the farm» / «খামারে বানানো»: each Making with what went in, what came out, what is
  left, what it was worth and its price a unit, what was lost where every input is in the made feed's unit, «In the pit»
  with its ready day, the act to open a pit, and the Correction. «Came in» lists made feed as «খামারে বানানো» with
  "Made from …" beneath, and filters by it.
- A feed used only in mixing (bran) is no longer read as fed, so it is watched by the Manager's level, not by its days of
  feed. Carrying the made feed's rate of feeding back to what it is made from is left for when a month of real use says
  it is wanted.
- Every reader of the store — Stock on Hand, its Lots, costs, the leftover's price, the month's store value — reads
  Makings through `feedStoreOf`; a new reader that queried `feed_in` prices directly would see made feed with none.
