# 03 — The evening Head Count

**What to build:** Each Pen counted by number, blind. Compared with the animals the register puts in that Pen at that
moment; a difference sends the Manager to walk the Pen.

**Blocked by:** 01

**Status:** done, 2026-09-30.

- [x] **Glossary:** new **Head Count** (not a widening of Stock Count); **Missing** widened with the Manager's "Not
      found".
- [x] **Schema:** `head_count` (pen, instance, completion unique, counted, expected, expected_ids, counted_at/by).
      Migration `20260930095711_head_count`, applied to both dev databases.
- [x] **Effect `head_count`**: a number, once for the Pen (a Step rule; the editor sets it so). Expected = the animals
      whose latest Move by the moment counted took them into the Pen and who had not left by then (`inThePenAt`), so a
      count written late is set against the Pen as it was. The effect returns only whether it differs: blind.
- [x] **Notice** `head_count_differs`: immediate, **the Manager only**, about the Pen's evening work ("Open the work"),
      raised and pushed by the sweep (`tellAboutHeadCounts`) for counts of the last day, once each. A shortfall opens
      nothing: the Manager marks the animal with **`animals.notFound`** (Owner, Manager), a Missing with no Completion,
      told to both as the round's is.
- [x] **Standard Playbook:** "Evening head count" / "সন্ধ্যার মাথা গণনা", 19:00 per Pen, Barn Staff, no checker,
      grace 2 h.
- [x] **Corrections:** a recount rewrites the row and compares again. **Found on the way:** the work page kept a
      finished piece of work locked to whoever held it, so the Manager could not put any checkerless Step right — the
      Owner and the Manager may now open a finished Step to correct it; and a finished board no longer offers Finish
      (tapping it was refused).
- [x] **Tests:** `routers/head-count.test.ts` (6) — blind; one short (Manager told once, Owner not); one over; a Move
      before lock-up counted where she went; a recount; Not found by hand. **Proved by switching off** the Pen-at-the-
      moment, the differs filter and the recount — each red.
- [x] **Somebody opens it** (seed, 2026-09-30; published there by hand from Settings → Playbook, the seed's crew does not
      keep it): one count per Pen at 19:00; the board shows no number to find; ষাঁড় পেন খ counted 11 of 12; the
      Manager's list led with "সন্ধ্যার গণনায় ষাঁড় পেন খ-এ ১১টি পশু পাওয়া গেছে, খাতায় আছে ১২টি"; the Manager's
      recount of 12 (a blank box, blind again) set the row to 12 of 12; "পাওয়া যাচ্ছে না বলে জানান" in her menu.
      Also fixed there: the Playbook list said "গাভী বাচ্চা দিলে" five times for the after-calving check (React's
      duplicate-key warning) — said once now.

**Left alone:** the seed does not keep the head count (its history would shift); a reseed drops the one published by
hand.
