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
- **The store must have held it, then and since — moment by moment.** A write involving a Making is judged by the
  store before and after it, compared at every moment from the earliest moment it touches on (`wentShortFrom`): it is
  refused where the store would hold less than nothing at some moment where it did not, or less than it already did
  where the book was already short. Comparing only the lowest points let a shortfall later in the week excuse a new
  one days before it — 30 kg of corn on the 5th, taken on the 8th, 40 more fed on the 10th that nobody wrote coming
  in: the Making moved back to the 2nd now holds 30 short from the 2nd, and is refused. The same rule judges a new
  Making (a Making dated back past the week's Feedings), inputs put right upwards, a moment moved, less made, and a
  void. Refused with `not_enough_in_the_store`, naming each feed short and the most that could have been spared of
  it, which the screens say by name. A Feeding may take the store below nothing — a lorry nobody wrote down — but a
  Making is the Manager's own act at the store, and a mix made from bran the books never had would carry no price for
  it. A Making is never made from the feed it makes, nor takes one feed twice, nor a retired feed.
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
- **A void, or less made, is judged by the store.** Voided — written twice, or never made — the Making is taken off
  with its made feed and its inputs go back; refused (`making_output_used`) only where the store of the made feed
  would then go short at some moment from the Making on, because what it made was fed or made into other feed and
  nothing else on the shelf covered it. A daily mix entered twice is voided though the same feed was fed since: the
  other batch gave it. Feedings since re-price, as they do for a Purchase put right; a settled Venture's refuse it
  (below). The made Lot's «left» is never read for this: a Lot with no expiry is drawn last. A Feeding a Shed Phone
  held offline and sent after its Making was voided is not refused (barn work never is, ADR 0002): it shows as the
  store running short, like any feeding past what was written down coming in.
- **A settled Venture is never re-priced through made feed.** Its Animals' feed was priced through every Making down
  the chain — bran into a mix, the mix into pellets. A Feed In put right refuses where it moves the price of any feed
  made from it since, not only its own Feed Item; a Making put right refuses for its output, its inputs and everything
  made from them since; and a Making made — whose inputs taken out leave less for a later lorry to be averaged with,
  and whose made feed comes in — or a pit opened, dated back before Feedings a settled Venture was charged for any of
  them, is refused too (`venture_is_settled`). Back-dated Feed Purchases keep the policy they had. Asked only where a settled
  Venture exists and the feed was fed from that moment, so a day's mix never loads the costing.
- **A Making is a moment, not a day.** `feed_making.made_at` is when it was mixed or packed, and its made feed's
  Feed In carries the moment it came out — read as they are, never moved to the moment they were written down: a mix
  made at six and fed at seven, written up at eleven, was made before it was fed, so that Feeding is charged its made
  price and counts as using it; written up the next day, it is still after the ten o'clock lorry it took from. The
  form asks the time: now, for today, and a time to pick for an earlier day. `ready_on` stays a farm day.
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

## Addendum, 2026-10-14: the store's worth is the store's own figure

On the seed farm, 80 kg of concentrate mixed from 50 kg of bran and 30 of maize moved the Feed page's store value by
৳39. The Making was right; the figure was not. Each feed was valued at what is on hand times its average price after
that price was rounded to the paisa, and six tonnes of concentrate at a price half a paisa off is ৳30: the mix
re-blended the concentrate's average, and the rounding moved. A feed's worth is now the replay's own value, rounded
once (`stockLedger`'s `valueMoney`), on the Feed page, its Stock lines and the monthly report's store value — and so
Capital Employed. A Making leaves it where it was, to the paisa. The average price shown per unit is still rounded,
as a price is.
