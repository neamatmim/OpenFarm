# 05 — Breaking a Season down

**What to build:** A finished Season opens into its Return on Cost by haat, trader, breed and buying weight, and into each animal's cost, what came back and share. Shares only, never a rate a year.

**Blocked by:** 01

**Status:** ready

**Spec:** user story 23. See "Reading it" (`returns.breakdown`).

- [ ] **`returns.breakdown({ seasonKey, by })`**, Owner-only, `by` one of `haat` (her Buying Trip's `went_to`, «খামারের গেট» with none), `trader` (the Intake's Counterparty), `breed`, `band` (the Weight Band her Intake weight fell in), `animal`.
- [ ] **Each line is the same sum** as the Season's, narrowed to its animals: a test asserts the lines' costs and results add up to the Season's.
- [ ] **A dead animal** sits in her haat's, trader's, breed's and band's line.
- [ ] **No `perYear`** on any line; a test asserts it is absent.
- [ ] **Web:** the finished row's breakdown buttons and table, as in the prototype.
- [ ] **Somebody opens it:** each breakdown on the seed's finished Season, in both languages.
