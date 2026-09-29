# 02 — The count every week, and a missed count

**What to build:** The count is raised by the clock, once for the whole farm, on the farm's day. Not done, the Manager
is told, then the Owner.

**Blocked by:** —

**Status:** done, 2026-09-29.

- [x] **Standard Playbook** `stockCount`: `schedule` Friday 09:00, `wholeFarm: true`, `checkerRole: "owner"` (decision
      3). The wrong comment ("a schedule raises work per Pen, and the store is one") is gone.
- [x] **Domain:** `"stock_count"` in `FARM_WORK_EFFECTS`; the effect reads only `instance.farmId`. Whole-farm
      scheduling already existed (the biosecurity check), so nothing else in the raising changed.
- [x] **A missed count** goes late by the existing `instance_overdue` (24 h grace) and `instance_escalated` to the Owner
      after the farm's escalation window — no new notice kind.
- [x] **Owner's home:** a "Store count" kind in Needs you when the store has not been counted for more than 8 days
      (`STORE_COUNT_LATE_DAYS`, `storeCountLate` in `stock-store.ts`), or never — only on a farm that keeps a Feed Item.
      Says when it was last counted and opens the feed page's Counts tab. Nothing while the counts are made.
- [x] **Catch-up:** `dueSlotsFor` raises only the farm's day containing now, so a farm adopting the new Version gets the
      next Friday's count, never the missed weeks.
- [x] **Seed:** the count is no longer raised by hand monthly; the shelves are weighed every Friday at 08:30 and the
      clock's 09:00 count is walked with the day's work, signed off by the Owner (`CREW.stockCount.checker`).
- [x] **Tests** (`routers/weekly-store-count.test.ts`, 6): not on a Thursday; once on a Friday for two full Pens, in no
      Pen, the Manager's with the Owner checking, still one when asked again; late to the Manager, escalated to the
      Owner; Owner's home never → nothing after a count → the last day nine days on; whole-farm work may count the
      store and still may not move an animal; nothing raised on a farm with no animals. **Proved by switching off**
      whole-farm raising (the once-a-Friday test goes red) and the effect allowance (the procedure cannot be created).
- [x] **Somebody opens it** (reseeded 2026-09-29): the seed's eleven Friday counts at 09:00, whole farm, signed off by
      the Owner (one left missed, as the seed leaves some work). With the last count aged a week in the seed's
      database, the Owner's Needs you leads with "গুদাম গণনা" / "Store count": "গুদাম গোনা হয়নি — শেষ গোনা হয়েছে ১৮
      সেপ্টেম্বর, ২০২৬" and in English; it opens the Counts tab. The count's page reads "Weekly stock count · The whole
      farm".

**Left alone:** raising the count by hand still asks for a Pen (`instances.raiseNow` takes one), so a surprise count is
raised in any Pen and counts the same store. Whole-farm work raised by hand would be its own small change.

**For the Owner:** a farm that adopted the count before this keeps its old Version (raised by hand, nobody checking)
until it publishes the new one from Templates. Production starts fresh, so it adopts this one.
