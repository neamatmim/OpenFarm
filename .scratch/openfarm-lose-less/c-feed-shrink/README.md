# C — Feed shrink in taka: the store count, the scale, and the price

On 2026-09-29 the Owner chose this gap from the second "lose less" survey (`../survey.md`). Feed is most of what the
farm spends. When the store holds less than the book says, the farm has lost money, and nobody is told how much.

**What the app already does** (read from the code, 2026-09-29):

- The **Stock Count** Step (`stock_count` effect) is blind: it refuses a count that leaves out a Feed Item, and a
  difference with no reason (`api/src/stock-store.ts:386-455`). Read later, it is worked out again so a late entry does
  not show as a loss (`stock-store.ts:501-560`). The feed page lists each difference in kg only
  (`web/src/components/feed/feed-history.tsx:387-400`).
- The weekly count has **no trigger** and **no checker** (`domain/src/standard-playbook.ts:543-545`). The comment at
  `:541` ("a schedule raises work per Pen, and the store is one") is **wrong** (checked): a schedule raises work only for
  a Pen holding a matching animal (`domain/src/sop.ts:207-212`), and a Pen has no store kind. Today the count is raised
  by hand (`api/src/routers/instances.ts:129`).
- Whole-farm work can be raised by the clock on chosen weekdays (`sop.ts:175-183`, `instances-store.ts:188-210`); the
  only effect it may carry is `registration_renewal` (`FARM_WORK_EFFECTS`, `sop.ts:804`).
- Late work tells the Manager, then the Owner after the escalation window (`api/src/notice.ts:69-74`).
- The store price is a moving weighted average (`domain/src/feed.ts:435-445`), shown on the feed page, never compared
  with the last purchase.
- A **Feed Purchase** is recorded as typed, bags × the feed's fixed bag weight, or maunds (`routers/stock.ts:40-66`).
  Nowhere does it hold what the scale said.
- **Running Low** is a fixed level per item (`domain/src/lots.ts:131`); only the Manager is told (`notice.ts:100`).
- A Feeding's "given" box starts filled with the target (`web/src/routes/_auth/work/$instanceId.tsx:1583-1595`).

| #   | Ticket                                   | Blocked by |
| --- | ---------------------------------------- | ---------- |
| 01  | The shortfall in taka, told to the Owner | —          |
| 02  | The count every week, and a missed count | —          |
| 03  | ৳ per kg on each Feed Purchase           | —          |
| 04  | Weighed on arrival, against the slip     | 03         |
| 05  | Days of feed left                        | —          |

**Settled with the Owner, 2026-09-29, and not to be re-asked:**

- **The Owner is told when a count is short by more than ৳2,000**, priced at the store's average price at the count; the
  month's total beside Overheads (decisions 1–2).
- **The Owner signs each count off** (`checkerRole: owner`) (decision 3).
- Decisions 4–8 stand as recommended (Friday morning; +10% on the last purchase; weighing optional; Manager told under
  7 days of feed; "given" stays filled) until the Owner says otherwise.

**Settled in drafting:**

- **The shortfall is shown beside Overheads, not inside them.** An Overhead is a hand-entered Money Event
  (CONTEXT.md:368); the feed was already paid through its Feed Purchase's Money Event, so adding it would count twice.
- **No "Delivery" or "Supplier".** CONTEXT.md:223 avoids both; widen **Feed Purchase**, **Stock Count**, **Running Low**.
- **A missed count uses the existing late-work notices**, no new kind.

## Decisions for the Owner

1. **How a shortfall is priced** — **the store's average price at the count (recommended: the price the animals are
   charged at)** / the last purchase's price / the higher.
2. **When the Owner is told** — **over a fixed ৳ per count, ৳2,000 (recommended)** / over a % of the item's week of use /
   every shortfall.
3. **Who checks the count** — nobody, as today / **the Owner signs it off (recommended: the Manager both receives and
   counts)** / a second person counts too.
4. **The count's day** — **Friday morning, changeable (recommended)** / the day before the usual purchase / Owner picks.
5. **A price jump** — **against the last purchase of that feed, at 10% (recommended)** / against the average of the
   last 3; 5 / 10 / 15%.
6. **Weighing on arrival** — **optional for now (recommended)** / required for bagged feed / required for all.
7. **Days of feed left** — show only / **also tell the Manager under 7 days (recommended)** / replace the kg level.
8. **The Feeding's "given" box** — **keep it filled with the target for now (recommended)** / leave it empty / filled but
   marked untouched.
