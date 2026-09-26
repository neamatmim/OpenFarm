# The lawyer's pack for the Investor Portal

Prepared 2026-09-25 for [Bring the portal as built to the lawyer](../issues/07-bring-the-portal-to-the-lawyer.md). It is the agent's part of that ticket. The Owner's part is the meeting and the written opinion.

## What to bring

**To print everything at once**, open [`07-lawyer-pack.html`](./07-lawyer-pack.html) in Chrome and print with ⌘P: A4, margins "None". It prints nine A4 pages: the summary, the checklist, the notice in Bangla and English, the consent sheet, the Agreement clause, two pages on several Nominees (added 2026-09-26), and a page to record the answer.

1. **[The one-page summary](./07-portal-one-page-summary.md).** Print it. It is what the portal is, does and never does.
2. **[The privacy notice, "আপনার তথ্য"](./06-your-data-notice-draft.md).** Print the Bangla. Its blanks are the host, the backup company and the complaint wording.
3. **[The Portal Consent sheet](./07-portal-consent-sheet-draft.md).**
4. **[The Investment Agreement's data clause and nominee lines](./07-agreement-data-clause-draft.md).** They are to become a new Version of the Template.
5. **[Several Nominees](../../openfarm-several-nominees/assets/05-nominee-wording-draft.md)**: the Agreement's Nominee table and heirs rules, and the new Nomination paper. They replace the nominee lines in item 4, and are pages 7–8 of the printable pack. They come from [the several-nominees map](../../openfarm-several-nominees/map.md).
6. **The four Agreement Templates.** Print them from Agreement templates → Read. They are already on the investor map's ticket 11.
7. **ADRs 0007, 0008 and 0009**, for the reasoning if asked:
   - [0007: a read-only portal](../../../docs/adr/0007-investors-sign-in-to-a-read-only-portal.md)
   - [0008: Ventures raising capital and how to pay](../../../docs/adr/0008-invited-investors-see-ventures-raising-capital-and-how-to-pay.md)
   - [0009: its own address](../../../docs/adr/0009-the-investor-portal-has-its-own-address.md)
8. **The research**, if the lawyer wants the sources: [`docs/research/bangladesh-data-protection-for-the-portal.md`](../../../docs/research/bangladesh-data-protection-for-the-portal.md).

## Showing the portal itself

The **Portal Preview** ("See as they do") is decided but **not built yet**. Until it is, walk the lawyer through with a **test Investor on the seed database**:

- `pnpm db:seed --reset`, then sign in as the Owner on port 3002
- switch the portal on (seed database only)
- invite a seeded Investor, take the code up in a private window, and read their portal

Show:

- the portfolio and a Venture page
- a Venture raising capital and a Request to Join
- how to pay, on a signed Agreement
- the account page and the notice on every page

The Welcome Letter, the "আপনার তথ্য" page and the consent step are also not built. Show them from the printed drafts.

## The checklist

These are the questions for the written opinion. Tick each one as the lawyer answers it, and note where in the opinion the answer sits.

### Already answered verbally on 2026-09-25: wanted in writing

- [ ] The portal as built, by invitation only, is not a platform needing Bangladesh Bank approval (PSS Act 2024 s.15(2)).
- [ ] Showing a Venture still gathering capital to invited Investors, and letting them ask to join, is acceptable.
- [ ] Showing the Venture Account's bank details and a reference, for capital already signed for, is acceptable.
- [ ] Taking payment inside the portal is **not** approved. The farm is not asking again.

### The joining screens (on the ticket, since 2026-09-25)

- [ ] The Owner's own few words on a Venture shown in the portal. Are they a risk even with the warning where they are written?
- [ ] The standing notice's exact words.
- [ ] Could a recorded "come and sign" read as an acceptance, forming a contract before the stamped paper?
- [ ] Bank details only on the Investor's own signed Agreement, with the "never pay anywhere else" warning. Is that the line meant?

### Data protection (the research's section 14, and the decisions since)

- [ ] **Ground.** Is consent (s.5(1)) the right ground for the portal and the contract (s.5(3)(ক)) for the records? Or can the contract carry both? _The drafts assume the first: the Agreement clause for the records, the consent sheet for the portal._
- [ ] **Singapore.** Is a hosted server there a "transfer abroad" under s.29(3)? If so, is consent under (ক) needed, or does (খ) cover an investment agreement? _The consent sheet asks consent either way._
- [ ] **Volume.** Are twenty Investors' NID numbers a "large volume" needing notice to the Authority (s.29(6))?
- [ ] **Twelve years.** Does the duty to keep books justify keeping the NID number and bank account that long, or only the money records? _See the notice and clause 4._
- [ ] **Timing.** When do ss.31–35 start? Can the Authority fine under the National Data Management Act s.42 now? Has it been constituted? _This decides the notice's complaint line._
- [ ] **NID.** Is the NID Act 2023 repealed? Is keeping a photocopy of an Investor's NID card for the Agreement a "reasonable cause" (s.19 of 2010, or s.24 of 2023)?
- [ ] **The wording.** Are the notice and consent sheet enough for s.5(2) and s.15(2) until regulations set a form?
- [ ] **A nominee under 18.** Does a signature on the Agreement meet s.9 while no regulations exist? _Clause 8's guardian line is replaced by the Receiver's line under several Nominees below._
- ~~**Investors signed before the clause (s.40).**~~ _Not needed: the Owner confirmed on 2026-09-26 that no real Investor has signed yet, so every real Investor signs an Agreement with the data clause. Dropped from the printable pack._
- [ ] **The host.** What must the farm's contract with the Singapore host (and the backup store) say to make them processors bound by s.8?

### Several Nominees (added 2026-09-26)

The drafts are on pages 7–8 of the printable pack, and in [the wording draft](../../openfarm-several-nominees/assets/05-nominee-wording-draft.md). The reasoning is in [`docs/research/nominees-in-bangladeshi-law-and-shariah.md`](../../../docs/research/nominees-in-bangladeshi-law-and-shariah.md).

- [ ] **An unstamped Nomination.** Can a signed, unstamped Nomination replace the Nominees a stamped Agreement names? Or does a change need stamp paper?
- [ ] **Discharge.** Does paying a Nominee their share (rule 4) discharge the farm against heirs who dispute it? No statute covers a private mudarabah as BCA s.103(4) covers a bank.
- [ ] **A threshold.** Should the farm pay above some sum only against a succession certificate? The Savings Banks Act uses Tk 25,000, and CDBL waives up to Tk 1 lakh.
- [ ] **Shares.** Do rule 1's words stop 50 : 30 : 20 reading as a bequest? Would a term paying a Nominee in their own right be void (Contract Act s.23), or only unenforceable against the heirs?
- [ ] **A minor Nominee.** Does the Receiver's signed line meet s.9 for the minor's details, and validly name who receives for them, as BCA s.103(2) and Insurance Act s.57(1) allow?
- [ ] **For the Shariah scholar.** Is the Nominee an *amin*, not a legatee? May an heir be one?

### After the meeting

The ticket is resolved when the written opinion is in hand. Record on it:

- what the lawyer said, against this checklist
- where the written opinion is kept
- what it changes: the portal stays shut, opens as built, or opens with changes
- whether joining or paying may ever go through the portal, and on what terms

- whether the several-Nominees wording stands, and any change it needs

Then each approved wording is published as a Template Version, with the lawyer's name and day recorded on it.
