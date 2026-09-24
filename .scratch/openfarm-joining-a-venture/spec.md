# Joining a Venture through the Investor Portal — spec

Status: ready-for-agent

Source: the `/grill-with-docs` session of 2026-09-25 recorded on the portal map ([`map.md`](../openfarm-investor-portal/map.md), _Decisions so far_), [ADR 0008](../../docs/adr/0008-invited-investors-see-ventures-raising-capital-and-how-to-pay.md) and its dated note, and the glossary [`CONTEXT.md`](../../CONTEXT.md): **Request to Join**, **Pay-in Code**, **Investor Portal**, **Investor Cap** and **Venture Account**. Where this spec and the glossary disagree, the glossary wins and this spec has a bug. Vocabulary is the glossary's; capitalised terms are defined there.

**Built now, opened later.** The lawyer's approval is verbal. The portal stays switched off for real Investors until the written opinion arrives ([ticket 07](../openfarm-investor-portal/issues/07-bring-the-portal-to-the-lawyer.md)), and the screens below go to the lawyer for that opinion to cover. Nothing here waits on it being built. If the writing narrows anything, such as the Owner's description, the notice wording or where the bank details appear, each is a small change.

---

## Problem Statement

When the Owner opens a new Venture, they find Investors the way they always have: by phoning people they know, one at a time. They repeat the Unit price, the Floor and the decide-by day on every call. They then keep a mental tally of who said "put me down for five" and who said "maybe four". The tally lives in their head or on a scrap of paper. By the decide-by day, nobody can say for certain how close the Venture came to its Floor, who was promised what, or whether "I only asked for four" is true.

The portal now lets invited Investors read the Ventures they are in. It says nothing about the next one. An Investor who wants to join has to wait for the call. Once they have signed the stamped Agreement, they have to ask again where to send the money and what to write on the transfer. The Owner then has to match an unexplained deposit to a name.

The lawyer has said, verbally, that three things are acceptable because the portal is invitation-only. Invited Investors may see a Venture still gathering capital, and say they want to join. They may also be shown the Venture Account's bank details for capital they have signed for. The law does not allow the easy version: an "invest now" button, a payment inside the portal, an urgency counter, or a projected return. Getting the closed circle wrong turns a farm's private arrangement into an online offer to invest.

## Solution

The Owner **shows** an Open Venture in the portal, with a few words of their own, and can take it out again.

Every invited Investor who is not retired sees it. They see:

- **the terms:** Unit price, target, Floor, decide-by day, Target Window, both budgets, and the split the farm signs on today;
- **the rules:** every taka back if the Floor is missed, a loss comes off capital, nothing is guaranteed, and joining is only by signing in person;
- **the Owner's description.**

They never see a projection, a past Venture's result, how many Units are left, or anything about anybody else.

An Investor makes a **Request to Join**: how many whole Units, and a note if they like. It binds nobody. They may change or withdraw it until the Owner answers, and every change is kept.

The Owner alone hears about it, in one Notice carried by the Digest. The Owner reads all a Venture's Requests on its page, next to what is signed and what the Floor needs, and answers each one:

- **come and sign**, for the Units asked or fewer, capped so that the yeses never promise more Units than remain;
- **not this time**, with a line to the Investor if they like.

Signing happens exactly as it does now: in person, on stamped paper. The recorded Agreement names the Request it answers, and gets a **Pay-in Code**.

From then on, the Investor's own Agreement in the portal shows **how to pay** until the capital is in:

- the Venture Account's bank details;
- the amount still owed;
- the Pay-in Code to write on the transfer;
- the decide-by day;
- a warning that the farm will never ask them to pay anywhere else.

When the money lands, the Owner's capital form recognises the Pay-in Code.

Nothing is sent to the Investor. The answer waits on their page, and a yes means the Owner phones to arrange the signing anyway.

## User Stories

**Showing a Venture**

