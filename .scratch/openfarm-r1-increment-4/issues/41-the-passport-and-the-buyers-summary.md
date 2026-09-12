# 41 — The Animal Passport and the buyer's withdrawal summary

**What to build:** Everything the farm knows about one animal, on paper, for whoever asks: a buyer before they buy, a slaughter vet afterwards. The passport is her whole record — what she is, where she came from, every pen she has stood in including the last thirty days, what she has been treated with and whether anything is still holding her back, her vaccinations and every weight. The withdrawal summary is the sharp question on its own page: has she had anything in the last thirty days, and is she clear today or not.

**Blocked by:** 36, 39

**Status:** done

**Spec:** [Compliance reports and exports](../../openfarm-release-1/issues/19-compliance-reports-and-exports.md) — R7 and R8; the report set's own R7 and R8 (the spec's numbered stories for Fattening end at 65; these two documents are named in the report set rather than in a story); [Health, medicine and withdrawal](../../openfarm-release-1/issues/08-health-medicine-and-withdrawal.md) (the 30-day look-back and the 6-month disease history).

- [~] The passport carries her identity, her source, her pen history including the last thirty days' locations, her treatments with their withdrawals and her weigh-ins — **done**; her photo and a distinct vaccination list — **not done**, see below
- [x] The withdrawal summary answers clear or not clear as of today, and lists the treatments of the last thirty days with the prescription behind each
- [x] Both are produced for an animal who has already been sold, because that is when a buyer or a vet asks
- [x] Producing either is an Audit Event; the Vet may produce them too, and Barn Staff may not
- [x] Tests cover a passport for a treated animal, a "not clear" summary, a "clear" one, and a sold animal's passport still being readable

## What was built

`papers.passport` and `papers.withdrawalSummary`, built in the domain as one string each like the
other three papers, with the same bilingual labels and the same farm-of-origin heading.

**The passport reads for an animal who has gone.** It loads her by tag rather than demanding she
still be here, because a passport is asked for *because* she has left — by whoever is holding her
now — and a record that stopped being readable the moment she went would be no use to the person
who most needs it. Her pen history is built as spells: where she stood, from when, until the next
Move took her.

**The summary answers the sharp question first**, in both languages, because it is read at a
slaughterhouse gate with a lorry behind somebody. It reads the same Withdrawal record the Sale is
gated on, so the paper a buyer holds and the gate that refused a sale can never disagree. The doses
follow the answer: a buyer asked what she has had, not only whether she is clear this morning.

Both are the Vet's to produce as well as the Owner's and the Manager's — the roles matrix gives
them health reports to export, and a slaughter vet asks the farm for exactly these. Barn Staff may
not: they give the doses and record what they see, and what the farm tells the outside world about
an animal is not theirs to hand over.

## What the review changed

The spec axis found something that mattered more than anything else in this increment.

- **The summary told a buyer "CLEAR" on a hold a Vet had cut short, and said nothing about it.**
  The farm holds `withdrawalShortenedAt`, the reason, and `meatWithdrawalFromDoses` — what the
  doses alone would have said — and the schema's own comment calls that "exactly what a slaughter
  vet asks about". I selected all three columns and then never used one of them. A farm saying
  "clear" on a shortened hold without saying so is the farm asking to be taken at its word on the
  one point where its word is not enough. **Both papers now disclose it**: the day it was
  shortened, the Vet's reason, and the date the doses alone would have run to — printed whether
  she is clear or not, because it matters most in the case where she is. There is a test.
- **The two papers could contradict each other.** A dose's own clear-for-meat date is worked out
  from the product's days, and the animal's status from her record; on a shortened hold those
  disagree. The passport now carries her status today, from the same reading the summary uses.
- **"Prescribed" without a name is not an answer.** R8 asks for treatments "with prescriptions",
  and both papers said only *yes* or *no*. They name the prescribing Vet now, and who gave the
  dose — which the glossary's own definition of a Treatment requires.
- **The look-back was thirty times twenty-four hours.** The rule is "the thirty days before
  slaughter" and a regulator counts those on a calendar. Thirty farm days now.
- **A sold animal's passport said she was still standing in her last pen** — on the very document
  that exists because she has gone. Her last spell ends when she left.
- **The lists could be silently truncated.** A legal course runs to a hundred and twenty doses, so
  forty was not enough to promise "everything in the last thirty days". The limits are larger,
  one row past each is read, and the paper says when there was more rather than letting a reader
  believe a cut-off list is the whole of it.
- **`sourceOf` decided "born here" from a missing Intake row** rather than from the Animal's own
  `source` column — so a bought-in animal whose seller nobody wrote down would have been called
  born on the farm.
- **Barn Staff were offered two buttons that refuse them.** Gated.
- **The passport named the previous buyer.** R7 names the destination; who took her before is not
  the next holder's business.
- **Two dead message keys**, and three names for one paper — the glossary calls it a Withdrawal
  Summary and the button called it something else.
- **`routers/papers.ts` had grown to two unrelated halves.** The animal's record is its own module.

## A bug this ticket's own test found

`sale.lastToday` bounded the farm's day at its start and **not at its end**, so it would offer the
buyer and lorry of any sale dated later than today. On a real farm with a real clock nothing is
dated in the future and it would never have shown; on the shared test farm a sale in July surfaced
as "the last sale of 2 April". Bounded at both ends now.

## Decisions and departures

- **There is no vaccination list, because the farm cannot tell a vaccine from a wormer.** A
  vaccination is a Campaign, and a Campaign's dose is a Treatment like any other; nothing on a Drug
  Product says what kind of thing it is. The passport therefore lists every dose and marks each one
  *prescribed* or *campaign*, which is true, rather than a "vaccinations" heading that would be a
  guess. **This is worth an Owner decision**: giving a Drug Product a kind would let the passport
  carry the vaccination register the report set and the Inspector View both name.
- **The dose's clear-for-meat date and her status today are different facts**, and both papers
  now carry both. The dose says what it held her for; her record says what holds her now, which a
  Vet may have shortened.
- **Her age is her birth date when the farm has one, and otherwise what the seller said at
  Intake** — labelled as an estimate, because that is what it is.
- **The summary lists the last thirty days even when she is clear.** Clear today and untouched for
  a month are different answers to different questions, and a buyer is entitled to both.

## Not done, and why

- **No photo on either paper.** The report set asks for one on both R7 and R8, and the farm holds
  it; putting an image into a document that is otherwise a string is a change of machinery, and
  the same change that would make these real PDFs. Recorded rather than half-built.
- **Still no PDF.** Same as ticket 40: these print to A4 through the browser.
- **No six-month disease history.** It belongs to the Inspector View rather than to a buyer's
  papers, and the Inspector View is not in this increment.

## Verification

`pnpm check-types` clean across the workspace; `pnpm test` 398 passing (369 api + 19 web + 10
i18n), up from 393 — a passport carrying a treated animal's pens, doses and weights, a summary
that says "not clear" with the day she becomes clear and then "clear" once it has passed, **a
shortened hold disclosed on both papers where one of them says "clear"**, a sold animal's passport
still readable, and the Vet producing one where a milker is refused. `pnpm build` clean; `oxfmt` and `oxlint` clean on every changed file.
