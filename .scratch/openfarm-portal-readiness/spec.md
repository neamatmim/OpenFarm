# The portal ready for its first Investor — spec

**Source:** the investor-portal map, [OpenFarm investor portal: the first real Investor in](../openfarm-investor-portal/map.md). Its tickets 03, 04, 05, 06 and 08 were decided with the Owner on 2026-09-25. Each handed off work, and this spec gathers it.

**Decisions it rests on:**

- [ADR 0007](../../docs/adr/0007-investors-sign-in-to-a-read-only-portal.md): a read-only portal
- [ADR 0008](../../docs/adr/0008-invited-investors-see-ventures-raising-capital-and-how-to-pay.md): Ventures raising capital, and how to pay
- [ADR 0009](../../docs/adr/0009-the-investor-portal-has-its-own-address.md): its own address

**Vocabulary** is in `CONTEXT.md`: **Portal Preview**, **Welcome Letter**, **Code Slip**, **Portal Consent**, **Investor Portal**.

**Status:** ready for an agent. Tickets are in [README.md](./README.md).

---

## Problem Statement

The portal works, and is switched off. Before the Owner can hand the first real Investor a code, several things the map settled have to exist:

- The Owner cannot see what an Investor would see without signing in as them. That is forbidden, and on one origin it signs the Owner out.
- There is nothing to hand over. The code is shown once in a dialog, with no letter, steps or notice to go with it.
- The farm has no notice about the Investor's data, no recorded consent, no way to prove it, and no clean way to answer a request for a copy.
- The Investment Agreement says nothing about data or the nominee.
- The portal shares the staff app's origin. So it shares its session, its storage and its headers, and a shared phone keeps what the Investor read.
- A code typed as printed, with a space in the middle, is refused as wrong.

The lawyer's written opinion is still to come. Its meeting goes better with real screens than with printed drafts. So the parts the lawyer reads come first:

- the Preview
- the Welcome Letter
- the consent step
- the notice page

## Solution

Eleven slices, each ending with somebody opening the page:

1. **The join takes a code as printed.** Spaces inside the code are ignored.
2. **The Portal Preview.** The Owner opens "See as they do" on any Investor's page. They read that Investor's real portal pages under their own address, with a band on every page. Every act is dimmed. A paper made there is the Owner's own Export.
3. **The consent sheet and the notice become Templates**, versioned and approved like the Agreement wording.
4. **Portal Consent before any code.** The invite dialog prints the consent sheet first. The Owner marks it signed, and only then does a code exist.
5. **The Welcome Letter and Code Slip**, printed from the code dialog:
   - the letter the first time, with the notice on its back
   - the slip alone for every later code
   - each one an Export that never holds the code
6. **Withdrawal.** Taking access away records why. "They withdrew their consent" marks the consent withdrawn.
7. **"আপনার তথ্য" in the portal.** A page open before sign-in, linked after the standing notice and from the account page.
8. **"খামারে আপনার তথ্য".** An Owner-only, unmasked copy of everything the farm holds on one Investor. It answers a request for a copy in minutes.
9. **The Agreement's data clause.** A new Version of the Investment Agreement Template carries the data section and nominee lines, and the notice prints to hand over at signing.
10. **The portal's own address.** `investors.<farm-domain>`:
    - each address serves only its own people, and the door points each person to theirs
    - `/portal` redirects there
    - auth is kept apart per address
11. **Nothing kept on the phone.** On the Investor address:
    - no persisted answers and no service worker
    - `Clear-Site-Data` at sign-out
    - the same wipe when a sign-in has run its day

## User Stories

### The code as printed

1. As an Investor, I want to type my code as it is printed, `K7QM 4PXA`, so that the space the farm printed doesn't lock me out.
2. As an Investor, I want a mistyped space not to count against me as a wrong guess.

### The Portal Preview

