# Survey of the Venture and Investor work, 2026-10-05

Three read-only reviewers went over the work merged since 5d1d2a69: money paths, what Investors see, and the Owner's screens. The Owner chose to build all four groups.

Each finding is either **confirmed** (a test went red) or **traced** (read line by line, not yet shown by a test). A traced finding gets a failing test first.

## A. Lost animals made good

1. **Confirmed.** A Venture's animal written off and made good, then Found, stays the Venture's, and the made-good money stays with the Venture too. A probe test showed a bull back in quarantine, still the Venture's, with ৳80,000 made good. Investors would take the Farm's money as profit when he is sold. **Decision:** once made good, Found makes her the Farm's own. The Farm paid the Venture for her, so the made-good money stays as the Venture's proceeds for her.
2. **Traced.** The made-good amount for an animal the Venture bought from the Farm by Internal Sale is her Intake price plus every charge over her life. It should be what she cost the Venture: what it paid for her, plus the charges while she was its own, as the Settlement charges it (`settlement-store.ts` `chargedTo`).
3. **Traced.** The write-off dialog never says how much the Farm must transfer. **Decision:** show the amount before the act.
4. **Traced.** Correcting the round after a write-off deletes the Missing row although it is written off (`takeBackMissingOpenedBy`). The animal stays `lost`, can never be Found, and Returns lose how she left. **Decision:** a written-off Missing is not taken back by correcting the round.

## B. Adjustment send amount

The Adjustment "send" sheet (`adjustments.tsx` ~309) works out the amount over every Unit of the Settlement, the Farm's own Units included. The server books only the Investors' part. The paid list (~229) shows the Farm's row with money it never received. **Decision:** the API says what to send, Investors' Units only, and the screen shows that figure.

## C. Stuck Pay-in Notes

A paid-by-the-month Venture moves to selling on its first Sale (`reachesSellingOnASale`) without closing waiting Pay-in Notes. The Owner cannot receive them and the Investor cannot change them, so they wait forever. Also traced:

- the portal offers a note that will be refused (paper not on file, or nothing left to pay);
- the form defaults to `due`, not to what is left;
- Change stays offered after the switch is turned off.

## D. Farm capital disclosure

1. A draft printed before the Farm took Units can be signed without the clause, and later copies then print a clause the Investor never signed.
2. The Owner's own published wording may have no `farm_capital` clause, yet the Farm may still take Units.
3. The split is checked only at signing, not on the draft or the in-app offer, so a stamp can be wasted.
4. "The farm takes units" is shown while an in-app offer is waiting, and the refusal's words say "an investor has signed".
5. Wording: "The farm (its own capital)" is capitalised mid-sentence.
6. On a fresh farm, the Farm's Units could give the farm a wrong Version 1 history.

## Status

| Group | Branch | Status |
| ----- | ------ | ------ |
| A     | fix/made-good-found | Done   |
| B     | fix/adjustment-amount | Done   |
| C     | fix/stuck-pay-in-notes | Done   |
| D     | fix/farm-capital-disclosure | Done (D5 left: the capital "The farm" mid-sentence shows only where the Farm's row no longer appears; D6 closed by D2, the wording being given before the Farm's Units are written) |
