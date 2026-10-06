# Survey of people, wages and devices, 2026-10-07

Three reviewers each took one part: people, Roles and Membership; wages and Wage Draws; devices and Shed Phones. Each finding is marked:

- **Proven:** a temporary test went red against main at 4516309c, and the file was then deleted.
- **Traced:** read line by line through the code.

## A. PINs and Shed Phones

1. **Proven, high.** PIN guesses fired all at once get past the five-guess lockout. The lockout is checked before the slow PIN check, and a failure is counted only after it. In the test, 60 guesses at once found the right PIN in 568 ms, so all 10,000 PINs take about two minutes. `routers/devices.ts:230-251`. This is the same race fixed for portal codes on 2026-10-06 (`takeBackOne`).
2. **Proven, low-medium.** Resetting a PIN does not end the stint opened with the old one: `keepAwake` keeps it alive. `membership.ts:443-480`, `device.ts:174-193`.
3. **Proven, medium-low.** A phone revoked while someone is switched in is told so only at its next PIN. Everything else gets a bare UNAUTHORIZED, so the Outbox pauses as "signed out" and the screen shows the person still working. `index.ts:9-19`, `lib/shed-phone.ts`, `lib/outbox.ts:581-583`.
4. **Proven, low-medium.** Enrolment refusals ("That code is not valid", "Too many wrong codes…") reach a Bangla reader in English, with no refusal word. `routers/devices.ts:122-173`.
5. **Traced, low.** Lock closes every stint on the phone, and its request is not waited on. It can land after the next person's switch and end their stint. `device.ts:197-206`, `shed-phone.tsx:386-387`.
6. **Traced, medium.** With no signal, the PIN pad allows unlimited guesses against its cached list. `shed-phone.tsx:270-274`.
7. **Traced, low.** The lockout is counted per phone and person, so each extra Shed Phone gives five more guesses. `devices.ts:230`.
8. **Owner.** Any four digits make a PIN, so 0000 and 1234 are allowed. `membership.ts:427-435`.

## B. When somebody leaves

1. **Proven, high.** A disabled person still counts as holding their Role. A notice for the farm's only Vet or Manager, once disabled, goes to nobody, and the Owner fallback added on 2026-10-06 never fires. `alerts-store.ts:20-36`.
2. **Proven, high.** When the Owner signs a session out from the People page, that phone keeps receiving the farm's pushes, because subscriptions are not tied to a session. `membership.ts:319-341`, `push-store.ts:25-53`.
3. **Proven, medium.** Work can be pinned to someone disabled. Work pinned to or claimed by someone who is later disabled, or who loses the Role, is refused to everyone else, the Manager included, until it is reassigned. Pen Assignments outlive Staff, so former Staff still get Pen notices. `routers/work.ts:526-597`, `completion-store.ts:126-131`.
4. **Proven, medium.** Shed Phone work recorded offline before someone was disabled is refused when it syncs: "no longer works on this farm". `routers/sync.ts:80-96`.
5. **Proven, medium.** A re-enrolled phone refuses its earlier users' unsent work: the switch token's phone id no longer matches. Only whoever switches in first keeps theirs. `routers/sync.ts:42-62,100-107`.
6. **Traced, medium.** Rotating a PIN while another phone is offline gets the person's work on that phone refused on its proof. `lib/shed-phone.ts:58-63`.

## C. Wages

1. **Proven, high.** One name typed on two Bangla keyboards counts as two people, because য় can be one code point or two. A wage is then paid twice in a month, and a draw is not taken off at payday. The counterparty matching never NFC-normalises; the Entered Twice check does. `counterparty-store.ts:19`, `domain/money.ts:69`. The web's payday note also matches names case-sensitively. `wage-draws.tsx:449`.
2. **Proven, high.** A wage over the Approval Threshold escapes the Owner after an ordinary early-month draw. Payday books the net amount, and the line is checked against that. Example: a 25,000 wage with a 6,000 draw books 19,000 and needs nobody. `routers/money-entries.ts:565`, `money-store.ts:838-875`.
3. **Proven, medium.** The same draw written twice is kept, and payday takes both. Draws never ask Entered Twice. `routers/money-entries.ts:592`.
4. **Proven, medium.** A Dairy wage shows partly as Dairy and partly as whole farm, because a draw has no Side. `wage-draw-store.ts:110-145`, `money-export-store.ts:454-457`.
5. **Traced, low.** The full wage appears nowhere, only its net and the draws apart.
6. **Owner.** Wages are free text with no staff list behind them. There is no draw cap, no casual-labour Category, no write-off for a leaver's draws, and no void-and-re-enter route for a wage already netted.

## D. Invitations and words

1. **Traced, medium.** An invitation can never be withdrawn and never expires, and while it is open anyone can sign up at that address. `INVITE_STATUSES` includes `revoked`, but nothing writes it.
2. **Proven, medium.** An Investor changing language writes a `user` Audit Event that the Manager reads, which tells him who has a portal account. `routers/language.ts:27-45`, `whose-trail.ts`.
3. **Proven, medium.** Refusals on the join and forgotten-password screens reach a Bangla reader in English. So do several membership refusals ("You cannot disable yourself", "The farm must keep at least one other Owner"…). `routers/people.ts:434-470,691-724`, `membership.ts:89,215,258,573,636`.

## Checked and holding

- A disabled person is refused at request time, at sign-in, on the roster and at PIN Switch.
- Expired Vet visits are filtered per request.
- Invite codes are one-time.
- A Manager reaches PINs, codes and sessions for Staff only.
- An Owner cannot remove their own Owner Role, and the farm always keeps one.
- Investors are the Owner's alone.
- A Shed Phone holds Staff alone.
- `keepAwake` no longer revives a locked stint.
- A month's wage cost is whole, and dated on the farm's day.
- Wages are never Herd Costs and never in a Venture's purse.

## Decisions (the Owner, 2026-10-07)

- Build all four groups.
- B4/B5: Shed Phone work recorded before someone was disabled, or left unsent on a phone since re-enrolled, is kept as theirs when it was done inside a stint they proved.
- B3: disabling someone releases their work. Work pinned to or claimed by them goes back to the pool, and their Pen Assignments end. Restoring them gives back their Roles, not those.
- D1: an invitation can be withdrawn, and it lapses after 14 days. Either way, the address may be invited again.

Defaults taken without asking, as the obvious reading:

- A8: a PIN of one repeated digit, or a straight run such as 1234 or 9876, is refused.
- A6: the PIN pad counts wrong guesses offline too, five per person per phone for 15 minutes, as the farm does.
- B2: a push subscription is tied to the session it was made in. Signing that session out ends the subscription.
- C2: payday's approval is judged on the whole wage, net plus draws taken. C3: a draw asks Entered Twice like any hand entry. C4: a draw takes a Side, as the wage does.
- D2: Audit Events by someone who holds no farm Role, such as an Investor, are the Owner's alone.

## Status

| Group | Branch | Status |
| ----- | ------ | ------ |
| A     |        |        |
| B     |        |        |
| C     |        |        |
| D     |        |        |
