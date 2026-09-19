# 15 — The default split is not a Farm Parameter

**What is wrong:** Story 100 names six things that must be Farm Parameters "so that an adviser's answer
is a setting rather than a release". Five are. The **default split** is not: the Investors' percentage is
typed by hand into every Investment Agreement, from memory, with nothing to start it at.

The Owner is about to put the structure to a lawyer and a Shariah scholar, and the split is the single
figure most likely to come back changed. Today that answer is a habit somebody has to remember at every
signing. That is exactly what story 100 exists to prevent.

**Status:** done

**Spec:** [Ventures spec](../../openfarm-investor-projects/spec.md) story 100. `CONTEXT.md` —
**Investment Agreement**, **Settlement**.

- [x] The default split is a Farm Parameter, the Owner's to set, beside the other five
- [x] Signing an Agreement starts at it rather than at nothing
- [x] It is a starting point and not a rule: what the paper says still governs, and may differ
- [x] The Owner sets it on the settings screen in her own language

## Checked before starting

**Five of the six are already there.** `farm` (`packages/db/src/schema/farm.ts:85`) holds
`ventureFloorPercent`, `ventureRunningPercent`, `investorCap`, `windUpDays` and
`adjustmentThresholdBdt`, all settable through `farm.setParameters`
(`packages/api/src/routers/farm.ts:70`) and all listed in `A_VENTURES_OWN` (`:115`) as the Owner's rather
than the Manager's. Only the split is missing.

**Where it would be used.** `sign-agreement-sheet.tsx:30` starts `investorsPercent` at `""`. The figure
is frozen onto the Agreement at signing and every Agreement on one Venture must carry the same one — a
Settlement is blocked by `agreements_disagree` (`packages/api/src/settlement-store.ts:171`) when they do
not. So a default is not only convenience: it is the thing that stops the second Agreement on a Venture
disagreeing with the first because somebody typed 55 where they meant 60.

**It must stay a default.** What each Investor signed is what governs, and an **Amendment** is the only
thing that moves it. The Parameter prefills the field and nothing more; it is never read at Settlement,
never compared against, and changing it never touches an Agreement already signed.

**No new vocabulary.** "Split" is the word `CONTEXT.md` already uses for the profit percentages, in
**Settlement** and in **Amendment**. `ventureInvestorsPercent` follows `ventureFloorPercent` and
`ventureRunningPercent`.

**This one needs a migration**, unlike ticket 14: an integer column on `farm` is a real schema change.

## What was decided while building

**Derived, not an effect.** The sheet reads an empty split field as the farm's own starting point rather
than syncing the Parameter into state when the sheet opens. So the field always shows the figure that
would actually be signed, and clearing it goes back to the default instead of to a blank somebody might
sign past. No lifecycle, nothing to get out of step.

**The farm does not answer everyone with its Parameters.** `farm.current` returns `{ id, name }` alone to
somebody the settings are not for, so the sheet reads the figure only where it is actually present rather
than assuming it onto every shape of the answer. TypeScript caught this; the screen would have shown a
blank field and nobody would have known why.

**A pre-existing wart became visible.** The hint under the field reads "খামার পায় ৪০%", and the numeral
was ASCII. That was true before, but only after somebody typed; prefilling made it show the moment the
sheet opens, so it is worded through `formatNumber` now. See [[bangla-numerals-in-bangla-sentences]].

**Six of six.** Story 100's list is complete: the Investor cap, the Wind-up Period, the default split, the
Floor percentage, the Running Budget share and the Adjustment threshold. All sit together in the ভেঞ্চার
section of the farm page, and all are the Owner's rather than the Manager's.

## What was seen, and what was not

The Parameter was read on the settings screen at 60, and the sign sheet was opened on the seeded farm and
showed 60 with the Farm's 40% beneath it. Both with my own eyes.

The `formatNumber` wording went in **after** those screenshots, and the sheet could not be reopened
afterwards across about eight attempts — no console error, no server error, and the diff reads correctly.
`read_page` showed no dialog element at all rather than a broken one, and a dialog is portalled the moment
`open` turns true, so the sheet was never mounting: that state lives in `ventures.tsx`, which this ticket
does not touch. The clicks were landing on a card that had been through many hot reloads and toggles. The
Bangla numeral itself is therefore the one thing here that was reasoned about rather than seen.