3. As the Owner, I want a "See as they do" button in the Portal section of an Investor's page, so that I can check their portal before I invite them.
4. As the Owner, I want the preview to work for any Investor on file, at any standing and with the portal open or shut, so that it's useful before the invitation and in front of the lawyer.
5. As the Owner, I want to move through the Investor's real pages in the preview: portfolio, Venture, money, papers, Ventures raising capital and account. That way I check the real thing, not a lookalike.
6. As the Owner, I want a band on every preview page that I can't dismiss, naming whose portal it is and with "Back to <name>". Then I never mistake it for my own app.
7. As the Owner, I want every act in the preview dimmed and saying "Only <name> can do this, from their own sign-in", so that nothing I do there reaches them.
8. As the Owner, I want to see their Requests to Join as they read them, so that I know what they see. I answer them from my own side.
9. As the Owner, I want the account page in the preview masked exactly as they see it, so that I can check their record reads right before I hand over the letter.
10. As the Owner, I want a paper opened in the preview to be my own Export, noted as made in their preview, so that the trail is true and their activity is not padded.
11. As an Investor, I want my "last in" hour and my read papers left untouched by the Owner's preview, so that my activity is mine.
12. As the Owner, I want the preview's language and theme switches to work, and "Back to <name>" in place of Sign out. Then I can check both languages without signing myself out.
13. As the farm, I want the preview reachable by the Owner alone, from a personal sign-in, and by no Investor even for their own id, so that it opens no door.

### Consent and the notice as wording the farm keeps

14. As the Owner, I want the consent sheet and the privacy notice kept as Templates with Versions, so that the lawyer's changes become edits, and each person's record says which wording they signed.
15. As the Owner, I want the standard consent and notice wording given to the farm the way the Agreement wording is, so that there's a starting text to send to the lawyer.
16. As the Owner, I want the notice's blanks (host, backup store, country, complaint wording) to be facts I fill in, so that a printed notice never shows an empty bracket.

### Portal Consent before any code

17. As the Owner, I want the invite dialog to print the consent sheet first, so that I have it signed before anything else.
18. As the Owner, I want to mark the consent signed today, so that the farm can prove it (s.5(4)).
19. As the farm, I want no code to exist until consent is recorded, so that nobody is ever in the portal without it.
20. As the Owner, I want an Investor invited before this existed to go through the same step before their next code.
21. As the farm, I want each recorded consent to be an Audit Event with the day, the wording's Version and who recorded it.

### The Welcome Letter and Code Slip

22. As the Owner, I want "Print the welcome letter" in the code dialog, so that the first invitation leaves with everything on one page.
23. As an Investor, I want a Bangla letter addressed to me on the farm's letterhead. It says what the portal shows and that nothing is signed or paid through it, and gives the steps, whom to call, that the farm never asks for my password, and the standing notice in both languages. Then I trust it and can follow it.
24. As an Investor, I want a QR code and printed address for the portal's front door, so that the address on my letter is the one I keep using.
25. As an Investor, I want my phone number printed in the letter and my code on a tear-off slip, so that a lost slip alone opens nothing.
26. As an Investor, I want the notice "আপনার তথ্য" on the back of the letter (or a second sheet), so that I'm told before I ever sign in.
27. As the Owner, I want "Print the slip only" for every later code (one that ran out, or a forgotten password), so that I don't reprint a letter they already have.
28. As the farm, I want every letter or slip printed to be an Export that never holds the code.

### Withdrawal

29. As the Owner, I want Take away to ask why: they withdrew their consent, a lost phone, or my own decision. Then the record says which.
30. As the farm, I want a withdrawal to record the day and how they asked (a letter, or a message from their number), and to mark their consent withdrawn.
31. As the Owner, I want a withdrawn consent never to count again, so that coming back means signing afresh.

### "আপনার তথ্য"

32. As an Investor, I want a "আপনার তথ্য" page I can read before and after signing in, so that I know how the farm keeps my data before I choose a password.
33. As an Investor, I want it linked after the notice on every page and from my account page.

### "খামারে আপনার তথ্য"

34. As the Owner, I want to make one unmasked paper of everything the farm holds on an Investor, with the notice's points first, so that a written request for a copy is answered in minutes.
35. As the farm, I want that paper to be an Export, Owner-only, and never made in the portal.

### The Agreement

36. As the Owner, I want the Investment Agreement's standard wording to gain a data section and nominee lines as a new Version, so that every Agreement signed from now on tells the Investor about their data.
37. As the Owner, I want to print the notice beside the Agreement at signing, so that every Investor gets it, invited or not.

### The own address

38. As an Investor, I want to reach the portal at `investors.<farm-domain>`, so that the address on my letter is short and mine.
39. As an Investor, I want the bare address to open the portal's sign-in.
40. As anybody, I want `/portal/...` on the farm's address to send me to the same page on the Investor address.
41. As an Investor who signs in on the farm's address, I want to be told my own address with a link, once my password is right.
42. As staff who sign in on the Investor address, I want to be told the farm's address with a link, once my password is right.
43. As the farm, I want only the portal's pages and calls served on the Investor address, so that strangers there never reach the staff app.
44. As the farm, I want a portal page never able to call the farm address's sign-in with the Owner's cookie.
45. As the Owner, I want to be signed in to the farm and to see an Investor's portal in the same browser without either signing the other out.

