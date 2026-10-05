# 04 — A Venture's lost animal

**What to build:** A Lost Venture animal ends her Holding and settles as the Owner chooses (D6).

**Blocked by:** 02, D6, and the advisers if D6 changes approved paper wording

**Status:** done 2026-10-05 (unblocked the same day — the Owner: "Don't wait for advisor, implement as your recommendation").

- [x] `WhatHappened` carries `lost` beside `died` (`holding.ts:147,205`), filled in `returns-store.ts:154`.
- [x] While she is Missing, Settlement stays blocked (`settlement-store.ts:211`); the screen says "missing".
- [x] Investor papers count lost apart from deaths (`investor-papers.ts:175`, `portal-reads.ts:250`).
- [x] If D6 is the Farm making good, that is a Venture Movement in.
- [x] Templates: a lost/stolen clause beside the death clause (`standard-templates.ts:100-103,284`) — new wording to the
      lawyer and Shariah scholar first.
- [x] **Somebody opens it:** the Settlement, অগ্রগতি, হিসাব নিকাশ. Both languages.

## Decided 2026-10-05 (Claude's recommendation, at the Owner's word, ahead of the advisers)

- **Made good at her cost to date:** what she cost the Venture — her purchase and every charge on her while she was
  its — to the taka, the same figure the death notice gives the Owner.
- **In the same act as the write-off,** by bank into the Venture Account (it takes nothing else), with the transfer's
  reference and the Farm Account where the farm lists its accounts. Refused without a reference.
- **A Venture Movement `made_good`** lands with the Venture's proceeds: she costs the Investors nothing. On the Farm's
  own books it is money out, under its own Category ("Lost Venture animal made good").
- **While she is only Missing,** the Settlement names her as missing, apart from the animals still standing.
- **The papers** count a lost animal apart from deaths, and say the Farm made her good.
- **Wording:** a lost/stolen clause beside the death clause in the standard Agreement. A farm that published its own
  Agreement wording keeps it until it publishes again.

**As built:** `animals.writeOff` takes `madeGood { reference, farmAccountId? }` for a Venture's animal (refused
`made_good_needs_reference` without it); `made-good-store.ts` `costToDateOf` / `makeGood`; movement kind `made_good`
(with `venture_movement.animal_id`) folds into proceeds; Money Event source/Category `venture_made_good`; migrations
`20261005152258_venture_made_good` (checks) and `20261005152833_made_good_animal`. Settlement block
`an_animal_is_missing`. `lostCount` in the Venture herd and the settlement story; the progress paper and the
হিসাব নিকাশ's English for deaths now reads "Died" (it read "Lost"); portal herd line says the lost apart. Returns: a
made-good animal's Holding ends with the made-good money back (`ReturnBooks.madeGood`). A made-good movement is not put
right on the Venture's side alone (`made_good_with_the_farms_money`). Standard Agreement: the lost/stolen clause after
the death clause. Opened on the seed: F-0027 missing in the Settlement, written off from her page (৳1,33,222 made
good), on the Venture's money tab.