1. As an Owner, I want an Open Venture to stay out of the portal until I choose to show it, so that a Venture I am still working out the terms of is never seen by anybody.
2. As an Owner, I want to show a Venture in the portal with one act, so that every invited Investor can see it without my choosing people one by one.
3. As an Owner, I want to write a few words of my own on a shown Venture, such as "Qurbani bulls for Eid 2027", so that Investors know what the Venture is for.
4. As an Owner, I want to be told, where I write those words, that they must not state returns, prices to come or comparisons, so that I do not undo the no-projections rule by accident.
5. As an Owner, I want to change those words while the Venture is shown, so that a mistake is not stuck there.
6. As an Owner, I want to take a Venture out of the portal again, so that I can stop new Requests when I have enough or change my mind.
7. As an Owner, I want showing and taking out to be refused unless the Venture is Open, so that a Venture already Buying, Cancelled or Settled is never offered.
8. As an Owner, I want showing a Venture to be refused once its decide-by day has passed, so that I never offer something whose Floor question is already answered.
9. As an Owner, I want every showing, taking out and change of words written in the trail, so that I can answer "when was this offered, and with what words?".
10. As an Owner, I want to see on a Venture's page whether it is shown in the portal, so that I never have to guess what Investors can see.

**What an Investor sees**

11. As an invited Investor, I want to see the Ventures the farm is showing that are still gathering capital, so that I hear about the next one without waiting for a call.
12. As an invited Investor with no money in any Venture yet, I want to see shown Ventures too, so that being new does not shut me out.
13. As an invited Investor, I want to see a shown Venture's Unit price, target, Floor, decide-by day, Target Window and both budgets, so that I know what I would be joining.
14. As an invited Investor, I want to see the split the farm signs on today, so that I know my share of any profit before I ask, as a mudarabah partner is owed.
15. As an invited Investor, I want to be told plainly that every taka comes back if the Floor is missed by the decide-by day, that a loss comes off capital, that nothing is guaranteed, and that joining is only by signing a stamped Agreement in person, so that I am not misled about what I am asking for.
16. As an invited Investor, I want to read the Owner's own words on the Venture, so that I know what it is for.
17. As an invited Investor, I want never to be shown a projected profit, an expected sale price, gains per day or a past Venture's result, so that nothing on the screen reads as a promise.
18. As an invited Investor, I want never to be shown how many Units are left or who else has asked, so that I am not pressured and nobody's business is shown to me.
19. As a retired Investor, I want to keep reading my own papers but be shown no Venture gathering capital, so that I am never invited to ask for something I cannot be signed for.
20. As an invited Investor already signed on a Venture, I want that Venture to show as mine rather than as something to ask for, so that I do not ask to join what I am already in.
21. As an invited Investor, I want a Venture past its decide-by day to say it is no longer taking requests, so that I do not ask for something that cannot happen.
22. As an invited Investor, I want a Venture the Owner has taken out of the portal to disappear from what is offered, so that I am not asking for something the farm has closed.
23. As an Owner, I want the notice on every portal page to say the portal is not a public offer, that joining is only by an Agreement signed in person, and that no money moves through it, so that the notice stays true now that a Venture can be asked for.

**Making a Request to Join**

24. As an invited Investor, I want to ask to join a shown Venture for a number of whole Units, so that the Owner knows exactly what I have in mind.
25. As an invited Investor, I want to see the taka my Units come to beside the number, so that I know what I am asking about.
26. As an invited Investor, I want to add a short note, such as "I can pay after Eid", so that the Owner has what they need when they phone.
27. As an invited Investor, I want asking for no Units, part of a Unit, or more Units than the Venture has to be refused, so that my Request is always one the farm could sign.
28. As an invited Investor, I want to be told that my Request binds nobody, and that it holds no Units and moves no money, so that I know sending it is safe.
29. As an invited Investor, I want to change the Units or the note until the Owner answers, so that I can think again without phoning.
30. As an invited Investor, I want to withdraw my Request, so that I can back out without a conversation.
31. As an invited Investor, I want to ask again after withdrawing, while the Venture is still shown, so that one change of mind is not final.
32. As an invited Investor, I want at most one live Request per Venture, so that asking again changes what I asked rather than piling up a second one.
33. As an invited Investor, I want my own Requests and their answers on my own page, so that I always know where each one stands.
34. As an Owner, I want every Request, change and withdrawal kept with when it was made, so that "I only asked for four" has an answer.
35. As an Owner, I want a Request refused once the Venture is no longer Open, is taken out of the portal, or is past its decide-by day, so that nothing is asked for that cannot happen.
36. As an Owner, I want a Request refused from a retired Investor, so that nobody asks for what the glossary says they cannot be signed for.
37. As an Owner, I want a Request refused from somebody already signed on that Venture, so that nobody asks for a second Agreement where one per person is the rule.
38. As an Owner, I want a Request refused from anybody whose portal access I have taken away, so that nobody I have shut out can still ask.

