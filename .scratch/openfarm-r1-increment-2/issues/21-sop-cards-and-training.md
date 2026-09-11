# 21 — SOP Cards and who was trained on them

**What to build:** Every published Version can be printed as a one-page Bangla card — the purpose, the Steps, the icons and what Evidence each needs — so the training material on the shed wall is always the procedure actually in force. The Manager marks a Staff member as trained on a Version, and the farm can show who knew which procedure on any date.

**Blocked by:** None — can start immediately.

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 2, user stories 42 and 43.

- [x] A Card is generated from a published Version, in Bangla, and prints on one A4 page
- [x] The Card names its Version and the date it was published, so a card on a wall can be checked against the Playbook
- [x] The Manager records "trained on this Version" per person; it is an Audit Event, never a flag that can be edited away
- [x] A person's training shows on their page and on the SOP's
- [x] Tests cover generating a Card and recording training

**How it was built.**

- **The Card is generated, never written beside the Playbook.** It is the published Version rendered for paper: the purpose, the Steps in order, what each one records, and the reasons an animal may be skipped. A card and a procedure that can drift apart are worse than no card, because the wall is what people believe.
- **It names its own Version and the day it was published**, so a card somebody printed in March can be checked against the Playbook rather than trusted. That line is the whole point of printing it.
- **One A4 page**, with the screen's own furniture — the print button, the training panel — left off the paper.
- **Training is what was taught, not a tick beside a name.** A Version published this morning does not untrain anybody, and being taught the new one does not erase what somebody was taught in March. "Who knew which procedure" is a question about a date that has already passed, and it is asked after something has gone wrong, so the farm keeps every teaching with its Version, its day and who did it. Teaching the same Version twice is one fact, not two.
- It reads from both sides: the Card page lists who has been taught this SOP, and a person's row on **Admin → People** lists what they have been taught.

**Named, and written down.** **SOP Card** was already the glossary's word and is used as it defines it. **Trained On** was not, and is now — with what it deliberately avoids, since "signed off" already means the Manager checking finished work.

**An accident worth recording.** Running the repo's formatter with a file list that came back empty reformatted every Markdown file in the repository instead — old ticket files, runbooks, migration snapshots. Nothing was lost and it is all reverted, but it is the same churn the `vp fmt` versus `ultracite fix` disagreement threatens, arriving by the back door: `pnpm exec oxfmt $(git diff --name-only …)` formats the whole tree when the command substitution is empty. A file list that might be empty needs a guard.

**Review outcomes folded in.** The worst finding was where the card lived.

- **The people the card is for could not reach it.** The route sat under `/admin`, which turns Barn Staff away at the door — a card for the shed wall that only the Manager could open. It lives at `/cards/…` now, which is what the procedure behind it always allowed. A person can see their own training too; before, only the Manager could.
- **The card printed in whoever printed it's language.** A Manager whose own app is in English would have taken an English card to a shed that reads Bangla. The card is Bangla whoever prints it, and its numerals are Bangla numerals. The training panel beside it stays in the reader's own language, because that part is the Manager's, on screen.
- **The trail said something had happened when nothing had.** Marking the same person on the same Version twice wrote a second Audit Event pointing at a row that was never inserted. Nothing changed, so nothing is written now, and the answer says which of the two it was.
- **Anybody's id could be marked as trained** — the Version was checked against the farm and the person was not. It has to be somebody who works here and has not been let go.
- **A person with no Role here could be read** through the person view, name and email included.
- **Twenty people meant twenty round trips**, each re-fetching what the list already had. One question now.
- **The one-page promise was a stated intention with nothing behind it.** A long SOP ran onto a second sheet, and the app's own furniture printed on top of the card. Everything but the card is now hidden from the printer, and past eight Steps the card tightens to two columns and smaller type. It is still best effort: nothing here can measure a page, and that is worth saying rather than implying otherwise.
- **"Who knew which procedure on any date" was a list, not an answer.** Asking as of a date is what the question means, and the list carries the day each Version was published, so the Manager can see what was in force. Tested.

**A word about where this leaves increment 7.** The increments table lists trained-on records under increment 7 as well. What is here is the record and the card; increment 7 still has the Inspector view and the PDF export it wants for a visiting official, and both can read these rows rather than inventing another.
