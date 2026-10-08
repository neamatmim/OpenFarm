# How Bangladeshi institutions take a nomination without paper

**Question:** How do Bangladeshi institutions take a **nominee designation**, and a minor nominee's guardian, **without a wet signature**? What do they treat as the holder's consent? The institutions are banks under the e-KYC guidelines, CDBL and online BO accounts, National Savings Certificates (Sanchayapatra), life insurers' digital policies, and mobile financial services. (Ticket: `.scratch/openfarm-sign-in-the-app/issues/04-how-others-take-a-nomination-without-paper.md`.)

**Researched:** 8 October 2026. The note builds on [Nominees in Bangladeshi law and Shariah](nominees-in-bangladeshi-law-and-shariah.md) and does not repeat it: what a nominee is, the statutes, and the paper forms' fields are all there. Primary sources are the e-KYC guidelines as issued, read in full:

- BFIU's guideline of January 2020;
- Bangladesh Bank's March 2026 guideline for banks, finance companies and payment providers;
- BFIU's March 2026 guideline for insurers and capital-market intermediaries.

The other primary sources are bKash's own help pages, a depository participant's own online BO instructions, and the nominee forms published by a National Savings bureau. bb.org.bd and bkash.com refuse automated fetches. Both were therefore read in a browser: the Bangladesh Bank PDF's text was extracted in the page, and the bKash pages were read as rendered. News reports are marked **[SECONDARY]**. English renderings of Bengali text are mine. **This is research, not legal advice.** Whether a nomination made by a one-time code binds the heirs, or is admissible as evidence, is the question of ticket 02. This note is about **practice**.

---

## Answer for the ticket