**Telling the Owner**

39. As an Owner, I want to hear about a new Request in the evening's Digest, not as an Alert, so that a request at 23:00 wakes nobody.
40. As an Owner, I want to be the only person told, so that Investors' money stays my business and not the Manager's.
41. As an Owner, I want one Notice per Request that follows it through its changes, so that a Request changed three times is one item on my list, not three.
42. As an Owner, I want that Notice to close by itself if the Request is withdrawn before I answer, so that my list holds only work still waiting.
43. As an Owner, I want the Notice to take me straight to the Venture's Requests, so that I can answer from where I read it.

**The Owner reading and answering**

44. As an Owner, I want a Venture's page to list its Requests with the Investor, Units, taka, note, when each was made and where it stands, so that I can see everything asked for in one place.
45. As an Owner, I want each Request's history of changes shown beneath it, so that I know whether four became six or six became four.
46. As an Owner, I want totals beside the target and the Floor, covering Units signed, Units promised with a yes, and Units asked for and waiting, so that I can tell whether the Requests would reach the Floor when the signatures do not yet.
47. As an Owner, I want to answer a Request "come and sign" for the Units asked, so that the Investor knows we will sign.
48. As an Owner, I want to answer "come and sign" for fewer Units than asked, so that I can take part of a Request when the Venture cannot take all of it.
49. As an Owner, I want "come and sign" refused for more Units than remain after signed Agreements and other yeses still waiting, so that three yeses never promise fourteen Units out of ten.
50. As an Owner, I want to be told how many Units I can still say yes to while answering, so that I do not find the ceiling by being refused.
51. As an Owner, I want to answer "not this time", with a line to the Investor if I like, so that a no is recorded and not left to a phone call nobody remembers.
52. As an Owner, I want my answer written in the trail with who gave it and when, so that the file shows what I promised.
53. As an Owner, I want "come and sign" refused once the decide-by day has passed, so that I promise nothing the Floor decision has already overtaken.
54. As an Owner, I want to be able to answer "not this time" after the decide-by day, so that nobody is left waiting without an answer.
55. As an Owner saying yes to somebody not yet in any running Venture, I want to be shown what signing them would make the Investor count, with my other waiting yeses to new people counted in, so that I can see a Cap problem coming.
56. As an Owner, I want to be able to say yes with that warning in front of me, so that a count that changes weekly does not force me to refuse somebody I may be able to sign later.
57. As an Owner, I want the Cap still refused at signing exactly as today, so that the warning at the yes never becomes an override.
58. As an invited Investor, I want never to be told the farm's Investor count, so that how many others are in stays their business.

**The Investor after an answer**

59. As an invited Investor, I want my page to say "the farm will sign N Units with you" and whom to call, so that I know what happens next.
60. As an invited Investor, I want my page to show "not this time" and the Owner's line, if they wrote one, so that I am not left wondering.
61. As an invited Investor who was told yes, I want to still be able to withdraw, so that I can say "I can't after all" without waiting to be phoned, and the Units go back for somebody else.
62. As an invited Investor who was told yes, I want the Units fixed once the Owner has answered, so that what was promised stays what was promised.
63. As an invited Investor who was told yes, I want my promise to stay on my page even if the Venture is taken out of the portal, so that hiding it from new askers does not quietly take back what the Owner offered me.
64. As an invited Investor, I want a Request nobody answered to close, and say so, when the Venture stops gathering capital or leaves the portal, so that it never sits waiting forever.
65. As an invited Investor told yes but never signed, I want the yes to close, and say so, when the Venture starts Buying or is Cancelled, so that my page tells the truth.

**Signing**

