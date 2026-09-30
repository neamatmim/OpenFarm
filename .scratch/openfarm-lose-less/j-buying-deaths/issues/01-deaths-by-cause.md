# 01 — Deaths by cause, and the rate

**What to build:** Adult deaths recorded with a cause picked from a short list (or typed); deaths by cause and a death
rate per Side over 12 months on the Owner's home; the death form linked to her Diagnosis.

**Blocked by:** —

**Status:** done, 2026-10-01.

- [x] **Glossary:** **Mortality** widened (the cause lists, the Diagnosis link, the rate).
- [x] **Rule:** domain `ADULT_DEATH_CAUSES` (nine, in Bangla, the notifiable ones among them, "কারণ জানা যায়নি" for the
      morning she is found dead — the Vet may be asked to look them over) and `adultDeaths`: grown from weaning (90
      days) or arrival, head-years kept in the year, deaths for every hundred a year, by Side, culls apart, causes of
      the dead. `deaths-store.ts` reads every animal: arrival = Intake, birth or registration; left = the death's own
      time or her exit.
- [x] **Diagnosis link:** the death form offers her Diagnoses of the last 60 days (her page's own, and those answering
      a round); `recordMortality` and the Mortality Correction refuse one not hers (`diagnosis_not_hers`); the Correction
      may link one afterwards. Her page's death now carries `diagnosisId` (clinical readers only).
- [x] **Screen:** the adult quick-picks on the death form; "বড় পশুর মৃত্যু" beside the calf losses on the Owner's farm
      page and the home page (`herd.deaths`, Owner and Manager).
- [x] **Tests:** `routers/deaths-by-cause.test.ts` (3), domain `adult-deaths.test.ts` (2). **Proved by switching off**
      the not-hers refusal, the Correction's link and culls kept apart — each red. The register's report reference was
      already tested through the api (`mortality-register.test.ts`); the gap was the form never sending the link.
- [x] **Somebody opens it** (seed, 2026-10-01): the farm page read "দুগ্ধ বছরে একশোতে ১.৭টি · মোটাতাজাকরণ ৮.১টি", one
      death each, with their causes; D-0056's death form offered the nine causes and "FMD · ৩০ সেপ্টেম্বর, ২০২৬" to link
      (closed without saving).

**Not built:** an alert level for the rate; the dairy and fattening sides are read by an animal's Side now, not where
she stood each day.
