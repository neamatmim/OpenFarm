# 04 — A Buying Trip is paid for by the animals it brought home

**What to build:** Cattle are bought on an outing, not one at a time, and the outing costs money beyond the animals: a broker, the lorry home, the men's food and lodging. The Manager records the Buying Trip once with what it cost, each Intake from that outing names it, and the cost is split evenly across the animals that came home on it. Each animal's page shows her share, and it comes off her Margin.

**Blocked by:** 01

**Status:** done

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 1, user stories 28, 40; [What a project is charged for](../../openfarm-investor-projects/issues/05-what-a-project-is-charged-for.md); `CONTEXT.md` — **Buying Trip**.

- [x] A Buying Trip records the day, where it went, and its costs — broker, transport, the men's food and lodging — entered by the Owner or the Manager, audited, and correctable in the ordinary window
- [x] An Intake may name the Buying Trip it came home on; one that names none behaves exactly as today
- [x] The Trip's cost splits evenly across the Animals whose Intakes name it, and each share shows on her page and in the per-Side report
- [x] A Trip that brought nobody home — every Intake corrected away — is charged to nobody and is said out loud rather than spread elsewhere
- [x] The Trip's costs reach the Farm's money record once, as money out, and are never double-counted as both a Trip and a hand-entered expense
- [x] Tests cover a trip of three animals, a trip of one, an Intake with no trip, and a correction that moves an Intake off a trip

## What was built

**A Buying Trip** records where it went, when, and what the day cost beyond the beasts: the broker, the lorry home, and keeping the men who went. The Owner's or the Manager's, audited, and put right by a Correction like any other record — which re-charges every animal on it at once, because no share is stored.

**Its money books once**, under the Trip's own Category (হাটে যাওয়ার খরচ). Being a Category a record keeps, it cannot also be typed in by hand, so the same lorry can never be counted twice.

**An Intake names the outing she came home on**, and only one of this Farm's; a Correction moves her off it or on to another. An arrival that names none behaves exactly as before.

**The split** lives in the domain beside the feed's, because it is the same shape: evenly across the animals whose Intakes name the outing, charged at each animal's arrival on the Side she stood on then. A dead or sold animal keeps her share. An outing nobody came home on — none bought, or every arrival corrected off it — is charged to nobody and said on the money report.

**On the screens**: the outing is written up once on the intake page when its first animal is, and every arrival after picks it from the twenty most recent; her page names the outing that brought her.

**Caught in review, and fixed:** the Trip's id was not checked against the Farm, so an id from elsewhere would have attached silently and lost her share; a lorry could be dated tomorrow, which the Intake beside it already refuses; the Trip had no Correction at all, which the ticket asked for; and the new table was inserted between the Intake's doc comment and the Intake, orphaning it — the seventh time that has been caught in this repo.