### Nothing kept on the phone

46. As an Investor on a shared phone, I want nothing of the portal kept after I sign out, so that the next person to use the phone reads nothing of mine.
47. As an Investor, I want a sign-in that has run its 12 hours to wipe the same way on my next visit.
48. As an Investor with no signal, I want to be told there is no connection rather than shown old figures.
49. As an older Investor, I want "Add to home screen" to still give me an icon.

## Implementation Decisions

### The code as printed

- `takeUpInvitation` already trims and upper-cases. It also strips whitespace inside the code, before hashing and before the attempt is counted.

### The Portal Preview

- **Server:** Owner-only reads (`requireOnly("owner", OWNER_ONLY)` and a personal session) that take an `investorId` and return exactly what the matching `portal.*` read returns for that Investor. They call the same store functions with the Investor's id.
- **What they never touch:** `investorProcedure`, `markSeen` or any session.
- **What they return:** the same masked shapes. They never add an Owner-only field.
- **Papers:** a paper in the preview uses the Owner's existing paper path (`investor-statements`). It is attributed to the Owner, and the audit note says it was made in that Investor's preview. The Investor's activity reads only exports whose actor is the Investor's user, so it never lists one.
- **Web:** the portal pages take their answers from a source (the Investor's own, or the preview's for one Investor) rather than calling `orpc.portal.*` directly. The shell and sidebar do the same. There is one page component per portal page, not a copy.
- **Route:** under the Investor's page, e.g. `/investors/$investorId/as-they-see-it/...`, inside the Owner's app.
- **The band:** a fixed element above the shell. The user menu's Sign out becomes "Back to <name>".
- **Acts:** every act (password, sign other devices out, request, change, withdraw) is disabled, with the "Only <name> can do this" reason, in the app's existing dim-act pattern.

### Templates for consent and notice

- `TEMPLATE_KINDS` gains `portal_consent` and `privacy_notice`, each with its fixed fields.
- Standard wording comes from the map's drafts: [`07-portal-consent-sheet-draft.md`](../openfarm-investor-portal/assets/07-portal-consent-sheet-draft.md) and [`06-your-data-notice-draft.md`](../openfarm-investor-portal/assets/06-your-data-notice-draft.md). It is given lazily, as `giveStandardTemplates` does.
- The notice's blanks become farm facts the Owner fills in: host name, backup store name and its country. The complaint wording is part of the Version, so the lawyer edits it there.
- Until they are filled, the notice's print and page say what is missing to the Owner. The Investor side shows no blank bracket.

### Portal Consent

- Consent is recorded on `investor_access`:
  - the consent Version id
  - signed on (a day)
  - recorded by
  - withdrawn on
  - how the withdrawal came (`letter` / `message`)
- A new consent replaces the old one only after a withdrawal or a Take away. Every change is an Audit Event.
- `inviteToPortal` refuses without a current, unwithdrawn consent. A code is never made before it.
- **Dialog order:** print consent → "They signed it today" → the code and the print buttons. An existing access with no consent goes through the same step before a new code.

### The Welcome Letter and Code Slip

- Printed through the existing `printAlone` from the code dialog, while the code is in memory. There is never a route that re-renders a code.
- **The letter:** variant A of the prototype (branch `prototype/welcome-sheet`), with the settled order, and the notice Template on the back or a second page.
- **The slip:** the bottom strip alone.
- **The QR** is drawn from the portal's address, read from one place. It is the current origin's `/portal` until ticket 10 sets the Investor address.
- **Each print** writes an `export` Audit Event: welcome letter or code slip, for whom, by whom. It never holds the code.

### Withdrawal

- `takePortalAway` takes a reason: `withdrew_consent` / `lost_phone` / `owner` / other. Only `withdrew_consent` marks the consent withdrawn, and it takes the day and how they asked.
- Taking access away still closes no Request to Join.

### "আপনার তথ্য"

- A portal route outside `_in`, open without a session, rendering the notice Template's current Version with the farm's facts.
- **Links:** after `PortalNotice` on every portal page, on the account page, and on the sign-in and join pages.

### "খামারে আপনার তথ্য"

- An Owner-only paper from the Investor's page:
  - the notice's points first
  - the record, unmasked
  - Agreements
  - Venture Movements carrying their money
  - papers made for them
  - Requests to Join and their changes
  - portal access, consent and activity
  - the Audit Events that changed their record
