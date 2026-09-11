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