1. **Nobody asks the nominee.** In every digital channel read, a nomination is the **holder's act alone**. The nominee's particulars are typed in by the holder or by the institution's agent, together with a photo or an ID number. The nominee signs nothing, receives nothing and is never contacted:
   - **Bank, insurer, depository e-KYC** (BFIU 2020; BB 2026; BFIU 2026). The nominee's "name, relation to the customer, and photo can be manually entered by the respective agent". The bank template adds date of birth and NID.
   - **bKash.** The holder adds up to two nominees in the app. All that is needed is "your loved one's National ID card".
   - **Online BO account** (Royal Capital's DP portal). The holder uploads the nominee's photo and ID. **Only the holder's** signature is uploaded.
   - **Bank paper today.** Prime Bank's current nominee form is also signed only by the account holders and the bank's officers.

   The nominee's own signature appears only on the old **paper** forms: CDBL Form 23, the Family Savings Certificate form and MetLife's form (see the earlier note, §5). It has not been carried into any of the digital flows found.

2. **The holder's consent is an authenticated act that is kept.** Bangladesh Bank's 2026 guideline makes the customer's signature one of four kinds: electronic (drawn on a device), digital, an image of a wet signature, or **a PIN**. A **PIN is allowed only for low-risk accounts**, and wet or electronic signatures "must be provided for high-risk accounts". The onboarding "must include two/multi-factor authentication (2FA/MFA) and/or checking the registered phone number (SIM)/email through **one-time PIN code**". The digital footprint and log must be kept, with geo-location and IP address optional. The 2020 guideline was looser: "wet signature or electronic signature or digital signature or PIN", with no risk condition. bKash's nominee flow is: sign in to the app, "Read and agree" to the nominee terms, enter the nominee, submit, and see a confirmation on screen.
3. **A minor's guardian is where every channel either stops or falls back to paper:**
   - **bKash** requires every nominee to hold an **NID**. In practice that excludes minors, so there is no guardian step at all.
   - **The e-KYC templates** let the holder **type in** a minor nominee's guardian: name, address, relation, NID and photo (BFIU 2020). The bank guideline accepts a birth certificate in place of a minor nominee's NID (BB 2026). **No guardian signature or consent** is asked in either template.
   - **National Savings** keeps it on **paper**. The buyer writes a letter to the bureau naming a প্রত্যয়নকারী এবং অভিভাবক (attester and guardian) for the minor nominee, with that person's NID number and date of birth. The guardian gives **specimen signatures**, which the buyer attests. A nominee change is also on paper: Form SC-3, "signature(s) or thumb impressions(s) of the holder(s)", attested at the issuing office.
   - **No Bangladeshi institution was found that has a guardian or receiver consent by SMS code.**
4. **The market also adds three safeguards:**
   - **Notice.** A confirmation is sent once the nomination is recorded (e-KYC "fifth step"; bKash's on-screen message).
   - **A cooling period.** bKash allows a change only "once every 30 days", and tells the holder when the next change is possible.
   - **A whole list each time.** bKash's update replaces the nominee rows and re-sets the percentages to total 100. An account with a nominee cannot be made nominee-free.

### What this suggests for an app that takes a Nomination with an SMS code

- **An SMS code to the Investor's own registered phone, inside their signed-in portal, is at or above what the regulated market accepts for low-risk products.** It is the "one-time PIN code" check on the "registered phone number (SIM)" that BB 2026 requires alongside a PIN. Two caveats:
  - The guidelines treat a PIN or OTP as a **signature substitute only for low-risk accounts**. Simplified (low-risk) e-KYC ends at life cover of Tk 20 lakh, a BO deposit of Tk 15 lakh, and a term deposit of Tk 10 lakh (2020). A Venture holding may be larger.
  - These are AML rules for regulated institutions. They do not bind the farm, and they say nothing about the nomination's effect against heirs. **Lawyer:** is the farm's Investment size "high-risk" in this sense?
- **Asking only the Investor matches the market.** The Nominee need not take part. A courtesy SMS to a Nominee would be something **no institution here does**, and it would tell a family member about the money while the Investor is alive. Leave it out unless the advisers want it.
- **Keep the same trail the bank guideline asks for:**
  - who agreed, and when;
  - the phone number the code went to, and that it was the registered one;
  - the fingerprint of the exact paper shown;
  - the IP address.

  Send a confirmation afterwards, by SMS or in the portal, saying what was recorded.

- **A minor's Receiver has no digital precedent to copy.** The digital channels take the guardian's details from the holder, with no guardian consent at all. The one institution that wants the guardian's own hand, National Savings, uses paper. Keeping a Nomination that names a minor on paper, as the map already settles, is the market's practice. A **Receiver's SMS consent would be new in Bangladesh**, and it needs the advisers' word before it is built.

---

## Summary table

| Channel                                                       | How the nominee is captured                                                             | Nominee signs?                            | Minor nominee's guardian                                                                                                   | Holder's consent                                                                                                             | Source                                                             |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Bank / finance company / PSP, e-KYC (BB, March 2026)          | Name, DOB, NID or other ID, relation, photo, entered by agent **or customer**           | No                                        | Template "may add" guardian fields. Minor nominee may use a birth certificate                                              | Electronic, digital or wet-image signature. **PIN only for low-risk.** 2FA/MFA and/or OTP to the registered phone. Logs kept | BB e-KYC Guidelines 2026, §3 steps, fn 15, §4 security, §5.1       |
| e-KYC, all financial institutions (BFIU, January 2020)        | Name, relation, photo (simplified). Adds DOB (regular)                                  | No                                        | "Add" fields: minor nominee's name, guardian's name, address, relation, **NID, photo**                                     | "Wet signature or electronic signature or digital signature or PIN"                                                          | BFIU e-KYC Guidelines 2020, steps 2–4; regular template NB (a)–(d) |
| Insurers and capital-market intermediaries (BFIU, March 2026) | Name, relation, photo, entered by insurer/CMI or agent                                  | No                                        | Template "may add" guardian fields                                                                                         | Same four kinds. PIN only for low-risk (life cover ≤ Tk 20 lakh). Phone check by PIN code optional                           | BFIU Guidelines for Insurance Companies and CMIs 2026              |
| bKash wallet                                                  | In-app: name and DOB as on NID, NID number, relation, mobile (optional), % share. Max 2 | No                                        | **None**: every nominee must hold an NID                                                                                   | In-app session, "read and agree", submit, on-screen confirmation. Once per 30 days                                           | bkash.com nominee pages                                            |
| Online BO account (DP portal)                                 | Up to 2 nominees. Nominee's photo and NID/passport uploaded                             | **No** (holder's signature only)          | "Guardian's information is needed if nominee is a minor"                                                                   | Registration by email and mobile. Holder's scanned signature uploaded                                                        | Royal Capital online BO page. New Age 2021 **[SECONDARY]**         |
| National Savings Certificates                                 | Paper purchase form. Change by letter plus Form SC-3                                    | Not on the change letter or SC-3          | **Paper letter**: buyer appoints প্রত্যয়নকারী ও অভিভাবক with NID and DOB. Their specimen signatures attested by the buyer | Holder's signature or thumb impression, attested by the issuing officer                                                      | NSSB Shyamoli forms                                                |
| Bank paper form today (Prime Bank)                            | Name, DOB, relation, address, ID, %, photo                                              | **No**: applicants and bank officers only | not on this form                                                                                                           | Wet signature                                                                                                                | Prime Bank Nominee's Personal Information Form                     |
| Nagad                                                         | **Not found**                                                                           | –                                         | –                                                                                                                          | –                                                                                                                            | –                                                                  |

---

## 1. Banks: the e-KYC guidelines

### 1.1 BFIU, Guidelines on Electronic Know Your Customer (e-KYC), dated December 2019, issued with BFIU Circular 25 of 8 January 2020 ([PDF](https://www.bfiu.org.bd/pdf/circular/aml/jan082020bfiu25.pdf))

This guideline applied to banks, NBFIs, insurers and capital-market intermediaries alike (§2.3). It allowed **assisted** onboarding and **self check-in** (§2.2).

- **Simplified onboarding, fingerprint and face models.**
  - Step 2 template: "Nominee: … Relation: … Photograph: …". Fn 6: institutions "may add additional fields for additional nominee(s) and/or where additional guardian information required for the minor account".
  - Step 4: "customer wet signature (signature using pen) or customer electronic signatures (signature using devices) or digital signature or **personal identification number (PIN)** is required to be preserved for future reference". The template line reads "Client wet signature or electronic signature or digital signature or PIN".
  - Fn 8: "Where necessary, the financial institutions may collect physical signature at the later stage".
  - Step 5: a notification that the account is being opened, and a **confirmation notification** after screening.
- **Regular e-KYC template.**
  - "Nominee: … Date of Birth … Relation … Photograph".
  - NB (b): an "add" button "if there is more than one nominee".
  - NB (c): "**If applicant is minor then they should proceed for traditional methods** of account opening".
  - NB (d): "Incorporate 'add' the following field if nominee is 'Minor': i) Name of minor nominee ii) Name of Guardian iii) Address iv) Relation v) **NID of Guardian** vi) **Photograph of Guardian**".
  - Neither a nominee signature nor a guardian signature appears anywhere.
- **Security** (§3.2.5, §3.3.5): institutions "may use additional security measures … checking the phone number by generating PIN codes".
- **Thresholds for simplified e-KYC** (§2.3.1):
  - term deposit up to Tk 10,00,000;
  - BO deposit up to Tk 15,00,000;
  - life sum assured Tk 3–20 lakh, with annual premium ≤ Tk 2,50,000.

### 1.2 Bangladesh Bank, Guidelines on Electronic Know Your Customer (e-KYC), BRPD-1, March 2026 ([PDF](https://www.bb.org.bd/aboutus/regulationguideline/brpd/ekyc2026.pdf))

This replaces the 2020 guideline for scheduled banks, finance companies and payment-service providers. News reports date the covering circular BRPD-1 Circular No. 08, 11 March 2026 **[SECONDARY]**; the circular was not read.

- **Nominee, face-matching model** (p.15): "Additional inputs such as the nominee's name, relationship with the customer, and the nominee's photo shall be inserted by the bank/FC/PS provider's agent **or by the customer**". Fn 15: "**NID mandatory for adult nominee; in case of minor nominee birth certificate can be used.**"
- **Nominee, fingerprint model** (p.11): "The nominee's name, date of birth, NID or other valid ID, relation to the customer, and photo can be entered by the bank/FC/PS provider's agent." The guardian footnote from 2020 is kept.
- **Signature** (p.11, repeated on p.16):
  - "the customer's signature—either electronic (signature using devices), digital, or image of wet signature collected through verified channels shall be preserved for future reference."
  - "A digital signature or a Personal Identification Number (PIN) may be generated and used if the customer is unable to provide a wet signature. However, **the use of digital signature or PIN is only allowed for low-risk accounts whereas wet or electronic signatures must be provided for high-risk accounts.**"
- **Security measures** (p.13): "The bank/FC/PS provider may use additional security measures in the customer onboarding process which **must include two/multi-factor authentication (2FA/MFA) and/or checking the registered phone number (SIM)/email through one-time PIN code**".
- **Record keeping** (§5.1, p.20):
  - "all sorts of digital KYC data and log" are kept as the Payment and Settlement Systems Act 2024 requires;
  - the log contains "information collected during clients' identity verifications";
  - institutions "may collect other complementary data (such as geo-location, IP addresses, etc.)".
- **Regular e-KYC** (p.19): "After opening an account, the bank/FC/PS provider may collect additional information and a customer wet signature to create a full digital profile".

**What changed since 2020:** the PIN became a low-risk-only signature, an OTP to the registered phone became a named requirement, and a minor nominee may be identified by a birth certificate. The nominee is still a set of details the customer or agent types in.

### 1.3 A bank's own paper today: Prime Bank, Nominee's Personal Information Form ([PDF](https://primebank.com.bd/assets/downloads/1780575226_Nominee-Information-form-Editable.pdf))

- The declaration is the holder's: "I/We are nominating the following individual(s) … I/We preserve the right to change or cancel the nomination at any time and hereby further agree that the bank will pay money as per my/our instruction and upon payment of said money, bank will be released from all liabilities towards nominees."
- The fields are name, date of birth, relation, addresses, ID document (NID, passport, birth certificate, others), percentage and photograph.
- **Signatures: 1st and 2nd applicant, the account-opening officer, and the BM/OM. The nominee does not sign.**

No Bangladeshi bank's in-app nominee change was found (§6).

---

## 2. Mobile financial services

### 2.1 bKash ([nominee page](https://www.bkash.com/en/page/nominee_update); the same text at [Customer Service › Nominee Information Update](https://www.bkash.com/en/customer-service/category/account-management/nominee-information-update), read 8 October 2026)

- **What a nominee is, to bKash:** "a person nominated by a bKash customer who has the legal right to receive the remaining funds in the customer's bKash account after their death". This is the beneficiary wording the earlier note warns about.
- **Who may be named:** Father, Mother, Spouse, Son, Daughter, Brother, Sister, or "Others". In every case "the person you nominate **must have a National Identity Card (NID)**". "For being eligible to be your nominee, the nominee's relationship with you will be considered and verified."
- **What is needed:** "your active … account number (mobile number) and the nominee's national identification card".
- **The flow:**
  1. App menu, then "Nominee Update", then "Start Updating Nominee Information". An eligibility check runs.
  2. "**Read and agree** to the necessary instructions, rules, and conditions".
  3. Nominee 1: "name (according to the National ID card), National ID card (NID) number, nominee's date of birth (according to the National ID card), relationship … and nominee's mobile number (optional)". Up to 2 nominees.
  4. Set the % share. It defaults to 50/50, takes whole numbers from 1 to 100, and must total 100.
  5. Submit. "If the submission is successful, you will see a congratulatory message on the screen", which also says "when you can add or update information again".
- **Limits:**
  - "once every 30 days";
  - the same person cannot be named twice;
  - "After successfully adding one or two nominees to a bKash account, it is not possible to make the account nominee-free by removing all the nominees."
- **The nominee does nothing.** There is no nominee signature, consent, SMS or acceptance. The nominee's mobile number is optional.
- **Not stated:** whether the flow asks for the account PIN again or sends an OTP. The app itself is opened with the account PIN.
- **On death** ([Deceased Person's Account Settlement](https://www.bkash.com/en/customer-service/category/account-management/deceased-persons-account-settlement)):
  - the nominee applies at a customer-care center with the deceased's and nominee's photo-ID numbers, the death certificate and a photocopy of the nominee's photo ID;
  - "If no nominee was previously registered", an "inheritance certificate obtained from the court" is needed;
  - the money is sent to the nominee's bKash account within about 10 working days.
- **Student accounts** (a minor holder): the money of a deceased student's account goes through "the guardian whose bKash account was used during the student account registration", **in person** with the original NID.

### 2.2 Nagad

**No Nagad source on nominees was found.** Neither nagad.com.bd nor news reports describe a nominee feature. Whether Nagad takes nominees is unknown.

---

## 3. CDBL and online BO accounts

- **The online system.** BSEC and CDBL launched online BO account opening on 9 February 2021. The investor uploads the NID, bank details, cheque copy, photo and "a scanned copy of his/her signature". The investor then picks a broker, which "checks the documents and approves", and uploads the account to CDBL once the fee is paid ([New Age, 9 February 2021](https://www.newagebd.net/article/129728/bsec-launches-online-bo-account-opening-system) **[SECONDARY]**). cdbl.com.bd now renders by script; neither its `/bo` page nor the old details page gave any text to a fetch or the browser, so CDBL's own description was not read.
- **A DP's own online form** (Royal Capital, [Online BO Page](https://royalcapitalbd.com/online-bo-account-opening), read 8 October 2026):
  - "Filling up nominee's information is not mandatory".
  - "**Guardian's information is needed if nominee is a minor**".
  - "Nominee's information can be added maximum of two".
  - Attachments: "scan copy of nominee's recent picture, national identification number (NID), (both side) or passport or driving license", and "client's/account holder's valid signature".
  - **No nominee signature and no guardian signature are uploaded.**
  - Registration takes an email and "registered mobile number", and a confirmation SMS follows payment.
- **Against paper.** CDBL Form 23, the paper nomination form, has a signature line for each nominee and each guardian, and photographs of both (earlier note, §5.1). Third-party guides disagree on whether brokers still want the nominee's signature for online accounts. **Whether CDBL has formally dropped Form 23's nominee signature for online accounts was not confirmed.**
- **The 2026 BFIU guideline for CMIs** (§4 below) governs online BO e-KYC from 31 December 2026. It takes the nominee the same way as the bank guideline.

---

## 4. Life insurers

### 4.1 BFIU, Guidelines on e-KYC for Insurance Companies and Capital Market Intermediaries, March 2026 ([PDF](https://www.bfiu.org.bd/pdf/circular/aml/mar302026bfiu29e.pdf); implementation by 31 December 2026)

- **Scope** (§2.3): only natural persons with a valid NID. Others go through paper KYC. Simplified e-KYC covers life cover "up to BDT 2,000,000 with an annual premium not exceeding BDT 250,000", non-life premium ≤ Tk 2,50,000, and BO deposits ≤ Tk 15,00,000.
- **Nominee:**
  - fingerprint model: "The nominee's name, relation to the customer, and photo can be manually entered by the respective agent";
  - face model: "Additional input such as the nominee's name, relation to the customer, and the nominee's photo should be inserted by insurance companies/CMIs".
  - Guardian fields "may" be added for a minor account. "Photo Others" includes "nominee(s) … minor(s) or their guardian(s)".
- **Signature:** "wet signature (signature using a pen), an electronic signature (signature using devices), or a digital signature, or image of signature". "Using a digital signature or PIN will only be applicable for low-risk accounts and wet/electronic signatures must be provided for high-risk accounts."
- **Security** (§3.2.5, §3.3.5): "may … check the phone number by generating PIN codes". Unlike the bank guideline, this is optional.
- **Record keeping** (§5.1): data and logs are kept "until five years after the closure of the account or business relationship". Geo-location and IP addresses are optional.
- **Minor holder who comes of age** (§5.7): a fresh photograph and current CDD documents are taken "on their becoming a major". This is the nearest the guidelines come to a "maturity date".

### 4.2 Insurers' own practice

- **The Insurance Act 2010, s.57(2),** still wants the nomination "in or endorsed on the policy" and registered by the insurer (earlier note, §1.3). **No IDRA circular on electronic nomination was found.** IDRA's digital work is the Unified Messaging Platform, now IIMS, with e-receipts and a policyholder portal. Since 2021 IDRA has also banned handwritten or printed paper receipts ([Financial Express](https://thefinancialexpress.com.bd/bangladesh/idra-bans-issuance-of-handwritten-or-printed-paper-receipts-1619583086) **[SECONDARY]**).
- **Guardian Life, EasyLife app (August 2020).** A customer buys a life policy "by just taking pictures of national identity cards of theirs and their nominee(s)" and "having their faces verified" ([TBS, 26 August 2020](https://www.tbsnews.net/companies/guardian-life-launches-e-kyc-solutions-customers-124675) **[SECONDARY]**). The nominee is captured from their NID. The nominee does not take part.
- **MetLife Bangladesh (September 2025)** issues the digital policy document within 24 hours. It includes "the customer's filled-in application forms" ([MetLife newsroom](https://www.metlife.com.bd/about-us/newsroom/2025/september/metlife-bangladesh-launches-24hour-digital-insurance-policy-document-issuance/)). How the application is signed, and whether a beneficiary signs, is not said.

---

## 5. National Savings Certificates (Directorate of National Savings)

- **Purchase still starts on a paper form.** The National Savings Certificates Online Management System (piloted 2019) records the holding and pays by EFT. Its self-service portal signs in with NID, date of birth, registered mobile and an OTP. That portal is described as **view and download** (Prime Bank's [Sanchaypatra Online Report FAQ](https://primebank.com.bd/assets/wealth-manage/faq/Sanchaypatra-Online-Report-FAQ.pdf); not opened). **No online nomination or nominee change was found.**
- **Nominee change on paper.** The forms are published by the জাতীয় সঞ্চয় বিশেষ ব্যুরো, শ্যামলী ([Other application forms](https://nssbs.dhaka.gov.bd/pages/static-pages/69958373f2b99fa8d1589b99)):
  - **"Nominee change.pdf"** is a letter to the Assistant Director. It sets out the certificates (name, registration number, issue date, amount) and the old nominee. It then gives the new nominee's "name, NID number and mobile number, date of birth, **percentage rate (শতকরা হার)**, relation".
    - Attachments: a copy of the application, a copy of **Form SC-3**, the new nominee's NID copy and **2 photos**, the previous nominee's NID copy, and a photocopy of the certificate.
    - It is signed by the holder, with name, address and mobile. The new nominee does not sign.
  - **"SC Form 3 nominee change.pdf"** is Form SC-3, the "Nomination Form (see Rules 9 to 12 of the Sanchayapatra Rules, 1977)".
    - It has four nominee rows with **amount (Taka)**, and the clause that a nominee who dies first drops out.
    - It is signed with the "signature(s) or thumb impressions(s) of the holder(s)". A thumb impression is attested by a named person.
    - The issuing officer certifies "The above nomination form has been attested to the original application form".
  - **"Minor Nominee.pdf"**, _নাবালক নমিনির প্রত্যয়নকারী নিয়োগকরণ প্রসঙ্গে_ (appointing an attester for a minor nominee). The buyer writes: "I … name my minor son/daughter … as nominee of this savings certificate. **As the nominee is a minor, I appoint, knowingly, my [relation] Mr/Ms … as their attester and guardian (প্রত্যয়নকারী এবং অভিভাবক)** for this certificate. Their national ID number … and date of birth …. **I attest their signature below.**"
    - It is followed by three specimen-signature lines of the "empowered person" (ক্ষমতাপ্রাপ্ত ব্যক্তি), attested by the buyer, and the buyer's own signature.
    - **This is the one Bangladeshi form found where the minor's guardian signs.** It is on paper.
- The earlier note covers the statutory side: the Post Office National Savings Certificates Ordinance 1944, s.5, has a parent or guardian receive for a minor holder.

---

## 6. What could not be confirmed

- **Nagad**: whether it takes nominees at all.
- **bKash**: whether the nominee flow asks for the PIN again or sends an OTP. Also bKash's own nominee terms ("instructions, rules, and conditions"), which are shown only in the app.
- **CDBL**: its current rules for online BO accounts, and whether Form 23's nominee and guardian signatures are still required when an account is opened online. cdbl.com.bd gave no readable text.
- **Bank apps**: no Bangladeshi bank was found that lets a holder change a nominee in its app or internet banking (EBL Skybanking, City Touch and BRAC Astha were searched). It may exist and not be described publicly.
- **IDRA**: no circular or regulation on how a nomination under Insurance Act s.57 may be made or endorsed electronically.
- **National Savings**: whether the online system or the self-service portal now accepts a nominee change. The bureau's forms say paper.
- **BRPD-1 Circular 08/2026** (the covering letter of the bank guideline): known only from news. The guideline itself was read.
- **NID age.** That a minor generally has no NID, which is why bKash's rule shuts out minors, is general knowledge about the Election Commission's NID. It was not checked against a primary source for this note.
- **How "low-risk" applies to a farm.** The guidelines' risk grading is written for regulated institutions. Whether a Venture holding of an Investor's size would be "high-risk", and so need a wet or electronic signature rather than a PIN, is a question for the lawyer and not something the guidelines answer for a non-regulated farm.
- **Legal effect.** None of these sources says a PIN or OTP nomination binds the heirs or is admissible as evidence. That is ticket 02, under the ICT Act 2006 and the Evidence Act.

---

## Sources

**Regulators (read in full, 8 October 2026)**

- BFIU, Guidelines on Electronic Know Your Customer (e-KYC), December 2019, issued 8 January 2020: https://www.bfiu.org.bd/pdf/circular/aml/jan082020bfiu25.pdf
- Bangladesh Bank, BRPD-1, Guidelines on Electronic Know Your Customer (e-KYC), March 2026: https://www.bb.org.bd/aboutus/regulationguideline/brpd/ekyc2026.pdf
- BFIU, Guidelines on Electronic Know Your Customer (e-KYC) for Insurance Companies and Capital Market Intermediaries, March 2026: https://www.bfiu.org.bd/pdf/circular/aml/mar302026bfiu29e.pdf

**Institutions' own pages and forms**

- bKash, Make your loved one a nominee on the bKash app: https://www.bkash.com/en/page/nominee_update
- bKash, Nominee Information Update: https://www.bkash.com/en/customer-service/category/account-management/nominee-information-update
- bKash, Deceased Person's Account Settlement: https://www.bkash.com/en/customer-service/category/account-management/deceased-persons-account-settlement
- Royal Capital Ltd, Online BO Form Page: https://royalcapitalbd.com/online-bo-account-opening
- Prime Bank, Nominee's Personal Information Form: https://primebank.com.bd/assets/downloads/1780575226_Nominee-Information-form-Editable.pdf
- জাতীয় সঞ্চয় বিশেষ ব্যুরো, শ্যামলী, Other application forms: https://nssbs.dhaka.gov.bd/pages/static-pages/69958373f2b99fa8d1589b99
  - Nominee change: https://objectstorage.ap-dcc-gazipur-1.oraclecloud15.com/n/axvjbnqprylg/b/V2Ministry/o/office-nssbs-dhaka/2024/12/9fb09a72e16649b095d2c477cc69676f.pdf
  - Form SC-3: https://objectstorage.ap-dcc-gazipur-1.oraclecloud15.com/n/axvjbnqprylg/b/V2Ministry/o/office-nssbs-dhaka/2024/12/065bbfa3c9ee444cad9f3bdc67609a3b.pdf
  - Minor Nominee: https://objectstorage.ap-dcc-gazipur-1.oraclecloud15.com/n/axvjbnqprylg/b/V2Ministry/o/office-nssbs-dhaka/2024/12/c8cc5590895945169f96fd6bf4d1c495.pdf
- MetLife Bangladesh, 24-Hour Digital Insurance Policy Document Issuance, 18 September 2025: https://www.metlife.com.bd/about-us/newsroom/2025/september/metlife-bangladesh-launches-24hour-digital-insurance-policy-document-issuance/
- Prime Bank, Sanchaypatra Online Report FAQ (not opened; cited as listed): https://primebank.com.bd/assets/wealth-manage/faq/Sanchaypatra-Online-Report-FAQ.pdf

**[SECONDARY]**

- New Age, BSEC launches online BO account opening system, 9 February 2021: https://www.newagebd.net/article/129728/bsec-launches-online-bo-account-opening-system
- The Business Standard, Guardian Life launches e-KYC solutions for customers, 26 August 2020: https://www.tbsnews.net/companies/guardian-life-launches-e-kyc-solutions-customers-124675
- The Financial Express, IDRA bans issuance of handwritten or printed paper receipts: https://thefinancialexpress.com.bd/bangladesh/idra-bans-issuance-of-handwritten-or-printed-paper-receipts-1619583086