- It is an `export` Audit Event on the Investor.

### The Agreement's data clause

- A new Version of `investment_agreement` in the standard templates, with the "তথ্য / Data" clauses section and the nominee lines from [`07-agreement-data-clause-draft.md`](../openfarm-investor-portal/assets/07-agreement-data-clause-draft.md).
- Old Agreements stay pinned to their own Version, as they are today.
- The under-18 line prints every time, to be struck through.
- The Agreement's print dialog offers the notice beside it. That print is an Export.

### The own address

- A `PORTAL_URL` environment value (e.g. `https://investors.farm.tld`). When it is unset, the portal stays at `/portal` on the one origin, as today, so development and existing deploys keep working.
- **better-auth:** it answers on both hosts. This uses the per-request (object) `baseURL`, checked against the installed 1.7.3 before building; if it does not fit, a second instance is used instead.
- **Trusted origins and the RPC door:** each is kept per host. A request arriving on the farm host accepts only the farm origin, and the Investor host only its own.
- **The door:** `turnAwayWhoseDoorIsShut` also checks the host. An Investor on the farm host, or anyone with a Role on the Investor host, is signed out again and told their address. As now, this happens only after the password is right.
- **Paths:** on the Investor host, only these are served:
  - `/portal/*` and `/`
  - the assets
  - the sign-in, sign-out, session and password routes of `/api/auth`
  - `/api/rpc/portal/*`, `people/me` and `language/*`

  Everything else is 404. On the farm host, `/portal/*` answers a permanent redirect.

- **CSP:** a strict policy on the Investor host.
- **Development:** `investors.localhost` on the dev port.
- **Deploy:** the runbook gains the nginx server block and the certificate for the second name.

### Nothing kept on the phone

- On the Investor host:
  - `keptOnDevice` answers false
  - no service worker is registered, and an existing one is unregistered
  - sign-out responds with `Clear-Site-Data: "cache", "cookies", "storage"`
- **After 12 hours:** the ended-sign-in path (`signInHasRunItsDay` → login with `ended`) sends the same header.
- **The manifest stays**, so Add to home screen works.
- **With no connection,** the portal shows "no connection" rather than cached figures.

## Testing Decisions

- **Preview:**
  - Owner-only: an Investor's own session gets FORBIDDEN, even for their own id.
  - Each preview read returns the same answer as the Investor's own read, compared whole.
  - `lastSeenAt` and the Investor's activity are unchanged after a preview and a paper.
  - **Prove the guard by switching it off.**
- **Consent:**
  - `inviteToPortal` refuses without consent, and refuses with a withdrawn one.
  - The Audit Events name the Version and never the code.
- **Letter and slip:** the Export's Audit Event never contains the code. Assert on `util.inspect` of what is logged and stored, not JSON.
- **The join:** a spaced code is accepted, and a mistyped one still counts as a single attempt.
- **Own address:**
  - For each host: the door's turn-away, the 404 for staff paths on the Investor host, and the redirect on the farm host.
  - `/api/auth` on the farm host refuses a request whose origin is the Investor host.
  - All of these are integration tests against the running handler.
- **Wipe:**
  - The sign-out and ended-sign-in responses on the Investor host carry `Clear-Site-Data`; the farm host's never do.
  - `keptOnDevice` is false for every query on the Investor host.
- **Every ticket ends with somebody opening the page**, at phone width for the portal's pages. Web component tests are not collected.

## Out of Scope

- **Anything the lawyer's written opinion changes.** It comes in as Template Versions and, if needed, a new map.
- **The farm's go-live itself:** domain, DNS, certificates, the server. Ticket 10 only adds the runbook's lines.
- **A breach plan.** It is still in the portal map's Not yet specified.
- **Notifications to Investors, and paying or signing in the portal.**
- **The Master Agreement and Venture Schedule** taking the data section. They get it when they are built.

## Further Notes

- **Two concepts, one spelling:** the Investor's own "last in" and the preview's reading are different questions. Don't let the preview reuse `investorProcedure` for convenience.
- **The Welcome Letter prototype** is on branch `prototype/welcome-sheet` (`apps/web/src/prototype/welcome-sheet.tsx`, variant A). It uses `uqr` for the QR, which is not yet a dependency on main.
- **Write copy both ways at once:** `bn` and `en` go in together, and numbers in Bangla sentences are worded where the string is built.
