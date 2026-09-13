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

It refuses anybody but the Vet, a Shed Phone, a cow who is not carrying, and a time later than now.

**What it does:**

- **Her pregnancy:** Expected Calving is cleared, and a Pregnant Heifer is a Heifer again, back on heat
  watch.
- **The work:** dry-off and calving prep still owed close, through the same follow-the-date path as
  ticket 45.
- **Afterwards:** a positive check of the pregnancy she lost cannot bring it back when her pregnancy is
  worked out again.
- **Her page:** it lists her lost pregnancies, and gives the Vet the form while she is carrying.

**The Repeat Breeder** is worked out, not stored, each time the Manager's home is read. A cow is on the
queue when she has failed at least `repeatBreederThreshold` attempts (a new Farm Parameter, 3), counted by
Attempt as ticket 44 counts them, and has failed again since anybody last answered for her. A cow found
carrying again is not on it.

- **On the queue:** her Tag Number, how many attempts did not take, the day each of those was first
  served, and what was decided last time.
- **Answering it** (`breeding.answerRepeatBreeder`, the Manager or the Vet) records "serve her again",
  "treat her first" or "cull her", with a reason and how many failures she had. That is the whole of
  it: no State changes, and a cull decided here is still a Sale or a Mortality somebody records when she
  goes.
- **It raises no Alert.** It is listed on the Manager's home and pushed to nobody (the Owner's decision).

**Three tests**, in 2033, a year no other file uses:

- **An abortion:** refused for the Manager, recorded by the Vet, clearing her date and State and closing
  her calving prep, then refused for a cow no longer carrying.
- **The flag at the threshold and not before:** served in three heats with two failures, not on the
  queue; a fourth heat makes three, and she is on it with the days she was served, still a Heifer.
- **The flag surviving until answered:** still there a week on, refused to the Owner, answered by the
  Manager and gone; she fails again, and it is back, showing the last answer.

Mutation-checked, each red: an abortion leaving the work; the threshold off by one; an answer that never
clears; an answer that clears for ever; a Pregnant Heifer left pregnant; a cow not carrying accepted.

## Decisions made here

- **An abortion is not a failed attempt.** She took, and lost it. For the Vet that is a different
  question from a cow who does not take, and the spec counts "failed services".
- **The Vet may answer a Repeat Breeder as well as the Manager.** The breeding spec says "for the
  Manager/Vet to decide cull or treat"; the Owner reads it.
- **Stage is months, as the Vet says it**, from 1 to 9. It is not worked out from the service, because a
  cow bought in carrying has no service here.

## Left open

- **An abortion cannot be corrected yet.** The matrix gives the Vet `U`; there is no correction route.
- **An abortion late enough to bring her into milk** changes nothing about a Dry cow's State.
- **"A lost pregnancy is not revived by a positive check" has no test of its own.** Reaching it needs a
  served, checked and aborted cow whose check is then corrected.
- **The Owner sees the answer form on the home screen** and is refused on submitting it.
