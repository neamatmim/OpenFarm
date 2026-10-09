# The Playbook and the farm's settings — survey 2026-10-07

Against main at 87b49dfe. Three reviewers, three reports:

- the Playbook's lifecycle — publishing, Versions, retiring, proposals, training (`playbook.md`, P1–P13);
- the farm's settings and lists — Parameters, lists, identity, the Venture terms they feed (`settings.md`, S1–S20);
- the screens for writing the Playbook and the settings (`screens.md`, W1–W19).

52 findings: 9 high, 15 medium, 28 low.

## Status

| Group | Status      |
| ----- | ----------- |
| A | Done on fix/publish-mid-day: a slot a new Version or a retiring called off is taken back up under the Version raising it now (`called_off_by`, migration), so a word put right at ten keeps the afternoon's milking and a procedure retired and restored keeps its day; whole-farm work is called off by a new Version and moved, not doubled; each trigger is dated from the first of the unbroken Versions carrying it, so a happening held on a phone across a new Version still raises its work; duplicate Step ids and choice values refused; one publish at a time per procedure. P9 kept as built |
| B | Done on fix/owed-stays-owed: retiring the treatment or report procedure no longer calls off a course's doses or a report still owed — they finish on the Version they were raised under, and its refusal to write a second says so; the report and renewal procedures are not raised by hand (`its_record_raises_it`), as a course's dose was not, and whole-farm work raised by hand is in no Pen |
| C | Done on fix/venture-terms-held: a later Investor's paper and offer print the Venture's own wind-up days, frozen at the first signing (`windUpDaysOf`); every Agreement is held to the split the Venture's first was signed on (`theVenturesSplit`, refusal `split_not_the_ventures`), the portal offers it on that split and the sign sheet starts there; an Agreement keeps the farm as it was signed (`farm_as_signed`, migration) and a copy is headed with it. Left: a paper laid out before the farm's wind-up figure changed and signed after (S1's reverse case) |
| D | Done on fix/proposals: approving a proposal drafted against an older Version is refused (`proposal_out_of_date`) and its row says which Version it was drafted on instead of offering Approve; the Owner's edit and the Manager's proposal carry the Version they began from and are refused once a newer one is in force (`changed_since_you_began`); turning one down asks why, proposing asks why, and the proposer is told the answer with the Owner's reason (`proposal_answered`, migration); the proposal sheet lists what it changes in the Version in force. Left: a list of recent decisions in the Proposals tab |
| E | Done on fix/playbook-editor, in six commits: once-only effects take a tick and are not walked; no times and no days drops the schedule; a new effect asks only its own answers; grace checked as the farm does (domain rule); new choice values cut to 40; Bangla digits and empty-means-none in range, grace and days-after; reworded Bangla drops its English; dose/service skip reasons shown; fresh Step ids (W1–3, W7, W9, W10, W13, W19). Meanings tagged, never carried by place, a lost one given back (W4). Draft kept per person on the device, offered back, leaving asks (W5). Every blocker worded by box with a source-reading guard (W6). Every answer listed, note/photo added unrequired (W12). Duplicate names refused in either language, standard card hides by the same rule (`nameAsCompared` moved to domain) (P10); training says who needs teaching the Version in force (P12). Left: a phone preview of a Step (W12), remembering which standard a procedure was adopted from (P10), English boxes beside each Bangla one (W10 says cleared, not re-asked) |
| F | Done on fix/settings-and-lists, in three commits. Settings: escalation the Owner's, untold escalated work told whatever its moment (S3); a Ration with a retired feed on no Pen, a feed with stock retired only once counted to nothing (S4, S5); Manager identity/certificate changes told (S6); waiting checks move with the days (S7); re-timing from the farm as it stands (S8); registration dates the right way round (S9). Lists: diseases skipped by any name (S11), breed names compared properly (S12), accounts retire by the list rule (S13), empty Pens retire (`pen_retired`, S14), Category/Account/disease renames (S15), Year Change withdrawal behind the lock (S16), locale kept at first start and a changed one refused unless `OPENFARM_LOCALE_CHANGED=yes` (`server_locale`, S17). Typing: Bangla digits in times and figures, ranges said and checked, one save for name and contact (S18–S20, W8, W14, W15). Left: Sheds themselves are not retired (only Pens, as decided); the deploy runbook should mention OPENFARM_LOCALE_CHANGED (the runbooks are the Owner's own uncommitted work) |
| G | Done on fix/card-and-standards: a procedure keeps the standard it was adopted from (`standard_key`, migration, one in force per standard), so the card stops offering it however it is renamed and a second adoption or a clashing restore is refused (`sop_standard_adopted`); restore also keeps the name rule (W16). Editor: Step headings carry their words, move/remove labels name the Step and the trigger, greyed controls say why, a written Step asks before it is removed (W17). The wall card lists what may be chosen, a number's range, and the medicine a campaign gives (W18). Left: procedures adopted before the key was kept are still known by name |

