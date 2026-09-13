# 46 — Calving

**What to build:** She calves. The record says when, how it went, and what was born — and the farm does the rest: she goes to Milking and her next Lactation begins, and the calf becomes an animal with the next `D-` number of her own. Twins are one calving and two calves. A stillborn calf is still created and immediately exits, because a calving history with a gap in it is not a calving history.

**Blocked by:** 45

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 5, user story 70; [Breeding and reproduction](../../openfarm-release-1/issues/11-breeding-and-reproduction.md) (step 6); [Animal lifecycle and groups](../../openfarm-release-1/issues/04-animal-lifecycle-and-groups.md); [Milk recording](../../openfarm-release-1/issues/09-milk-recording.md) (Lactation numbering).

- [x] A Calving records the date, the ease (unassisted, assisted, vet), and for each calf its sex and whether it was born alive
- [x] The dam reaches Milking and her Lactation number goes up by one, dated from the calving; days-in-milk follows from it without anybody typing a thing
- [x] Each calf is created with the next `D-` number and stands in the dam's Pen; a stillborn one is created and exits as Died in the same act
- [x] Twins are one Calving with two calves, not two Calvings
- [x] The dam and the calf can each be read back to the other, so a cow's page says what she has produced
- [x] Tests cover a live single calving, twins, a stillbirth, the Lactation starting, and the calf carrying her own number

## What was built

**A Calving is a Step Effect**, as the roles matrix gives it: `C` to Barn Staff "as SOP step", `C R U` to
the Manager, read-only to the Owner. The farm writes the procedure that carries it. The test uses a
round of the calving pen morning and evening, where a cow who has calved is recorded and the rest are
skipped. The Step asks, by fixed positions:

- when she calved
- how it went: unassisted, assisted, or with the vet
- a first calf's sex and whether it was born alive
- optionally, a second calf's sex and whether it was born alive, for twins

Publishing refuses a Calving procedure with any other shape, or one assigned to anybody but Barn
Staff or the Manager. The effect refuses the Owner, a cow in no State to calve (a heifer, a calf, a
bull), a calving later than now, and half a calf.

**What a calving does:**

- **The dam:** she goes to Milking and her Lactation number goes up by one, dated from when she
  calved, so days-in-milk follows.
- **Expected Calving:** it is cleared, and any dry-off or calving-prep work still open closes.
- **The record:** the Calving itself is kept (`calving` table), with the Lactation it began and the
  service it came from.
- **Each calf:** she becomes an animal of her own, with the next `D-` number, in her mother's Pen, born
  on this farm, dated from the calving, with no official tag yet. Her mother and the Calving she was
  born in are on her record.
- **A stillborn calf:** created and leaves as Died in the same transaction.
- **Twins:** one Calving, two calves.
- **Reading back:** a cow's page lists her calvings and each calf's number; a calf's page names her
  mother.

**A calving recorded again** — a phone replaying it, or a Correction — puts right what can be put right:
the hour, how it went, a calf's sex, a calf found to have been born dead. Some changes are refused:

- taking the calving back
- changing how many calves there were
- bringing a dead calf back

These change nothing, and the Manager gets a Needs Review, because a Tag Number once given is never
given again.

**Five tests**, in 2032, a year no other file uses:

- **A live single calving:** the Lactation starts and days-in-milk follows; Expected Calving is
  cleared; the calf has her own dairy number, is in her mother's Pen and names her mother.
- **Twins:** one calving with two calves.
- **A stillbirth:** the calf is created and Died; her mother still starts her Lactation.
- **Refusals:** the Owner, and an open heifer.
- **A correction:** a calf written up alive is put right as stillborn, and taking the calving back asks
  the Manager instead of undoing it.

Mutation-checked, each red: no new Lactation; a stillborn calf left alive; only one twin created; no
role gate; a heifer allowed to calve; a correction ignoring a stillbirth; a skip undoing quietly;
Expected Calving left standing.

**One unexplained red run.** Straight after OrbStack's Docker engine was restarted (it had hung twice
during this ticket), a full run failed three notification tests in the digest and push files. Those
files pass alone, and four full runs since have all passed (408). I could not show the cause; a Needs
Review this file raises is one thing those tests could see on the shared farm.

## Questions for the Owner

- **Does a stillbirth go on the mortality register, and who records how it was disposed of?** The
  register needs a cause and a disposal method, which nobody knows at the moment of calving. For now
  the stillborn calf is Died with no mortality record; her calving says she was stillborn.
- **Is a calf's pending ear tag anything more than having no official tag yet?** Nothing reminds
  anybody to tag her.

## Left open

- **No separate Dry-off record yet.** Lactations still start and end on the cow's own State and dates;
  the dry-off effect of ticket 45 still reads "did this entry dry her" from the moment her State
  changed.
- **The calf's arrival raises arrival-triggered work**, such as newborn care, as any arrival does. A
  stillborn calf raises death-triggered work, and no arrival work.
