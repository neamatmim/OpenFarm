# Body Condition is read from the Steps that ask it

Date: 2026-10-14

The standard Weigh-in has asked an animal's Body Condition, one to five, since the fattening Playbook (2026-09-24), and
the farm adopted that Weigh-in the same day. Nothing read the score back: it sat in each Step's answer and was never
shown again. Dry-off and Calving did not ask it, though they are where a dairy cow's flesh matters most. The flow survey
of 2026-10-13 (G6) asked for it to be shown and asked at both.

## Decision

- **Read from the Step's answer, not kept in a record of its own.** No table, no migration. A Step's answer is already
  the farm's record of what was seen, put right in place by a Correction; reading it there means a score judged on the
  first weigh-in after adoption is shown today, and a Correction needs nothing of its own.
- **Known by its values.** A slot asks Body Condition when it offers a choice of exactly the five scores "1" to "5" —
  the record's words, as `stays_a_heifer` or the heat's are; the labels above them are the farm's to reword. A Version
  carries no mark saying which slot it is, so this is what lets the scores already given under the farm's Weigh-in be
  read. The cost: a farm that writes some other one-to-five choice of its own would have it read as Body Condition. The
  Playbook writes no other, and an Owner's own choices take their Bangla words as values, so "১" is never "1".
- **Asked at Dry-off and at Calving** in the standard Playbook, last, after what the Step asks: the Calving's shape fixes
  its first eight answers and checks only those, so the score sits after the calves. Optional, as at the Weigh-in.
- **Adopted before, added by the Owner.** A procedure adopted before keeps its Version (ADR 0001). The Playbook editor
  offers «শরীরের অবস্থা জানতে চান» — the Playbook's own slot — on any Step walked animal by animal that does not ask it,
  a Calving's included, though its other answers are fixed; and that slot alone may be taken out of one again.
- **Shown, never told.** Her page says her latest with its day and which way she has moved since the one before, and
  her last six with the procedure that asked each; the Fattening board says each animal's latest under her weight. No
  notice and no Needs Review for a cow too thin at calving: whole scores cannot say "a little over" the usual target of
  three to three and a half, and a notice kind is a migration and eight places to teach — left until the Vet says what
  the farm should be told.

## Consequences

- Each read takes the farm's Versions that offer a choice worth "5" (a jsonb path in the database), then the animals'
  done Steps under those Versions only: a milking's daily Steps are never read for it.
- A score the Owner's own procedure asks under some other values — "১ — খুব রোগা" typed in the editor — is not read.
  The editor's own button writes the Playbook's values, so it is the way to ask it.
