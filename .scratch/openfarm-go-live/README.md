# Going live — finishing Release 1

Release 1's code is complete. What is left is putting the real farm on it. This is the checklist, in order, with who does each step. It ends at Release 1's definition of done (spec, "Further Notes").

Decided with the Owner, 2026-09-28:

- **Production starts fresh.** The local `OpenFarm` database ("XYZ", two bulls) is a practice copy and is not moved.
- **Hosting** is the Owner's own Linux server in Singapore under systemd (`deploy/openfarm.service`), not yet provisioned.
- **The Vet is asked now** for withdrawal days, on [the sheet](./vet-withdrawal-sheet.html).

## 1. Now, side by side

- [ ] **Vet: withdrawal days and the calf's doses.** Print both sheets (open each in a browser, then Print) and hand them to the Vet:
  - `vet-withdrawal-sheet.html` lists the 15 medicines a new farm starts with. It also asks for the **Default Withdrawal Days**, for a pharmacy dose of a medicine not on the list.
  - [`vet-calf-sheet.html`](../openfarm-calf-care/vet-calf-sheet.html) asks for the newborn calf's first day, the calf wormer and when to give it, and the calf vaccines' ages.

  When they come back, the Vet types the days in on **Drugs**, signed in as themselves, because the days are theirs to answer for. Until then no dose procedure can be adopted. — _Owner, Vet_
- [ ] **Tags.** Buy blank ear tags and a tag marker, not pre-numbered stock ([opening register runbook](../../docs/runbooks/opening-register.md), "Before the walk"). — _Manager_
- [ ] **Server accounts.** Provision the server, the database with point-in-time recovery, the off-site copy on a different provider, and the domain. Put every value from `.env.example` into the password manager. — _Owner_

## 2. The server ([deploy runbook](../../docs/runbooks/deploy.md))

- [ ] Every box in "Before the first deploy" is ticked: production mode, point-in-time recovery window written down, Singapore region, off-site on a different provider, TLS with HTTP redirected.
- [ ] `OPENFARM_OWNER_EMAIL` in `/etc/openfarm/app.env` is the Owner's own address. Until the farm is set up only that address can open an account; left out, nobody can. — _Owner_
- [ ] The app is installed as `openfarm.service` and starts, and the Owner signs up with that address and sets the farm up.
- [ ] The nightly and monthly backup timers are installed and listed.
- [ ] The first backup is run by hand, and **Admin → Backups** shows it.
- [ ] **The first restore drill** is done and written down ([restore runbook](../../docs/runbooks/restore-drill.md)). This is also Release 1's "one quarterly restore drill passed". — _Owner_

## 3. The farm, set up on the server

- [ ] **Farm Identity**: the farm's real name, address and phone, which print on every paper. — _Owner_
- [ ] **DLS registration**: number, office, issue and expiry dates, and a photo of the certificate. — _Owner_
- [ ] **People**: accounts for the Manager, each Barn Staff member and the Vet. The Shed Phones are enrolled and each worker has their PIN (ADR 0003). — _Owner, Manager_
- [ ] **Sheds and pens** under the names the staff already use, because the register names each animal's pen. — _Manager_
- [ ] **Breeds, feed items and rations**: the farm's own added to the standard ones. — _Manager_
- [ ] **Farm Parameters** read through once: the approval threshold, quiet hours, AI window, the day the month's costs are looked for, keep-or-sell and culling days. — _Owner, Manager_
- [ ] **Money**: tick Shed rent and Utilities (and anything else paid monthly) as paid every month. — _Owner_

## 4. The tagging walk (ticket 07, [runbook](../../docs/runbooks/opening-register.md))

- [ ] Every animal is tagged `D-0001…` / `F-0001…`, and her old mark is written down as an alias.
- [ ] The opening register is filled in (`opening-register-template.csv`) and imported on **Admin → Herd → Opening register**. Any refused rows are fixed and imported again.
- [ ] Each animal is photographed from her page.
- [ ] **The app's head count matches a count taken in the sheds on the same day**, and the Owner confirms it. Close ticket 07 with the count. — _Manager, Owner_

## 5. The Playbook

The app offers 47 standard procedures under **Playbook → Standard procedures**. Each is read and published on its own. Publish what the farm does now; one the farm does not do is simply left. — _Owner_

- [ ] **Every day, both sides:** morning and evening milking, feeding, the health and heat round, seeing to an unwell animal (and its urgent kind), treatment doses (raised by the Vet's prescriptions), carcass disposal, reporting to the Upazila office, and the evening head count.
- [ ] **Counts:** the weekly store count, the monthly medicine count, the weekly cash count, the biosecurity check and shed disinfection.
- [ ] **Breeding and calving (dairy):** AI, the pregnancy check, dry-off, calving preparation (it asks which pen is the calving pen), the calving record, newborn calf care, the calf's second colostrum, the cow after calving, weaning (it asks which pen weaned bull calves go to), and the heifer weigh-in.
- [ ] **Fattening:** the fortnightly weigh-in, the arrival check, quarantine release and the pre-sale check.
- [ ] **Once the Vet's days are in** (each asks which product on **Drugs** it gives):
  - the herd's FMD, lumpy skin and deworming campaigns
  - the calf's deworming, FMD and booster, anthrax, HS and BQ
  - a new bull's deworming, FMD and lumpy skin
  - HS, BQ and anthrax vaccinations, tick and fly spray, the FMD booster and the second deworming
- [ ] Each worker is trained on each procedure they do, and the training is recorded on their page (**Farm settings → People → Training**). — _Manager_

## 6. Running on it

- [ ] **30 days in a row with no paper register.** Write the first day here: ______. Anything the staff go back to paper for is written down: it is Release 2's list. — _Manager_
- [ ] **Every procedure published is running**: each has raised and finished work in those 30 days. — _Manager_

## 7. Declared

- [ ] **At the next DLS renewal, OpenFarm is declared as the farm's record-keeping method**, with the registers printed from **Inspector**. — _Owner_

Release 1 is done when steps 2 to 7 are ticked. Then Release 2 is planned from what the 30 days showed.
