# 40 — The receipt and the transport card

**What to build:** Two pieces of paper the buyer leaves with. The receipt lists what they bought — every animal that went to them that day on one sheet, with weights, prices and the total. The transport card is what the lorry carries: farm of origin with its registration number, how many animals and which, where they are going, and who is driving (Meat Rules 2021 r.18). Both print on one page, in Bangla, from what the farm already knows.

**Blocked by:** 34, 39

**Status:** done

**Spec:** [Compliance reports and exports](../../openfarm-release-1/issues/19-compliance-reports-and-exports.md) — R9 and R10; [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 4, user story 64 ("produce the transport-card data and a receipt") and user story 65 (the combined receipt).

- [x] One receipt carries every Sale to one buyer on one day: animals with weights and prices, the buyer, the date, the farm, and the total
- [x] The transport card carries the farm of origin and its registration number, the animals by tag, the count, the destination, the date and the driver and vehicle where known
- [x] Both print on one page and read in Bangla, and neither asks anybody to type a figure the farm holds
- [x] Producing either is an Audit Event, and a farm with no registration number recorded is told what is missing rather than printing a card with a hole in it
- [x] Tests cover a receipt for two animals to one buyer, a transport card's contents, and a missing registration number

## What was built

`sale.receipt` and `sale.transportCard`, both built in the domain as one string — the same shape
as the DLS letter, and for the same reason: these are documents the farm may have to produce again
years later and they should read the same every time. Every figure comes from what the farm
already holds. A receipt somebody typed is a note, not a receipt.

**One receipt covers a whole morning.** Both papers are asked for by a Sale's id and gather every
Sale to that buyer on that farm-day: at Eid a man buys five beasts before breakfast, and handing
him five pieces of paper is how one of them gets lost. The same grouping is what tells the lorry's
card what is on the lorry.

`sale.day` lists what the farm sold on a day, and the sale screen offers both papers beside each
row. They print through the same one-page rules the DLS letter uses, now shared as a `Paper`
component rather than copied.

**A card without the farm's registration number is refused**, not printed with a gap. The domain
throws and the router refuses by name, so a Manager is told which fact is missing and where to
write it. A card that looks lawful and is not is worse than no card at all.

Producing either is an Audit Event of its own, keyed on the Sale and recording which paper, how
many animals and — for the receipt — the total.

## What the review changed

Both axes found the same defect, independently, and it is the one I had already been uneasy
enough about to ask them to check.

- **The transport card described a day, not a lorry.** It took the destination, the vehicle and
  the driver from the buyer's *first* sale of the day and then listed every animal he bought that
  morning beneath them. One buyer sending two lorries to two markets — which is an ordinary Eid —
  would have been handed a card asserting a load that was never on that vehicle. **That is exactly
  what r.18 exists to prevent.** A card now covers one **Load**: one destination, one vehicle, one
  driver, one day. The receipt still covers the whole morning, because that is a different
  question. There is a test with two lorries.
- **The Export did not stamp the Registration number**, though the spec and the glossary both say
  every Export carries it. It does now — and it records the *tags* the paper listed rather than a
  character count, which was a proxy for nothing: a count could never be checked against the paper
  a buyer is holding.
- **Neither paper said who made it or when.** The report set asks it of every paper the farm
  produces, and it is how two copies of one receipt can be told apart.
- **Every label was Bangla only.** The format rule is "Bangla by default with English field labels
  alongside", so a processor's clerk or an inspector from another district can read the form
  without it being explained. Both papers are bilingual now.
- **The receipt was pinned to Bangla numerals.** It is the farm's own paper and now reads in the
  language of whoever makes it. The transport card stays Bangla whoever prints it: r.18 is an
  authority's form, not the farm's.
- **A paper would have silently left animals off** past two hundred. It refuses instead — a
  receipt missing a beast is worse than no receipt.
- **`FarmOfOrigin` was a second name for `FarmIdentity`**, and the farm-of-origin heading was
  built twice — once here and once in the DLS letter. One `farmOfOriginLines`, used by all three
  papers.
- **I claimed the print rules were "now shared rather than copied" and they were not**: the SOP
  card and the work board still held their own copies. They use the shared `Paper` now, and its
  id is a closed list rather than a string written straight into a stylesheet.
- **A third key for "Print".** There were already two. One `common.print`.
- **Receipt, Transport Card and Load were new words with no glossary entries.** All three added,
  and Load says why a card is not a day.
- **The test read the whole farm's day list and took the first row**, which would have become
  another file's sale the moment two files sold on one morning; and it restored the farm's
  registration number outside a `finally`, so a failing assertion would have left every later
  file without one.

## Decisions and departures

- **Both papers are asked for, not printed automatically.** The receipt is written once the buyer
  has finished buying; producing one after every sale would hand him a fresh sheet each time and
  make the audit trail a list of drafts.
- **The count on the transport card is formatted like every other number on it.** The whole card
  is in Bangla, and a count in Arabic numerals in the middle of it is the one line an inspector's
  eye stops on. The domain takes it pre-formatted, as it takes the dates.
- **The receipt covers a day; the card covers a Load.** Two papers answering two questions, and
  the grouping is the difference between them.
- **The registration number is required for the card and merely printed-if-present on the
  receipt.** Meat Rules r.18 asks for it on what the lorry carries; a receipt is between the farm
  and its buyer.
- **Neither paper is a PDF.** The report set says "PDF (print)"; these print to A4 through the
  browser, which is what the farm has. Generating PDF files server-side is a change of machinery,
  not of content, and the content is what the Rules ask about.

## Not done, and why

- **A reprinted paper is re-derived, not replayed.** If a Sale is ever corrected — which is not
  built — the paper reprints differently from the one the buyer holds. The Audit Event records the
  tags and the total, so the difference is at least visible; storing the text itself would make it
  provable, and that is a decision about what the farm keeps rather than a bug.

- **Nothing signs them.** Both end with a signature line, as the paper versions do; a digital
  signature is not something Release 1 claims.
- **The receipt does not carry a number of its own.** A Sale's id identifies it, but there is no
  human-readable receipt number to quote back. Nobody has asked for one and inventing a numbering
  scheme is the kind of thing a farm has opinions about.
- **The movement log (R11) is not here.** It is a period report over Moves, intakes, sales and
  deaths, and belongs with the Inspector View rather than with the papers a buyer leaves with.

## Verification

`pnpm check-types` clean across the workspace; `pnpm test` 393 passing (364 api + 19 web + 10
i18n), up from 388 — a receipt carrying two animals to one buyer with a total nobody typed, a
transport card carrying the farm of origin and its registration in Bangla digits, **two lorries to
one buyer each getting their own card while one receipt covers both**, the refusal when no
registration is recorded, and an Audit Event recording what the paper said. `pnpm build` clean; `oxfmt`
and `oxlint` clean on every changed file.
