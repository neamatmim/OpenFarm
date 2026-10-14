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
- **Known by a mark, and before the mark by the Playbook's own words.** The Playbook's slot carries `means:
"body_condition"` — a meaning, as a skip reason carries one — and publishing refuses a slot so marked that does not
  offer exactly the five scores "1" to "5". The question above it is the farm's to reword; the mark stays. A slot
  written before the mark existed — the farm's adopted Weigh-in — is read as Body Condition only where it is the
  Playbook's slot as it was: the five scores, each worded as the Playbook words it ("১ — খুব রোগা" …). Values alone are
  not enough: the Playbook editor takes a typed word as its value, so an Owner's own lameness score typed
  "1, 2, 3, 4, 5" has the same values and its own words, and is not read as Body Condition.
- **The scale's words are the app's.** The five words — «১ — খুব রোগা» to «৫ — খুব মোটা», "1 — very thin" to
  "5 — fat" — are said once, in the domain, and are both what the phone offers and what every screen says; the
  editor offers no way to reword a slot's choices after the first answer, so they are not the farm's to change.
- **Judged when it happened.** A Step that says when the thing happened — a Calving's "when she calved" — dates the
  judgment; otherwise it is dated when the Step was written. A Calving is often written up hours after.
- **Asked at Dry-off and at Calving** in the standard Playbook, last, after what the Step asks: the Calving's shape fixes
  its first eight answers and checks only those, so the score sits after the calves. Optional, as at the Weigh-in.
- **Adopted before, added by the Owner.** A procedure adopted before keeps its Version (ADR 0001). The Playbook editor
  offers «শরীরের অবস্থা জানতে চান» — the Playbook's own marked slot — on any Step walked animal by animal that does not
  ask it, a Calving's included, though its other answers are fixed; and that slot alone may be taken out of one again.
- **Shown, never told.** Her page says her latest with its day and which way she has moved since the one before, and
  her last six with the procedure that asked each. The latest is said beside each animal on the Fattening board, the
  herd list, Fertility's cows since calving and cows dried off outside the aim, and the cull list. No notice and no
  Needs Review for a cow too thin at calving: whole scores cannot say "a little over" the usual target of three to three
  and a half, and a notice kind is a migration and eight places to teach — left until the Vet says what the farm should
  be told.

## Consequences

- Each read takes the farm's Versions that offer a choice worth "5" (a jsonb path in the database) and the Steps of
  them that ask it, then each animal's latest done Steps under those Steps only, whose answer holds a score — at most as
  many as the screen shows, picked by the database per animal by when they were written, the id breaking a tie. A
  milking's daily Steps are never read for it.
- A score the Owner's own procedure asks under some other scale is not read. The editor's own button writes the
  Playbook's marked slot, so it is the way to ask it.