66. As an Owner recording an Agreement, I want to pick the Request it answers from that Investor's Requests on the Venture, so that the Request reads as signed.
67. As an Owner, I want an Agreement whose Units differ from the yes to be recorded with the paper's Units, so that what was signed is what counts.
68. As an Owner, I want to record an Agreement with no Request at all, as today, so that somebody who joined by phone is signed exactly as before.
69. As an Owner, I want every Agreement to get its own Pay-in Code when it is recorded, so that each Investor has something to write on the transfer.
70. As an Owner, I want Agreements already recorded to get a Pay-in Code too, so that every Agreement still waiting for capital can use one.
71. As an Owner, I want the Pay-in Code short, readable on a deposit slip, unique on the farm and never changed, so that it can be written by hand and still identify one Agreement.

**How to pay**

72. As an Owner, I want to write the Venture Account's bank, branch, account name, account number and routing number on the Venture, so that the portal can tell a signed Investor where to pay.
73. As an Owner, I want only me to be able to write or change those details, and every change in the trail, so that nobody can quietly redirect an Investor's money.
74. As an invited Investor with a signed Agreement, I want my Agreement's page to show the Venture Account's details, the amount I still owe, my Pay-in Code and the decide-by day, so that I can pay from my own bank without asking.
75. As an invited Investor, I want the amount still owed to be my Agreement's Units times the Unit price less the capital already recorded against it, so that a part payment is shown correctly.
76. As an invited Investor, I want "how to pay" to disappear once my capital is all in, so that I am never invited to pay twice.
77. As an invited Investor, I want to be warned that the farm will only ever ask me to pay into this account, and to call the Owner if anyone gives me another, so that a message claiming "our account changed" does not take my money.
78. As an invited Investor, I want no bank details anywhere near a Venture I have not signed for, so that nothing reads as "pay here to join".
79. As an invited Investor whose Venture has no bank details written yet, I want my page to say the farm will tell me where to pay, so that I am not left with nothing.
80. As an Owner recording capital, I want each Agreement listed with its Pay-in Code, and the Agreement picked for me when the bank's reference contains one, so that matching a deposit to a person is not guesswork.
81. As an Owner, I want the reference I record to stay whatever the bank printed, so that the Venture Movement still says what the bank said.

**Closing**

82. As an Owner, I want every live Request, answered or not, to close with the reason when the Venture starts Buying or is Cancelled, so that nothing stays open on a Venture that has stopped gathering capital.
83. As an Owner, I want unanswered Requests to close, and yeses to stand, when I take a Venture out of the portal, so that hiding a Venture keeps my promises.
84. As an Owner, I want a retired Investor's live Requests to close when I retire them, so that nothing waits on somebody who cannot be signed.
85. As an Owner, I want closed Requests kept, never deleted, so that the history of who asked for what survives the Venture.

**The Owner's other views**

86. As an Owner, I want an Investor's page to list their Requests across Ventures, so that I see their whole conversation with the farm in one place.
87. As an Owner, I want an Investor's portal activity to include the Requests they made, changed and withdrew, so that it reads alongside the papers they opened.

## Implementation Decisions

**Schema** (one migration):

- **Venture** gains:
  - when it was shown in the portal (empty while not shown);
  - the Owner's description for the portal;
  - the Venture Account's bank, branch, account name, account number and routing number.

  All are nullable. Taking a Venture out of the portal empties "shown".

- **Investment Agreement** gains:
  - its **Pay-in Code**: unique per Farm, set when recorded, never changed;
  - the Request to Join it answers, if any.

  The migration backfills a Pay-in Code for every existing Agreement.

- A new **Request to Join** table holds one row per Request:
  - Farm, Venture, Investor;
  - Units asked, note;
  - its state: `waiting`, `come_and_sign`, `not_this_time`, `withdrawn`, `signed`, `closed`;
  - the Units and line the Owner answered with, who answered and when;
  - why it closed, when closed by the system: the Venture started Buying, was Cancelled or was taken out of the portal, or the Investor was retired;
  - when it was made.

  At most one **live** Request per Investor per Venture, enforced by a partial unique index. Live means `waiting` or `come_and_sign`.

