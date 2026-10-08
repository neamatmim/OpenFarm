---
status: accepted
date: 2026-10-05
---

# Investors may say in the portal that they have paid; the portal still takes no money

ADR 0007 made the portal read-only: nothing taken, paid or signed through it. ADR 0008 let it show an Investor the Venture Account and the Pay-in Code for capital they have signed for, so they know where to pay. The lawyer approved that, and did not approve taking payment inside the portal: no card, gateway or mobile financial service. The written opinion of 2026-09-26 approved the portal as built, and the Owner chose to keep payment out.

On 2026-10-05 the Owner asked whether a portal Investor could submit their payment. They cannot, and that stands. Between paying and the money being recorded, though, the Investor has no way to say "I sent it", and the Owner has only the Pay-in Code to match against the bank statement. The Owner asked for a way to say it.

**A Pay-in Note is the Investor's word, not their money.** From the portal, an Investor who still owes on an Agreement may say they sent so much, on such a day, by bank transfer, check, deposit slip or Mobile Money into the Venture Account. They give the reference the bank or the provider gave, and a photo of the slip if they like. The note moves nothing. The Owner checks the Venture Account and records the capital as before, through the same act and the same guards: by bank, never over the Units, never without the Agreement on file. Recording it from the note answers the note **received**. Otherwise the Owner answers **not found**, with a line to the Investor.

- **The money still never touches the portal.** It goes from the Investor's bank or bKash into the Venture Account, as ADR 0008 has it. "No money moves through it" stays true on every portal page.
- **Mobile Money means bKash sent into the Venture Account.** It arrives there as a bank credit, so the rule that a Venture takes capital by bank only is unchanged, and the TrxID is the reference. A bKash wallet that takes capital itself would change the Venture Account. That is not decided here.
- **The Owner is told at once**, by an immediate notice rather than the Digest. An Investor who has sent money is waiting to hear, and a deadline (a decide-by day, a Monthly Sum's 10th) may be close.
- **Behind the farm's switch, `pay_in_notes`, off by default and the Owner's alone.** The lawyer approved a portal that says where to pay. This adds the Investor's word that they paid, so the lawyer and the Shariah scholar see it first, on the sheet in `.scratch/openfarm-pay-in-notes/`, and the Owner turns it on.

**Consequences:**

- ADR 0007's "nothing taken, paid or signed" stands. ADR 0008's "the portal still takes no money" stands. What changes is that the portal may now take the Investor's word about money sent outside it.
- CONTEXT.md gains **Pay-in Note**, and its **Investor Portal** entry says so.
- The plan is in `.scratch/openfarm-pay-in-notes/`. The table, the screens and the Owner's answer follow this.

**Revisit** when the advisers answer. If they say the note itself is "taking payment", the switch stays off and this ADR follows their answer.
