# Going live — finishing Release 1

Release 1's code is complete. What is left is putting the real farm on it. This is the checklist, in order, with who does each step. It ends at Release 1's definition of done (spec, "Further Notes").

Decided with the Owner, 2026-09-28:

- **Production starts fresh.** The local `OpenFarm` database ("XYZ", two bulls) is a practice copy and is not moved.
- **Hosting** is the Owner's own Linux server in Singapore under systemd (`deploy/openfarm.service`), not yet provisioned.
- **The Vet is asked now** for withdrawal days, on [the sheet](./vet-withdrawal-sheet.html).

**Farm settings → Going live** (খামারের সেটিংস → চালু করা) reads most of these boxes from the farm's own records — medicines with the Vet's days, workers with pens and a PIN, phones set up, procedures published, training, photographs, the last good backup — and keeps the Owner's word on the two no record holds: the opening count and the day the paper was put away. Tick a box here when that page says it is done.

## 1. Now, side by side

- [ ] **Vet: withdrawal days and the calf's doses.** Print both sheets (open each in a browser, then Print) and hand them to the Vet:
  - `vet-withdrawal-sheet.html` lists the 15 medicines a new farm starts with. It also asks for the **Default Withdrawal Days**, for a pharmacy dose of a medicine not on the list.
  - [`vet-calf-sheet.html`](../openfarm-calf-care/vet-calf-sheet.html) asks for the newborn calf's first day, the calf wormer and when to give it, and the calf vaccines' ages.

  When they come back, the Vet types the days in on **Medicines** (ওষুধ), signed in as themselves, because the days are theirs to answer for. Until then no dose procedure can be adopted. — _Owner, Vet_

- [ ] **Tags.** Buy blank ear tags and a tag marker, not pre-numbered stock ([opening register runbook](../../docs/runbooks/opening-register.md), "Before the walk"). — _Manager_
- [ ] **Server accounts.** Provision the server, the database with point-in-time recovery, the off-site copy on a different provider, and the domain. Put every value from `.env.example` into the password manager. — _Owner_

## 2. The server ([deploy runbook](../../docs/runbooks/deploy.md))

- [ ] Every box in "Before the first deploy" is ticked: production mode, point-in-time recovery window written down, Singapore region, off-site on a different provider, TLS with HTTP redirected.
- [ ] `OPENFARM_OWNER_EMAIL` in `/etc/openfarm/app.env` is the Owner's own address. Until the farm is set up only that address can open an account; left out, nobody can. — _Owner_
- [ ] The app is installed as `openfarm.service` and starts, and the Owner signs up with that address and sets the farm up.
- [ ] The nightly and monthly backup timers are installed and listed.
- [ ] The first backup is run by hand, and **Farm settings → Backups** (খামারের সেটিংস → খামারের কপি) shows it.
- [ ] **The first restore drill** is done ([restore runbook](../../docs/runbooks/restore-drill.md)) and written down on **Farm settings → Backups** (খামারের কপি): the day, who did it, and whether it went well. The page then says when the next is due, a quarter on. This is also Release 1's "one quarterly restore drill passed". — _Owner_

## 3. The farm, set up on the server

