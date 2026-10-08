# American English, everywhere

The Owner, 2026-10-08: "we should use american english like organization rather organisation", then "Yes,
everywhere" and, asked about names the database keeps, "Rename those too".

## How

1. **Code, words and docs** — one scripted pass of exact, case-sensitive rules (`rules.py`), protecting look-alikes:
   `aria-labelledby`, `optimistic`, `realistic`, `characteristics`, `cancellation`, `enrolled`/`enrolling`,
   `analyses`, `fulfilled`, `minimist`, `Borealis`, `greyhound`, the breed "North Bengal Grey" (`northBengalGrey`),
   law titles ("Labour Act/Rules/Court"), `herdCacheQuery`, `cancelLabel`. Never: applied migrations and their
   snapshots, `.agents/` (vendored), `.scratch/` (history), lockfiles.
2. **What the database keeps** — one migration: columns `litres`→`liters` (and `bulk_`, `sum_bulk_`, `difference_`,
   `price_per_litre_money`), `enrolment_code/expires_at`→`enrollment_…`, `cancelled_reason`→`canceled_reason`; values
   `cancelled`→`canceled` (venture state, sale's state before, plan made while), `venture_cancelled`→`venture_canceled`
   (request closed because), `cheque`→`check` (Pay-in Note way and its change), `litre`→`liter` (feed unit); notice
   params (`litres`, `way`); standard list names (Haemorrhagic Septicaemia); constraints and indexes named after them.
3. **What is kept as written stays, and is still read** — the audit trail's old keys and values, SOP Versions' option
   words ("diarrhoea"), paper Versions, papers already signed. Aliases where the code reads them.
4. **What is in flight** — a phone's unsent entries with old field names are accepted; the browser's kept answers are
   dropped (cache buster) so no screen reads a renamed field off an old copy.
