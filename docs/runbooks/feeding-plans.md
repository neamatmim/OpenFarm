# Following a fattening animal's feed plan

Open **Animals → animal → Feeding plan** as an owner or manager. Create a plan with the arrival weight and date, planned sale date, and target weight. The **Nine months from start** shortcut uses calendar months. Choose an arrival ration explicitly if adaptation is included, then select the weight-based growth rations. Selected stages must cover the projected growth without gaps or overlaps and have feed quantities and expected gain recorded.

Set the adaptation period, transition period, weighing interval, and purchasing reserve to the farm's approved practice. The defaults are editable planning assumptions. Feed quantities retain the ration's existing units: quantities per animal stay fixed; quantities per 100 kg increase with projected weight. During adaptation the forecast assumes zero growth. At a stage change it gradually blends the old and new recipes over the chosen transition days. The sale day is excluded from feed demand.

Compare slower, expected, and faster growth. Their daily gains come from the saved ration's range, adjusted using the animal's recorded breed and sex and the farm's gain settings. The expected scenario uses the midpoint. These are scenarios, not guaranteed gains or a nutrition prescription. Review dates suggest when to assess the next ration; they do not change the pen's assigned ration or record feed consumption.

Record reliable weigh-ins in the animal's weight tab. Remaining feed and sale weight are recalculated from the latest reliable, non-future reading within the plan. The original approved forecast remains visible for comparison. Overdue weigh-ins, ration mismatches, low measured gain, and a target missed by any scenario are surfaced for review. Check health, intake, and leftovers before changing concentrate. Approve any actual ration changes through the existing pen-ration workflow.

Saving a revision keeps every prior plan and its approved ration contents. If recipes, bands, or gain settings change, the existing plan shows a review notice and retains its snapshot until a revision is saved. Saving also checks for another editor's intervening revision.

Open **Feed → Feeding plans** for monthly item demand across all live animals with plans. Animals without plans are counted separately and do not contribute to demand. Today's unexpired stock is shared once across planned animals; earlier months' remaining planned use is deducted before calculating the selected month's purchase allowance. Future expiry, dairy or unplanned animal use, future receipts, and spoilage are excluded. Check lot dates and the rest of the herd before ordering. Missing prices stay marked as unpriced; known cost is a partial total when any item is unpriced.

The schema migration adds immutable `animal_feed_plan` revisions and their audit trail. Apply migrations before serving the new routes. Database backups include the table and count it in backup verification.
