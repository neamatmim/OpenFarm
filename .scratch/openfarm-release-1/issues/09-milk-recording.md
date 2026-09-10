# Milk recording

Status: resolved

Type: grilling

Blocked by: 04

Map: [OpenFarm Release 1](../map.md)

## Question

**Grilling.** Decide what a milk record is:

- Granularity: per cow per milking session, per cow per day, or bulk per session only? (Manual entry in R1 — what can Barn Staff realistically enter at the parlour?)
- Sessions per day and their names.
- Quality fields (fat, SNF, somatic cell) — recorded in R1 or not?
- Lactation: how is a lactation started (calving) and ended (dry-off)? Days-in-milk, lactation number.
- Where does the milk go — bulk tank, calves, discarded (withdrawal)? Is that split recorded?
- Which SOPs does milking recording belong to (is "record yield" a step of the milking SOP)?

Resolved when the milk record shape and its relationship to lactation and SOPs are written down.

## Answer

Decided with the Owner on 2026-09-10.

- **Milk Record** = litres for **one cow, one Milking Session** (twice daily), captured by the "record litres" per-animal step of the milking SOP. Every cow in `Milking` state in the pen gets a step; a cow not milked is _skipped with a reason_ (per the SOP model) rather than left blank.
- **Destination** on every Milk Record: **Bulk** (default) | **Calves** | **Discard**. Under milk withdrawal the step is **hard-blocked to Discard**. Discard totals make the cost of treatments visible; Calves totals feed calf care.
- **Session reconciliation**: the milking SOP's last step records the **bulk total** for the session; the system shows the difference against the sum of per-cow _Bulk_ entries and **flags it beyond a tolerance** (farm parameter, default 5%).
- **Quality**: bulk-level only, optional — **fat %, SNF %, note** — recorded on the **Dispatch** (SOP 24: litres sent, buyer, challan/receipt). No per-cow quality in Release 1.
- **Lactation** (from the lifecycle, restated here): starts at calving, ends at dry-off; **lactation number** increments per calving; days-in-milk and per-lactation totals are derived, never entered.

### Assumed — correct me if wrong

- Reconciliation tolerance default 5%; the Manager can change it.
- A cow in `Milking` state that has no entry for a session (instance closed as missed) shows as a gap on her lactation curve, not as zero.

### Consequences

- Fattening/Finance: milk sold = Dispatch litres × buyer price; Discard litres are a treatment cost signal.
- Compliance: Dispatch carries buyer name/address + challan — the Safe Food Act s.38 record.
- Offline: per-cow entries are the highest-volume offline writes (2 × ~200 cows/day).

Partially unblocks → [Finance in Release 1](./13-finance-in-release-1.md) (still waits on fattening and feed).