- [ ] **Farm Identity**: the farm's real name, address and phone, which print on every paper. — _Owner_
- [ ] **DLS registration**: number, office, issue and expiry dates, and a photo of the certificate. — _Owner_
- [ ] **Other licenses** (**Farm settings** → **Other licenses**, খামারের সেটিংস → অন্যান্য লাইসেন্স): the trade license, and the fire or environment one if the farm holds it — number, issuer, dates and a photo of each. They show on the Inspector View beside the Registration. The app raises their renewal, and the Registration's, only from a renewal procedure the Owner writes in the Playbook; the farm page says while none does. — _Owner_
- [ ] **People** (**Farm settings → People and access**, খামারের সেটিংস → মানুষ ও অ্যাক্সেস): accounts for the Manager, each Barn Staff member and the Vet. The Shed Phones are enrolled and each worker has their PIN (ADR 0003). The Vet's **BVC registration** number (বিভিসি নিবন্ধন) is written down — by the Vet in their own settings, or on their page — so it prints beside their name on the treatment register and the papers they sign. — _Owner, Manager, Vet_
- [ ] **Sheds and pens** under the names the staff already use, because the register names each animal's pen. — _Manager_
- [ ] **Breeds, feed items and rations**: the farm's own added to the standard ones. A concentrate the farm mixes itself, or silage it packs, is a feed item of its own, and each mix or pit is written down on **Feed → Made on the farm** (খামারে বানানো), so it is priced from what went into it. — _Manager_
- [ ] **Milk buyers**: for each buyer, how they pay — at the gate, later at a set price, or by their own statement priced on fat and SNF (a collection center such as Milk Vita or PRAN). The last kind's milk goes with its price to follow, and each statement is entered on **Milk → Buyer statements** (ক্রেতার বিল) when it comes, so the farm's liters stand beside theirs. — _Manager, Owner_
- [ ] **Farm Parameters** read through once on **Farm settings → Rules and alerts** (নিয়ম ও সতর্কবার্তা): the approval threshold, quiet hours, AI window, the day the month's costs are looked for, keep-or-sell and culling days. — _Owner, Manager_
- [ ] **Money**: tick Shed rent and Utilities (and anything else paid monthly) as paid every month. — _Owner_
- [ ] **Financial year**: ask the accountant whether the farm's books close on 30 June, and check **Farm settings → Financial year** shows the same years. If the books move with the government's April–March change (2027–28 a nine-month year), record the change there once the accountant says so (ADR 0017). — _Owner_

## 4. The tagging walk (ticket 07, [runbook](../../docs/runbooks/opening-register.md))

- [ ] Every animal is tagged `D-0001…` / `F-0001…`, and her old mark is written down as an alias.
- [ ] The opening register is filled in (`opening-register-template.csv`) and imported on **Sheds and pens → Opening register** (শেড ও পেন → প্রারম্ভিক তালিকা). Any refused rows are fixed and imported again.
- [ ] Each animal is photographed from her page.
- [ ] **The app's head count matches a count taken in the sheds on the same day**, and the Owner writes the count down on **Farm settings → Going live → The opening count**, which says whether it agrees with the register. Close ticket 07 with the count. — _Manager, Owner_

## 5. The Playbook

The app offers 47 standard procedures under **Playbook → Standard procedures** (প্লেবুক → প্রচলিত কার্যপ্রণালী). Each is read and published on its own. Publish what the farm does now; one the farm does not do is simply left. — _Owner_

- [ ] **Every day, both sides:** morning and evening milking, feeding, the health and heat round, seeing to an unwell animal (and its urgent kind), treatment doses (raised by the Vet's prescriptions), carcass disposal, reporting to the Upazila office, and the evening head count.
- [ ] **Counts:** the weekly store count, the monthly medicine count, the weekly cash count, the biosecurity check and shed disinfection.
- [ ] **Breeding and calving (dairy):** AI, the pregnancy check, dry-off, calving preparation (it asks which pen is the calving pen), the calving record, newborn calf care, the calf's second colostrum, the cow after calving, weaning (it asks which pen weaned bull calves go to), and the heifer weigh-in.
- [ ] **Fattening:** the fortnightly weigh-in, the arrival check, quarantine release and the pre-sale check.
- [ ] **Once the Vet's days are in** (each asks which product on **Medicines** it gives):
  - the herd's FMD, lumpy skin and deworming campaigns
  - the calf's deworming, FMD and booster, anthrax, HS and BQ
  - a new bull's deworming, FMD and lumpy skin
  - HS, BQ and anthrax vaccinations, tick and fly spray, the FMD booster and the second deworming
- [ ] Each worker is trained on each procedure they do, and the training is recorded on the procedure's card (**Playbook** → the procedure's name → **Who has been trained**, several people at once) and read back on their page (**Farm settings → People and access** → the person → **Training**). — _Manager_

## 6. Running on it

- [ ] **30 days in a row with no paper register.** The Owner writes the first day on **Farm settings → Going live → Without paper**, which counts the days from it. Anything the staff go back to paper for is written down: it is Release 2's list. — _Manager_
- [ ] **Every procedure published is running**: each has raised and finished work in those 30 days. — _Manager_

## 7. Declared

- [ ] **At the next DLS renewal, OpenFarm is declared as the farm's record-keeping method**, with the registers printed from **Inspector view** (পরিদর্শনের পাতা). — _Owner_

Release 1 is done when steps 2 to 7 are ticked. Then Release 2 is planned from what the 30 days showed.
