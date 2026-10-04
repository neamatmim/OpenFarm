# Go-live rehearsal, 2026-10-04

The Owner said "Next" with every survey closed. I went through the checklist's steps 2–5 on a fresh empty database
(`openfarm_rehearsal`), as the Owner and the Manager would on the first day, and noted every snag.

- The server itself was not rehearsed: provisioning is the Owner's.
- Rehearsal accounts: `owner@rehearsal.test` and `karim@rehearsal.test`, with the seed's test password.
- Did not work: the opening sign-up gate, the farm's name, the standard lists, identity and DLS registration, a Barn
  Staff invite and join, pens and a PIN, two shed phones (claim, roster, PIN Switch, his work), sheds and pens, the
  opening register import, and publishing a standard procedure.
- Not rehearsed: the certificate photo, animal photos, the Vet's withdrawal days, training records, the head count
  against the sheds, Farm Parameters, and the money categories.

## Findings

### Blocks or costs real time on the day

1. **A Barn Staff member needs an email address and a sign-up before they can be given a PIN.**
   - ADR 0003 says Barn Staff cannot be assumed to own a phone, and work by PIN on the Shed Phone. But an account is
     opened only by an email invite: the person signs up with that email and a password, then enters the code.
   - For a worker with no email, the Owner or Manager has to make an address up and sign up on their behalf. That is
     six screens each, signing their own session out and back in, with a password nobody will use again.
   - With eight workers, that is an evening of it, and eight made-up addresses in the farm's records.
2. **The Vet's sheet is missing a medicine.**
   - The app starts a farm with 15 medicines. `vet-withdrawal-sheet.html` lists 14: pyrantel (calf roundworm) came with
     calf care.
   - Pyrantel is on the calf-care sheet (`../openfarm-calf-care/vet-calf-sheet.html`), but the checklist does not send
     that sheet to the Vet. Without it, the calf deworming procedure cannot be adopted.
3. **The checklist is out of date for the Playbook.** It says "all 26 procedures" and lists the old ones. The app now
   offers 47 standard procedures, including:
   - calf care, weaning and the calf doses
   - head, cash and medicine counts
   - the heifer weigh-in
   - the fattening chain's boosters

### Wrong or confusing on the day

4. **The opening register's refusals are in English.**
   - "A Pregnant Heifer needs the day she is expected to calve"; "D-0007 is already another animal's number".
   - One is the raw validator text: "birthDate: Invalid input: expected date, received Date", for a date written
     `15/03/2025`, the way a Bangladeshi Manager writes one.
   - The Manager reads Bangla and is not told that the date should be `YYYY-MM-DD`.
5. **A milking cow without `calved_at` is accepted silently.** The runbook says that column is for milking cows and that
   without it the app cannot say how long she has been in milk. The import adds her and says nothing.
6. **The import's paste hint lists fewer columns than the template.** It has no `birth_date`, `calved_at` or
   `official_tag`.
7. **The farm's name cannot be put right.**
   - It is typed once at setup and shown greyed out on Farm settings ("not changed from here"), and nothing else
     changes it either.
   - It prints on every paper that leaves the farm.
8. **On day one, the Owner's overview shows a red "your decision needed: the store was never counted"** before the farm
   has any feed.
9. **Nothing in the app walks a new Owner through setting up.**
   - The overview opens on empty figures.
   - Identity, DLS registration, people, sheds and pens, the register and the Playbook are found by knowing where they
     are. Farm settings is below the sidebar's fold.

### Small

10. The first-account form's refusal is titled "সাইন ইন করা যায়নি" ("couldn't sign in") on a sign-up, and the same
    message shows twice, on the form and in a toast.
11. An invited person's sign-up asks their name again, though the invite already has it.
12. A person's page does not say whether they have a PIN: the button reads "give PIN" before and after.

## Plans

- **R1. Barn Staff added by name, working by PIN alone (M).**
  - The Owner or Manager adds a Barn Staff member with a name and pens. That gives a Membership with no login and no
    email, and a PIN on the same page.
  - They can only work on a Shed Phone, as ADR 0003 intends. One who later gets a phone can be given a login then.
  - It needs a decision on how better-auth holds a user with no email: a placeholder address the person never sees,
    with no password, so it cannot sign in.
- **R2. The checklist and the Vet's sheet brought up to date (S).**
  - Add pyrantel to the sheet, or send the calf sheet with it.
  - List the 47 procedures in the checklist, grouped as the Playbook shows them, with which ones wait on the Vet.
- **R3. The opening register says what is wrong in Bangla (S).**
  - Every refusal is worded, with a date that cannot be read saying "write it as YYYY-MM-DD".
  - The rows added with something missing are listed as warnings: a milking cow without her calving date.
  - The paste hint gets the template's columns.
- **R4. The Owner may put the farm's name right (S).** Audited, from Farm settings.
- **R5. A setup card on the overview until the farm is set up (S–M).**
  - It names what is not done yet, each linked: identity, DLS registration, people, sheds, the register, the Playbook.
  - The "store never counted" decision waits until the store has had feed in.
- **R6. The small ones (S):** the refusal title, the double notice, the name asked twice, and whether a PIN is set.

## Recommended order

1. **R2 now.** The Vet's sheet goes out first in the checklist, and it is missing a medicine.
2. **R1.** It is the evening the Manager would otherwise spend.
3. **R3, then R4.** They are what the tagging walk and the papers meet.
4. **R5 and R6** after.

One question before R1: **do any Barn Staff have their own email or smartphone?** If all of them do, R1 can wait.

## Progress

The Owner said "Go with recommendation" on 2026-10-04 and did not answer the R1 question, so R1 was built on ADR 0003's
premise that Barn Staff have no email or phone of their own. All six were merged the same day:

- **R2** dfbba32f: pyrantel is on the Vet's sheet. The checklist hands the Vet both sheets and lists the 47 procedures
  by group, with the 18 that wait on the Vet.
- **R1** 4c856e40: "works only on the shed phones, with a PIN — no email" on the invite sheet (`people.addForShedPhones`).
  - The person is made with a `shed-phone.openfarm.invalid` address and no password.
  - The Owner's word adds them at once; a Manager's addition waits for the Owner, and is taken up on approval.
  - They get no password code and no sign-ins tab, and sign-up under their address is refused.
- **R3** 9a995e92: register refusals carry a key, the column and the value written, worded in Bangla. A milking cow
  without `calved_at` is a warning, and the hint lists every column.
- **R4** d4dbda6b: the Owner renames the farm (`farm.rename`), audited with what it said before.
- **R5** 9b213e71: the overview's "setting the farm up" card, with seven steps that each go once done. The store is late
  for a count only once feed has come in.
- **R6** (this round's last merge):
  - The sign-up refusal is titled for a sign-up, and said once.
  - A person's page says whether they have a PIN.
  - Left on purpose: an invited person is asked their name again at sign-up, because the form cannot know who they are
    before the code.

Rehearsal databases kept locally: `openfarm_rehearsal` and `openfarm_dayone`.
