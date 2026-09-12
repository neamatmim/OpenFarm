# 37 — Gain, days on feed, and two projections to Eid

**What to build:** What the scale means, never typed: how much she gains a day, how long she has been on feed, and what she will weigh at her Target Window. The projection is shown two ways side by side — on her gain since intake, and on her gain between the last two weigh-ins — because the gap between them is the farm's signal that a ration has stopped working. Confirmed with the Owner 2026-09-12.

**Blocked by:** 36

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 4, user story 62; [Fattening, weights and sale](../../openfarm-release-1/issues/10-fattening-weights-and-sale.md) ("Derived, never typed").

- [x] Average daily gain since intake and over the last period, days on feed, and both projections to the Target Window, all derived and none of them stored as typed figures
- [x] Her page shows the two projections side by side against her target weight
- [x] The Owner sees the fattening side at a glance: who is on track for the window and who is not
- [x] An animal with one weight only says so rather than projecting from nothing
- [x] Tests cover the arithmetic on a worked example, one weight only, and a pen where recent gain and lifetime gain disagree

## What was built

`fatteningView` in the domain: days on feed, what she weighs now, and **two** rates of gain —
over her whole stay and between her last two weigh-ins — each carrying the span it was measured
over and what it projects her to at the Target Window. Derived on every read, never stored,
because every one of these answers changes when the next reading arrives and a farm holding a
projection from March would be reading a number that stopped being true in April.

`fattening.board` gives the Owner and the Manager the side at a glance, those falling short
first. Her own page carries the same two columns side by side against her target weight, and the
board says out loud when the recent rate is below the lifetime one — which is the gap the Owner
asked to be able to see.

## Decisions and departures

- **On track is judged on the recent rate, not the average.** A bull who gained well all winter
  and nothing this fortnight has stopped, and a lifetime average would hide it. Where there is no
  recent rate the since-intake one stands in; where there is neither, the farm says it does not
  know rather than guessing.
- **A projection is made from the unrounded rate and rounded once at the end.** Rounding the rate
  first and multiplying it by ninety days turns a hundredth of a kilo into most of a kilo.
- **One reading is not a trend.** `recent` is null until there are two, and the screen says so
  rather than drawing a line through a single point.
- **An animal moved across from the dairy has no Intake**, so it is not on the board: there is no
  arrival weight to measure gain from. It is still on the Fattening side and still weighable.

## What was fixed on the way

- **Ticket 35 leaked the purchase price to Barn Staff.** I had put the Intake on `animals.byTag`,
  which every Role may read, but the roles matrix gives Intake to the Manager and the Owner and
  gives Barn Staff no row at all. A milker could see what the farm paid for a bull. Staff now see
  her weights and what she is being fed towards; not what she cost. There is a test for it.
- **Every ticket in this increment cited the wrong user stories.** The spec's Fattening block is
  stories 60–65 and 66 onward is Breeding, but the tickets pointed at 63–74 — ticket 36 was citing
  the Ready-for-Sale story and this one was citing the Sale. All seven files corrected.

## A correction to my own arithmetic

The first version of this test asserted 288.7 kg and 319.0 kg, worked by hand from the calendar.
The code said 288.3 and 318.4, and **the code was right**: a Target Window's first day begins at
midnight in Dhaka, which is 18:00 the day before in UTC, so the span from a weighing at 07:30 to
the window opening is 90.4375 days and not 91. The test now shows that working, and the intake
clock was moved to the same time of day the rounds are walked at so the gain spans are whole days
and the arithmetic can be read.

## Not done, and why

- **No cost of gain.** The Owner's home is specified as carrying "ADG and cost of gain"; the
  second needs feed cost per animal, which is increment 6's. What is here is the gain.
- **The board is its own screen, not a tile on the Owner's home.** The spec puts a Ready-for-Sale
  tile with an Eid projection on that home; Ready for Sale is ticket 38, and the tile belongs with
  it rather than half-built here.
- **The fortnight is still not in the Playbook.** Carried over from ticket 36: a `schedule` trigger
  is `{ times }` and raises work daily, so these rates are measured between whatever readings
  exist rather than between fortnightly ones. The arithmetic does not care — it divides by the
  real span — but "the last two weigh-ins" means less on a farm weighing irregularly.

## Verification

`pnpm check-types` clean across the workspace; `pnpm test` 376 passing (347 api + 19 web + 10
i18n), up from 372 — the worked example, one weight only, the Owner's board with a bull who has
stopped gaining, and the milker who may not see the price. `pnpm build` clean; `oxfmt` and
`oxlint` clean on every changed file.
