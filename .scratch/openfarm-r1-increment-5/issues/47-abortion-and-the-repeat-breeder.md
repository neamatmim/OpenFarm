# 47 — Abortion, and the Repeat Breeder

**What to build:** Two ways a pregnancy ends without a calf. An Abortion is an event the Vet records — the date, how far along she was, and their note — and it clears the pregnancy, takes back the work that was being pulled towards a calving that will not happen, and sends her back to heat watch. And a cow who has failed three services is a cow somebody has to decide about: the farm raises a Repeat Breeder for her.

The Owner decided on 2026-09-13 that a Repeat Breeder goes **on the Manager's queue** and buzzes nobody's phone — a cull-or-treat decision deserves somebody sitting down with it, and every alert that can wait makes the ones that cannot matter less.

**Blocked by:** 44

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 5, user story 71; [Breeding and reproduction](../../openfarm-release-1/issues/11-breeding-and-reproduction.md) (Failures).

- [x] An Abortion records the date, the stage and the Vet's note; it is the Vet's to record
- [x] It clears her pregnancy and her Expected Calving, closes the dry-off and calving-prep work still owed, and returns her to heat watch
- [x] After the threshold of failed services she is raised as a Repeat Breeder on the Manager's queue, with what she has failed at; the threshold is a Farm Parameter
- [x] A Repeat Breeder is never a State change and never a cull: it is a person's decision, recorded as one when they make it
- [x] Tests cover an abortion clearing the work, the flag at the threshold and not before, and the flag surviving until somebody answers it

## What was built

**The Abortion is the Vet's own act**, recorded from the Vet's own phone (`breeding.recordAbortion`), the
same way a Diagnosis is. It is not a Step: a pregnancy lost is found, not scheduled. It records:

- when it happened
- how many months along she was, as the Vet judged it
- the Vet's note
- what calving had been expected, and the service it came from, so the record still says which
  pregnancy was lost after her page has moved on

It refuses anybody but the Vet, a Shed Phone, a cow who is not carrying, a time later than now, and a
time before the service the pregnancy came from. The Vet can put the day, the stage or the note right
(`breeding.correctAbortion`), with a reason; what it did to her pregnancy stands.

**What it does:**

- **Her pregnancy:** Expected Calving is cleared, and a Pregnant Heifer is a Heifer again, back on heat
  watch.
- **The work:** dry-off and calving prep still owed close, through the same follow-the-date path as
  ticket 45.
- **Afterwards:** when her pregnancy is worked out again, only her latest positive check counts, and
  only while that pregnancy is still hers. One she lost, or one she has already calved from, gives
  nothing, rather than falling back to an older positive.
- **Her page:** it lists her lost pregnancies, and gives the Vet the form while she is carrying.

**The Repeat Breeder** is worked out, not stored, each time the Manager's home is read. A cow is on the
queue when she has failed at least `repeatBreederThreshold` attempts since she last calved (a new Farm
Parameter, 3), counted by Attempt as ticket 44 counts them, and has failed again since anybody last
answered for her. A cow found carrying again is not on it.

- **On the queue:** her Tag Number, how many attempts did not take, and for each one the day, how she
  was served, the sire, who served her, and whether the Vet found her empty or she came back into heat;
  and what was decided last time. The Manager sees it on their home, and the Vet on theirs
  (`breeding.repeatBreeders`).
- **Answering it** (`breeding.answerRepeatBreeder`, the Manager or the Vet — the Owner is not shown the
  form) is refused for a cow who is not on the queue, so a second tap finds nothing. It records "serve her again",
  "treat her first" or "cull her", with a reason and how many failures she had. That is the whole of
  it: no State changes, and a cull decided here is still a Sale or a Mortality somebody records when she
  goes.
- **It raises no Alert.** It is listed on the Manager's home and pushed to nobody (the Owner's decision).

**Three tests**, in 2033, a year no other file uses. They grew in review:

- **An abortion:** refused for the Manager, recorded by the Vet, clearing her date and State and closing
  her calving prep; the Vet corrects the stage and the Manager may not; then refused for a cow no longer
  carrying.
- **The flag at the threshold and not before:** served in three heats with two failures, not on the
  queue; a fourth heat makes three, and she is on it with each failure's day, method, sire, technician
  and reason, still a Heifer.
- **The flag surviving until answered:** still there a week on and on the Vet's list too; refused to the
  Owner; answered by the Manager, a second answer refused, and gone; she fails again, and it is back,
  showing the last answer.

Mutation-checked, each red: an abortion leaving the work; the threshold off by one; an answer that never
clears; an answer that clears for ever; a Pregnant Heifer left pregnant; a cow not carrying accepted; an
answer for a cow not on the queue; the wrong reason for a failure; the Vet unable to read the queue.

## What the review changed

The standards axis found a real bug in re-deriving her pregnancy: it skipped positives of a lost
pregnancy and fell back to an older one — one she may already have calved from — setting a calving in
the past. The spec axis found the same thing from a farm scenario: calved from A, B confirmed and lost,
served for C. Now only her latest positive counts, and only while it is hers.

The spec axis also found:

- **The Vet could not see the flag.** The matrix gives the Vet read and decide, and the notification
  table sends it to the Manager and the Vet.
- **"What she has failed at" was only dates.** It now has the method, sire, technician and reason.
- **Failures counted over her whole life.** Now they count since her last calving — see the question
  below.
- **Any cow could be answered.** An answer for a cow not on the queue would quietly hold back her flag
  later. Now refused.
- **An abortion could be dated before the service it ended.** Now refused.
- **The Owner was offered a form that refused them.** It is hidden.
- **There was no abortion correction.** The Vet has one now.

The standards axis also found:

- **The answering Role could be written as the Manager's** when it was not. Now a Role column, from the
  Role actually used.
- **A copied Vet-only procedure whose comment claimed every clinical act.**
- **Type assertions in the answer form.**
- **A refusal with no word**, so it came back in English.
- **"Pregnancies lost"**, near the glossary's avoided "loss".

## Questions for the Owner

- **Do failed services count since her last calving, or over her whole life?** I count since her last
  calving, so a cow who struggled three years ago and has calved twice since is not raised at her first
  failure now. That is what farms usually mean, but it is your call.
- **Where does a Dry cow go when she aborts?** Late enough, she may come into milk. For now only a
  Pregnant Heifer changes State — back to Heifer — and a Dry cow stays Dry with no calving expected.
- **Should a visiting Vet be able to record an abortion or answer a Repeat Breeder?** The matrix scopes
  them to their own cases, and the farm has one Vet Role today.

## Decisions made here

- **An abortion is not a failed attempt.** She took, and lost it. For the Vet that is a different
  question from a cow who does not take, and the spec counts "failed services".
- **The Vet may answer a Repeat Breeder as well as the Manager.** The breeding spec says "for the
  Manager/Vet to decide cull or treat"; the Owner reads it.
- **Stage is months, as the Vet says it**, from 1 to 9. It is not worked out from the service, because a
  cow bought in carrying has no service here.

## Left open

- **"A lost pregnancy is not revived by a positive check" has no test of its own.** Reaching it needs a
  served, checked and aborted cow whose check is then corrected.
- **Every home read works through every served dairy female's services and checks.** Cows with fewer
  services than the threshold are skipped first. Fine for a few hundred head.
- **An abortion recorded late dates the heifer's return to heat watch** from when it happened, which may
  be before the fortnight State triggers look back over.
