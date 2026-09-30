# I — Selling well

Survey "smaller or waiting" items (`../survey.md`), chosen by the Owner 2026-09-30.

**What the app already does** (read from the code, 2026-09-30):

- A Sale keeps the weight the price was struck on (`schema/fattening.ts:256-258`); the sale sheet shows "last weighed"
  only for animals picked from the Ready list (`sale-sheet.tsx:317-325`). **No shrink (farm weight → sale weight) is
  worked out anywhere**, and a Sale's weight cannot be corrected (`corrections/sale.ts:41-48`).
- **The Eid countdown exists** (`fattening/next-eid.tsx`), on the Fattening page and the Eid list only. A past Target
  Window is badged for animals still in `fattening` (`ready.ts:91`); animals already `ready_for_sale` and unsold are
  never flagged, a set-aside silences it for good, and **no notice** says animals are still here after Qurbani.
- Her cost, break-even and margin are worked out (`animal-price.ts`, `animal-price-store.ts`) and shown to the Owner
  only; `sale.record` **never compares the price with her cost or the market low** (`routers/sale.ts:90-240`).

| #   | Ticket                     | Blocked by |
| --- | -------------------------- | ---------- |
| 01  | Sold under cost, told      | —          |
| 02  | Shrink at sale             | —          |
| 03  | Still here after Eid       | —          |

**Settled in drafting** (the Owner may overrule; nothing here was asked):

- Under cost is **told, never refused**, to the Owner only (her cost is the Owner's); a cull to a butcher is told too,
  said as a cull. No market price set → compared with her cost alone. A Venture animal is compared with its Venture's
  prices; Investors are not told.
- Shrink is shown, never refused: under the weight box, on today's sales and per Selling Trip; a last weighing over 21
  days old says how old. A Sale's weight becomes correctable.
- After Eid: the day after Qurbani, a digest notice to the Owner and the Manager counting the animals aimed at that Eid
  still on the farm (both states, Venture animals too); the countdown also on the Sale and Ready pages; an unsold
  ready-for-sale animal past its window is badged.
