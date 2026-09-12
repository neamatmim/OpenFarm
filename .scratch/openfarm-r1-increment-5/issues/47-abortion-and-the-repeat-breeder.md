# 47 — Abortion, and the Repeat Breeder

**What to build:** Two ways a pregnancy ends without a calf. An Abortion is an event the Vet records — the date, how far along she was, and their note — and it clears the pregnancy, takes back the work that was being pulled towards a calving that will not happen, and sends her back to heat watch. And a cow who has failed three services is a cow somebody has to decide about: the farm raises a Repeat Breeder for her.

The Owner decided on 2026-09-13 that a Repeat Breeder goes **on the Manager's queue** and buzzes nobody's phone — a cull-or-treat decision deserves somebody sitting down with it, and every alert that can wait makes the ones that cannot matter less.

**Blocked by:** 44

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 5, user story 71; [Breeding and reproduction](../../openfarm-release-1/issues/11-breeding-and-reproduction.md) (Failures).

- [ ] An Abortion records the date, the stage and the Vet's note; it is the Vet's to record
- [ ] It clears her pregnancy and her Expected Calving, closes the dry-off and calving-prep work still owed, and returns her to heat watch
- [ ] After the threshold of failed services she is raised as a Repeat Breeder on the Manager's queue, with what she has failed at; the threshold is a Farm Parameter
- [ ] A Repeat Breeder is never a State change and never a cull: it is a person's decision, recorded as one when they make it
- [ ] Tests cover an abortion clearing the work, the flag at the threshold and not before, and the flag surviving until somebody answers it
