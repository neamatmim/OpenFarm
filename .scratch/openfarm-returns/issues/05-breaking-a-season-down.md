# 05 — Breaking a Season down

**What to build:** A finished Season opens into its Return on Cost by haat, trader, breed and buying weight, and into each animal's cost, what came back and share. Shares only, never a rate a year.

**Blocked by:** 01

**Status:** done

**Spec:** user story 23. See "Reading it" (`returns.breakdown`).

- [x] **`returns.breakdown({ seasonKey, by })`**, Owner-only, `by` one of `haat` (her Buying Trip's `went_to`, «খামারের গেট» with none), `trader` (the Intake's Counterparty), `breed`, `band` (the Weight Band her Intake weight fell in), `animal`.
- [x] **Each line is the same sum** as the Season's, narrowed to its animals: a test asserts the lines' costs and results add up to the Season's.
- [x] **A dead animal** sits in her haat's, trader's, breed's and band's line.
- [x] **No `perYear`** on any line; a test asserts it is absent.
- [x] **Web:** the finished row's breakdown buttons and table, as in the prototype.
- [x] **Somebody opens it:** each breakdown on the seed's finished Season, in both languages.

## Notes from the build

- **Bands** are every Weight Band the Farm's Rations have been written for, retired ones too, so putting a Ration away
  does not move a finished Season's buying weights; a weight that fits several falls in the narrowest (the highest
  From, then the lowest To).
- **Joined animals** (ticket 04): in the haat and trader breakdowns an animal crossed from Dairy or bought from a
  Venture has a line saying so, not «খামারের গেট»; her band is read from the weight she joined at. An animal sold to a
  Venture and bought back into the same Season is two lines under "each animal", told apart by how and when she came.
- **Refusals:** a Season still going is `season_not_finished`; an unknown key `no_such_season` (NOT_FOUND).
- **Rounding:** each line is rounded to the taka as the Season is, so on real shares their sum can sit a taka off.
- **Web** asks for a breakdown only once a way is picked; lines show cost → back as well as head and share.
