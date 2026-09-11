# 18 — Observations from the health walk and the heat watch

**What to build:** What Staff notice on the daily round becomes a fact the farm can ask questions of. A Step with an Observation Effect records that this animal was seen in this condition — bulling, limping, off her feed — by this person at this time, and the animal's page shows what has been seen of her alongside everything else. The Manager can see every animal seen in heat this week without opening an Instance. Increment 3 turns an Observation into a Diagnosis and increment 5 turns one into a Service; this ticket only has to record it truthfully.

**Blocked by:** None — can start immediately.

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 2 (health walk, heat watch). Confirmed with the Owner 2026-09-11: a durable record now rather than Evidence alone.

- [x] A Step with an Observation Effect writes an Observation from the Step's Evidence, idempotent on the Completion
- [x] What may be seen is authored on the Step, in Bangla, and validated at publish like every other choice
- [x] An Animal's page lists her Observations, newest first, each naming the Instance and the person
- [x] An Observation is correctable and supersedable like any other entry; nothing is deleted
- [x] Tests cover recording, replay, the animal's view and a correction

**The word was already in the glossary, twice.** This shipped as "Sighting" and the review caught it: CONTEXT.md has had **Observation** — "a Staff or Manager note that an Animal looks unwell (sick, lame, off-feed); starts the health chain" — since the map was drawn, and **Heat** for the oestrus case. A third word for the same thing is how a glossary stops being worth reading. Everything is Observation now: the table, the effect, the screen, the words on it. The glossary entry was widened rather than joined by a new one, which is the rule that was broken in the first place.

**How it was built.**

- **The value is the record; the label is what the person read.** Both are kept. Health and Breeding will match on the value in later increments, and rewording the Playbook next season must not change what last month's round said. The screens show the Bangla; nothing shows the internal word.
- **What may be seen is checked against the Version that offered it**, the way a Move's Pen is checked against the farm's. A word no Version ever declared is not something anybody saw, and it is refused at the entry.
- **A Correction withdraws and writes anew.** The row stays, marked with when it was withdrawn and what replaced it. This is the opposite of what the litres and the Moves do, and deliberately: what somebody said they saw is a fact about the round.
- **Editing the list of choices keeps the values records already point at.** Only the labels change. Rewriting them because somebody reworded the list would orphan every Observation the farm had made.

**Review outcomes folded in.**

- **The ticket's own promise was not deliverable.** "The Manager can see every animal seen in heat this week without opening an Instance" — there was no herd-wide query and no screen, and the only index was per animal. There is a **Rounds** screen now: what was noticed in the last seven days across the herd, filtered by what was seen, each row linking to the animal and to the work. The index it needs is on the Farm and the time.
- **The animal's page showed the internal word**, not the Bangla the person chose — see the value/label decision above.
- **The Observation had no foreign key to the Completion that made it**, unlike every comparable table, so a dangling row would have been a crash on the animal's page rather than a null.
- **The wrong message.** A blank Observation was refused with a pen error, because the Move's validation was reused without its words.
- **A note alongside what was seen was dropped**, along with its column. The Playbook editor authors one piece of Evidence per Step, so no Owner could have authored an Observation *and* a note — plumbing for something nobody can reach is not worth the column. It comes back when a Step can be authored with more than one piece of Evidence.

**Still to come, and worth knowing.** Nothing marks which Observations are Heats: increment 5 raises the AI SOP from a Heat, and it will do that by reading the word the farm chose for oestrus — additive, but it is the first thing that increment has to decide.
