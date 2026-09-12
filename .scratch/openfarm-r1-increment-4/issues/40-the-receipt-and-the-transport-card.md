# 40 — The receipt and the transport card

**What to build:** Two pieces of paper the buyer leaves with. The receipt lists what they bought — every animal that went to them that day on one sheet, with weights, prices and the total. The transport card is what the lorry carries: farm of origin with its registration number, how many animals and which, where they are going, and who is driving (Meat Rules 2021 r.18). Both print on one page, in Bangla, from what the farm already knows.

**Blocked by:** 34, 39

**Status:** ready-for-agent

**Spec:** [Compliance reports and exports](../../openfarm-release-1/issues/19-compliance-reports-and-exports.md) — R9 and R10; [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 4, user story 64 ("produce the transport-card data and a receipt") and user story 65 (the combined receipt).

- [ ] One receipt carries every Sale to one buyer on one day: animals with weights and prices, the buyer, the date, the farm, and the total
- [ ] The transport card carries the farm of origin and its registration number, the animals by tag, the count, the destination, the date and the driver and vehicle where known
- [ ] Both print on one page and read in Bangla, and neither asks anybody to type a figure the farm holds
- [ ] Producing either is an Audit Event, and a farm with no registration number recorded is told what is missing rather than printing a card with a hole in it
- [ ] Tests cover a receipt for two animals to one buyer, a transport card's contents, and a missing registration number