## Groups

| Group | Branch                 | Findings                                | What it is                                                                                                                                                                                                                                               |
| ----- | ---------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A     | fix/publish-mid-day    | P1, P3, P6, P9, P4, P8, P11             | A Version published or a procedure retired and restored during the day: the rest of the day's work is raised under the Version in force, never lost and never doubled; held happenings still raise; publish refuses duplicate Step ids and races cleanly |
| B     | fix/owed-stays-owed    | P2, P7                                  | Retiring the treatment or report procedure never calls off doses or reports already owed; the report procedure is not raised by hand                                                                                                                     |
| C     | fix/venture-terms-held | S1, S2, S10                             | Once anyone signs for a Venture, its papers and offers print its own wind-up days and split, every later Agreement is held to that split, and an Agreement copy shows the farm as it was on the stamped day                                              |
| D     | fix/proposals          | P5, P13, W11                            | A proposal against an older Version is refused with what changed, a stale cached edit likewise; the Owner says why a proposal is turned down, the Manager says why they propose, and is told the answer                                                  |
| E     | fix/playbook-editor    | W1–W7, W9, W10, W12, W13, W19, P10, P12 | The editor builds only what publishing takes and says what is wrong where; meanings of choices and skip reasons kept and shown; drafts survive; no-time procedures; stale English cleared; preview; duplicate names refused; who needs teaching shown    |
| F     | fix/settings-and-lists | S3–S9, S11–S20, W8, W14, W15            | Escalation and the Owner hearing of late work; retired feeds stay retired; identity changes told; waiting checks move; lists retire and rename cleanly; Bangla digits and decimals in times and figures; one save for the farm's details                 |
| G     | fix/card-and-standards | W16, W17, W18                           | The standard procedures recognised by what they are, not their Bangla name; editor accessibility; the wall card says what may be chosen                                                                                                                  |

Order: A and B first (work silently lost, doses and reports owed to the livestock office), then C (Investor papers), D, E, F, G.

## Decisions

Asked 2026-10-07; the Owner chose the recommended answer to each:

- **A change published during the day (P1, P3, P6):** the rest of today's work follows the new Version; no slot is left with no work, none raised twice.
- **Doses and reports owed when their procedure is retired or replaced (P2):** they stay owed and finish on the Version they were raised under. Only the Vet stops a course.
- **The escalation time (S3):** the Owner's alone, as the other checks on the Manager are. Quiet hours stay with the Manager, told to the Owner.
- **A feed with stock in the store (S4, S5):** retired only once a count brings it to nothing; the Manager may still retire an empty feed.

Defaults taken without asking, as the reports recommend:

- A Venture's papers and offers, once anyone has signed, print its own wind-up days and split; every later Agreement is held to the first's split (an Amendment moves them all). An Agreement copy shows the farm as it was on the stamped day.
- A proposal, or a cached edit, against an older Version is refused with what changed since; the Owner writes why a proposal is turned down, and the Manager is told the answer.
- A happening recorded before a new Version and arriving after it raises work wherever the trigger was in force under both.
- A first Version published mid-morning still raises that morning's already-late work, as built and tested (`sign-off.test.ts`, and six more relying on it); only the comment was put right. Changed from the report's recommendation once that was found.
- Two live procedures with the same name are refused (the farm's name-clash rule).
- The card shows who was taught an earlier Version; nothing is blocked on it.
- The editor marks the choices and skip reasons the farm acts on, keeps their meaning when the words change, asks before a different word takes a meaning by its place; a half-written procedure is kept on the device and leaving asks first.
- English on a Step is cleared when its Bangla changes, and says it needs writing again.
- Times and figures typed in Bangla digits are taken.
- A Manager's change to the farm's identity or certificate is told to the Owner; a waiting pregnancy check moves when its days change; torn-down Pens are retirable while empty.