- A new **Request to Join change** table holds one row per thing the Investor did: made, changed or withdrawn, with the Units and note as they then were and when. This is the history the Owner reads, and it's also written to the trail.
- **Pay-in Code format:** a short prefix, the Venture's ordinal on the farm, and the Agreement's ordinal on the Venture, for example `OF-3-07`. It's worked out inside the recording transaction, uniqueness enforced by an index. Implementation may choose the exact spelling, as long as it is short, uppercase ASCII, and has no letters that are easy to mistake for digits.

**The rules, in one module beside the Venture store:**

- **Who may request:** the portal is open, the Investor's access is live, the Investor is not retired, and has no Agreement on the Venture. The Venture is Open, shown, and on or before its decide-by day.
- **Units still promisable:** the Venture's Units, less the Units on signed Agreements, less the Units on other `come_and_sign` Requests not yet signed. This is the ceiling on a yes. It's never shown to an Investor.
- **Investor Cap preview for a yes:** the count of distinct people standing today, plus the person being answered if they are new, plus the other `come_and_sign` Requests from new people. It's returned with the answer form and never blocks. Signing keeps its existing refusal with `investor_cap_reached`.
- **Closing:**
  - Starting Buying or cancelling closes every live Request.
  - Taking the Venture out of the portal closes `waiting` ones only.
  - Retiring an Investor closes theirs.

  Each close runs in the same transaction as the act that causes it.

**Procedures:**

- **Owner (Venture router):**
  - `show` with the description;
  - `changeDescription`;
  - `hide`;
  - `setBankAccount`;
  - `requests` for one Venture: each Request with its history, plus the totals of signed, promised and waiting against target and Floor;
  - `answerRequest`: come and sign with Units, or not this time with an optional line. It returns the refusal, or the Cap preview.

  The existing `sign` takes an optional Request id, refused unless it is that Investor's live Request on that Venture. Its result carries the Pay-in Code. The capital form's read carries each Agreement's Pay-in Code.

- **Investor (portal router):**
  - `openVentures`: shown and Open Ventures, each with its terms, today's split, the rules and the description, and nothing else;
  - `requestToJoin`: makes or changes a Request;
  - `withdrawRequest`;
  - `myRequests`.

  The existing Agreement read gains a "how to pay" block: bank details, amount still owed, Pay-in Code, decide-by day. It's present only while capital is owed, with bank details only when written.

- **The investor narrowing:** open Ventures are read through their own narrowing, never the "their own Agreements" one. They carry no figures from any Agreement, and no count of Units taken or people asking.
- **Refusals** follow the existing pattern, a named refusal in the error's data, with the kinds:
  - `venture_not_shown`
  - `venture_past_decide_by`
  - `investor_retired`
  - `already_signed_on_venture`
  - `request_already_answered`
  - `units_beyond_promisable`
  - `units_beyond_venture`
  - `venture_wrong_state`

**Notice:** a new Notice kind, `join_requested`.

- It's heard by the Owner alone, carried by the Digest like `money_awaiting_approval`, and it's about the Request.
- Its facts: the Investor's name, the Venture's name, the Units.
- A change updates it, one per Request through the existing once-per-thing index. A withdrawal before an answer, or any answer, dismisses it.
- Its words go into the notice-words fillings in Bangla and English, with Bangla numerals.

**Trail:** show, hide, the description changing, the bank details changing, a Request made, changed or withdrawn, an answer, and a system close are each an Audit Event. The Investor's acts are attributed to their account, as reading a paper already is.

**Screens:**

- **Owner's Venture page:**
  - a "portal" panel: shown or not, the description, show, hide;
  - a "Venture Account" panel for the bank details;
  - a "Requests to Join" list with totals and the two answers.
- **Owner's Investor page:** their Requests.
- **Owner's sign form:** a Request picker.
- **Owner's capital form:** Pay-in Codes.
- **Portal:**
  - an "open Ventures" page, reached from the portfolio;
  - a Venture-to-join page with the terms, rules, description and a Request form;
  - the Investor's Requests on the portfolio;
  - "how to pay" on their Agreement's page.
- **The portal notice** on every page changes in both languages to the new wording, pending the lawyer's exact words.

**The portal switch:** everything the Investor side does is behind the existing farm-wide portal switch and per-Investor access. No new switch.

## Testing Decisions

**What a good test is:** it drives the app as a person would, through its procedures only, and asserts the complaint, not the field.

