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

## Decisions and departures

- **Both papers are asked for, not printed automatically.** The receipt is written once the buyer
  has finished buying; producing one after every sale would hand him a fresh sheet each time and
  make the audit trail a list of drafts.
- **The count on the transport card is formatted like every other number on it.** The whole card
  is in Bangla, and a count in Arabic numerals in the middle of it is the one line an inspector's
  eye stops on. The domain takes it pre-formatted, as it takes the dates.
- **The registration number is required for the card and merely printed-if-present on the
  receipt.** Meat Rules r.18 asks for it on what the lorry carries; a receipt is between the farm
  and its buyer.
- **Neither paper is a PDF.** The report set says "PDF (print)"; these print to A4 through the
  browser, which is what the farm has. Generating PDF files server-side is a change of machinery,
  not of content, and the content is what the Rules ask about.

## Not done, and why

- **Nothing signs them.** Both end with a signature line, as the paper versions do; a digital
  signature is not something Release 1 claims.
- **The receipt does not carry a number of its own.** A Sale's id identifies it, but there is no
  human-readable receipt number to quote back. Nobody has asked for one and inventing a numbering
  scheme is the kind of thing a farm has opinions about.
- **The movement log (R11) is not here.** It is a period report over Moves, intakes, sales and
  deaths, and belongs with the Inspector View rather than with the papers a buyer leaves with.

## Verification

`pnpm check-types` clean across the workspace; `pnpm test` 392 passing (363 api + 19 web + 10
i18n), up from 388 — a receipt carrying two animals to one buyer with a total nobody typed, a
transport card carrying the farm of origin and its registration in Bangla digits, the refusal when
no registration is recorded, and the Audit Event for a paper that went. `pnpm build` clean; `oxfmt`
and `oxlint` clean on every changed file.
