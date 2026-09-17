# 05 — A Selling Trip is paid for by the animals taken

**What to build:** At Eid the Farm takes a lorry-load to the haat and brings some home again. The Manager records the Selling Trip with the animals taken and what the outing cost — lorry both ways, the stall or space, the men's food and lodging — and the cost splits evenly across every animal taken, sold or not, because a bull that came back still stood on the lorry. A broker's fee for one sale is recorded on that Sale instead.

**Blocked by:** 04

**Status:** done

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) — increment 1, user story 41; [What a project is charged for](../../openfarm-investor-projects/issues/05-what-a-project-is-charged-for.md); `CONTEXT.md` — **Selling Trip**, **Load**.

- [x] A Selling Trip records the day, the haat, its costs and the Animals taken on it; taking an Animal is a recorded fact, not derived from who sold
- [x] Its cost splits evenly across every Animal taken, whether she sold or came home
- [x] An Animal taken on two trips before she sold carries a share of both
- [x] Each share shows on her page and in the per-Side report, and comes off her Margin
- [x] A Selling Trip is not a **Load**: the Transport Card still describes one vehicle to one destination and is unchanged
- [x] Tests cover twenty taken and fifteen sold, an animal taken twice, and a trip where nothing sold

## What was built

**A Selling Trip** records where the lorry went, the day, and what the day cost: the lorry both ways, and the stall, food and lodging. **Who was taken is written down**, never read back from who sold — that list is the whole point, because the beast that came home again took a place on the lorry too. Put right by a Correction like any other record, which re-charges everyone taken at once.

**Its money books once** under its own Category (হাটে বিক্রির খরচ), which a record keeps, so the same lorry cannot be typed in again by hand.

**The split is the same one the Buying Trip uses** — one function in the domain, fed both kinds of outing: evenly across everyone carried, at the outing's own date, on the Side she stood on then. A beast sold that day keeps her share afterwards.

**On the screens**: a third tab on the sale page — write the day up, tick who went from the whole Fattening board, and read back the outings lately with what each cost.

**A Selling Trip is not a Load.** Nothing about the Transport Card, the Receipt or the Sale changed.

**Not the same record as the Buying Trip, deliberately.** The ticket said it would be. Renaming the just-shipped `buying_trip` into a shared table with a kind column would have been a wide refactor across eighteen files of code merged the same day, on a farm that may already hold rows; the two also differ in how their animals attach — one through the Intake, one through a list of who was taken. They share what carries the meaning: one split in the domain, one cost helper, one money-booking body.

**Caught in review, and fixed:** a broker for the day, which the glossary does not have (a broker's fee for one sale goes on that Sale); an empty lorry, which would have booked money nothing could ever carry; the same tag ticked twice giving a confusing refusal; a cascade on the join that would have re-split a paid cost if an Animal were ever removed; no Correction at all; the domain type still called `CameHome` when it now carries animals going out; the form only offering animals already flagged Ready, which is backwards at Eid; and formatter spill on an already-committed migration.