- Say "an Investor cannot see how many Units are left", not "the payload has no `unitsLeft`".
- A refusal test is proven by switching its guard off and watching it go red.
- A test of what an Investor must _not_ see asserts on the whole answer, so a leak under a new name is caught.

**The one seam:** the app's oRPC router, called in-process.

- As the Owner: the test client.
- As a signed-in Investor: a session row plus a router client, as the portal tests already do.
- As nobody.
- Each test file has its own Farm on the shared testcontainers database.

**Files, by concern:**

- showing and taking out, with the description;
- what an invited Investor sees, including the retired Investor, the already-signed Investor and the past-decide-by Venture;
- making, changing, withdrawing and re-making a Request, with its history;
- the Owner's answers:
  - the ceiling on yeses;
  - fewer Units;
  - after the decide-by day;
  - the Cap preview, including the Cap still refusing at signing;
- closing: Buying, Cancelled, hidden with a yes standing, retired;
- signing with and without a Request, the Pay-in Code, and the backfill;
- how to pay: absent before signing, present after, the amount owed after a part payment, gone when paid, the no-bank-details wording;
- the Notice: one per Request through changes, Owner only, dismissed on withdrawal and on answer.

**Prior art:**

- the portal door and reading tests: the Investor client, "another Investor's Agreement is no such agreement";
- the agreement-to-sign and capital tests: signing, the Cap refusal, capital against an Agreement;
- the investor-statement-due test: an Owner-only Digest Notice;
- the notice-words table test in the domain package, for the new kind's words;
- the investor-changes test, for trail entries attributed to their author.

**Rate-limited or racing paths:** two yeses racing for the last Units must not both succeed. Test it sequentially, and once concurrently, as the capital race test does. The yes ceiling is read and written in one transaction, locking the Venture row.

**Screens** are checked by opening the dev app after seeding. Web component tests are not collected by the current vitest include glob. Check both portal layouts, the Owner's Venture page, and a page drawn first from an old cached answer. New fields must default when absent.

**Typecheck** each touched package after the last file, tests included.

## Out of Scope

- **Paying inside the portal:** card, mobile financial services, a gateway. Not approved (ADR 0008).
- **Signing inside the portal:** Agreements, Venture Schedules, Amendments. It waits on ticket 11's e-signature questions.
- **Notifications to Investors,** including "your Request was answered" and "capital received". This is the later notifications effort, and these are its first two candidates.
- **Choosing per person who sees a Venture.** The Owner shows a Venture to every invited Investor, or to nobody.
- **Showing Units left, other people's Requests, the Investor count, past results or any projection.**
- **The Master Agreement and Venture Schedule path.** Every Venture is still signed with its own Investment Agreement.
- **Matching bank deposits automatically.** The Owner still records capital by hand. The Pay-in Code only helps them pick the Agreement.
- **The Owner's "see as they do" preview.** That is portal-map ticket 03, and it will show open Ventures when it exists.
- **The written legal opinion and the exact notice wording.** Ticket 07.

## Further Notes

**Settled while specifying, from the session's principles rather than asked outright.** Say if any is wrong:

- **After "not this time", that Investor may not ask again on the same Venture.** Otherwise a no is one tap from being undone, and the Owner's list refills.
- **After a yes, the Investor may withdraw but not change the Units.** A Request binds nobody, so withdrawing must stay possible. Changing a promised number would move what the Owner promised.
- **Retiring an Investor closes their live Requests.** A retired Investor cannot be signed.
- **Taking portal access away does not close their Requests.** The Owner may still sign them by phone, and can answer "not this time" themselves.
- **After the decide-by day, nothing new is asked for and no new yes is given.** Existing yeses can still be signed while the Venture is Open, and everything closes when it leaves Open.

**Other notes:**

- **Migrate the dev database on merge,** reseed, and move the latest-migration marker. The seed should show one Venture in the portal, with one Request waiting and one answered yes, so the screens can be opened.
- **The Pay-in Code is not the Venture Movement's reference.** The glossary keeps them apart. Don't reuse the name `reference` for it anywhere.
- **The ticket 07 questions** for the written opinion list exactly these screens. If the opinion changes any of them, the change is to the wording or to what is shown, never to the no-capital-without-a-stamped-Agreement guard.
