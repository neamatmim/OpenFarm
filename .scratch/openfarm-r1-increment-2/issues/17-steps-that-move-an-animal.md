# 17 — Steps that move an animal

**What to build:** Moving an animal between Pens becomes something the Playbook does, not something somebody remembers to do on an admin screen. A Step carries a Move Effect: completing it writes the Move, with the reason the Step recorded, in the Completion's own transaction. The animal's history reads back as one story — the work that moved her and the Move itself — and a Move made this way is correctable like any other entry.

**Blocked by:** None — can start immediately.

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 2 (animal movement SOPs), user story 39.

- [x] A Step with a Move Effect writes a Move when completed, idempotent on the Completion like the Milk Record Effect
- [x] The destination Pen comes from the Step's Evidence; a Pen that is not the farm's is refused
- [x] The animal's history shows the Move and the Instance that caused it
- [x] Correcting the Step re-runs or reverses the Move under the existing correction rules, or raises Needs Review when it cannot
- [x] Tests cover the happy path, a replayed entry, and a correction

**How it was built.** One place writes a Move now, and both the Playbook and a person recording one by hand go through it. That was not true when this started: the Step's Move and the Manager's Move were two implementations that already disagreed about four things — whether an animal who has left the farm may be walked anywhere, whether open work raised about her follows her, and the Pen rules at both ends.

Decisions worth remembering:

- **The destination is the Owner's, not the doer's.** A Move recorded by hand is refused if either Pen is outside the person's Pen Assignments. A Move the Playbook makes is not: the destinations are authored into the Step, and a milker assigned to the milking pen has to be able to walk a cow to the dry pen, because that is what the procedure says to do. What they may work on at all is already settled by the Instance.
- **"Has anything moved her since?" is asked of the Moves, not of where she is standing.** A cow walked out of a Pen and back into it is standing where the Step left her, and is still a cow the farm has learned something newer about. Asking the wrong question made a Correction quietly undo two Moves that came after it.
- **A Step that chose the Pen she was already in makes no journey**, so there is no Move row — and the "has anything moved her since" question has to work without one, or a Correction walks her somewhere on the strength of a Move that never existed.
- **Only the milk effects open a Milking Session.** Every effect used to open one before it ran, so a Step that walks a cow to another Pen would have created a session nobody milked into.

**Beyond the ticket: the Playbook editor could not author an effect at all.** There has never been a way to attach one, which means the milking SOP that increment 1 is built around could not have been authored by the Owner either — every SOP with an effect in this repo was made through the API by a test. The editor offers the three effects now, and choosing "move" hands the Step the farm's own Pens rather than asking anybody to type an id. It is more than this ticket asked for; a Step Effect nobody can author is a feature the farm cannot reach.

**Review outcomes folded in.**

- **Two Corrections could rewrite where she stands on stale information** — the two sequences above, both now tested: walked away and back again, and a Step that never moved her.
- **A Step's Move ignored three rules a manual Move enforces** — an animal that has left the farm, the open work that should follow her, and the Pen the Move starts from. One shared recorder, one set of rules.
- **The animal's page showed a Move as a bare date and Side.** The API had the Pens and the work that caused the journey; the screen printed neither. It reads "milking pen → dry pen", with a link to the work that walked her.
- **The Playbook editor threw away authored Evidence** when the effect select changed — a unit, a range, a set of Pens, gone with no undo. Evidence that already fits the effect is left exactly as authored, and the two fields that could contradict an effect (the Evidence type and the per-animal switch) are no longer editable while one is set.

**Left as it is, and worth the Owner's view.** Correcting a Step to "this never happened" **deletes** the Move row. Both reviews raised it against the glossary — *a Correction supersedes, the original stays visible; nothing is ever deleted*. It is what Milk Records have done since increment 1: the Completion is the record, the Move is what the Completion projects into the herd register, and the Audit Event chain keeps the whole story of what was entered, corrected, and by whom. Keeping a journey in the register that the farm has since decided never happened is the alternative, and it needs a "this was withdrawn" mark on every screen that reads Moves. The farm should decide which it wants before the register is a year long.

**And one the tests found on the way.** The guard that asks whether anything has moved her since asked SQL for Moves "not made by this Step". A Move nobody recorded through a Step has no Completion at all, and in SQL "not this one" quietly means "not null and not this one" — which is every Move anybody has ever made by hand. The guard was looking straight past the only kind of Move it was written to catch. It is compared in code now, where null means what a person means by it.
