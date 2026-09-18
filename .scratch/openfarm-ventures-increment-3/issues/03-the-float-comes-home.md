# 03 — The Float comes home

**What to build:** A Float is reconciled when the Trip returns: what went out equals the animals it bought — each one's price and her Hasil — plus the Trip's own costs, plus whatever cash came back and was deposited, with the deposit slip's reference. Nothing goes missing between the haat and the shed, and the Owner can see at a glance which Trips are still open.

A reconciliation that does not add up is refused and says by how much, because a Float that nearly balances is a Float nobody has actually counted. One never reconciled stays open, and the Venture says so — settlement will later refuse to close over it.

**Blocked by:** 01 (an Intake names its Venture), 02 (a Float goes out)

**Status:** done

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 3, user stories 27, 28, 29; `CONTEXT.md` — **Buying Float**, **Buying Trip**, **Hasil**, **Venture Movement**.

- [x] The Owner reconciles a Float: the cash brought back, the day it was deposited and the slip's reference, and the Float closes
- [x] What went out has to equal the Animals bought on that Trip for that Venture, plus the Trip's own costs, plus the cash returned — and a reconciliation that does not is refused, saying by how much and which way
- [x] The cash returned is a Venture Movement of its own, so the Venture Account's balance comes back up by what was not spent
- [x] An open Float is visible on the Venture, and a Trip already reconciled may not be reconciled twice
- [x] Recording an Intake or a Trip cost after a Float has been reconciled is refused, because the sum it was reconciled against would no longer be true
- [x] Tests cover a Float that balances, one short and one over, a double reconciliation, and an Intake arriving late against a closed Float

**From increment 3 ticket 02:** a Venture Movement's effect on the figures is one record per kind — which line it lands on, which way it moves it, and whether it is drawn against the Cattle Budget. The cash that comes home is the same line and the same budget as the Float that took it, moving the other way; entered so, the unspent cattle money goes back to the Cattle Budget rather than leaking into the Running one. Note also that a Trip may be given a Float once, ever — stricter than "one open Float", and deliberate, because a trip funded twice is a trip nobody can reconcile.

## What was built

- The Float counted home: what went out equals the Animals that outing bought for its Venture, plus the
  outing's own costs, plus the cash brought back with its deposit slip. A count that does not balance is
  refused, saying by how much and which way.
- The homecoming is its own Venture Movement — written even when nothing came back, because the record
  that the Float was counted, and against what, is the point of counting it. The counted sum is kept on
  the Audit Event, not merely returned to the screen.
- Unspent cattle money goes back to the **Cattle Budget**, exactly as ticket 02's note required.
- A reconciled outing is closed: no Animal may be added to it or taken off it, and neither its costs nor
  an Animal's price or Hasil may be corrected afterwards.
- An open Float shows on the Venture, which is what a Settlement will later refuse to close over.
- The Owner sees the arithmetic as she picks the outing, so the refusal is something she can avoid rather
  than something she has to decode.

## What the reviews caught

- **A mixed lorry made a Float unbalanceable forever.** A Farm-owned animal bought on a funded outing was
  allowed, then excluded from the sum — while her price had left the Venture's Float. The Float could
  never balance, could never be reconciled, and would have blocked that Venture's Settlement permanently.
  Every Animal on a funded outing now belongs to the Venture that funded it.
- **A price or Hasil correction still slipped past** the closed outing, because the guard only fired when
  the correction moved her between outings.
- **The whole reconciliation ran outside its own transaction**: two counts could both pass, and an Intake
  landing mid-count would falsify the sum being signed.
- **The Audit Event was an empty diff** — the trail snapshot did not read the column the act changed.
- Taka were compared with a hand-rolled epsilon rather than the repo's own rounding, and the gap was
  printed as a raw float.
- The counting sheet listed every Venture's open Floats, so Venture A's card could count Venture B's
  money home.
