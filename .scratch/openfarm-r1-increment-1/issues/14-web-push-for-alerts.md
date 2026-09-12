# 14 — Web push for Alerts

**What to build:** Overdue and escalation Alerts reach the Manager's and Owner's installed PWA by web push, in the recipient's language, with the in-app Alert as the fallback when push is unavailable. Users grant permission from a settings screen; the farm's push keys are provisioned as configuration. Digests, quiet hours and SMS are out of this ticket (increments 2 and 3).

**Blocked by:** 10

**Status:** done

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 1.

- [x] A user can enable push from settings; the subscription is stored per device and revoked on device removal
- [x] An Overdue Alert and an escalation Alert are delivered by push to subscribed recipients and also appear in-app
- [x] Message text follows the recipient's language setting
- [x] Sending is recorded as an Audit Event on the Alert; delivery failures fall back to in-app without error to the user
- [x] Tests assert the push payload and recipients through a fake push transport

**How it was built.** The in-app Alert is the farm's record; Push is the tap on the shoulder. Everything follows from that: a push that does not arrive costs nobody anything, so every failure along the way is swallowed on purpose and nothing is put in front of the person who was going to be told.

Decisions worth remembering:

- **Per browser, not per person.** A Manager with a phone in the yard and a machine in the office says yes on both and hears about late work wherever they are. A Shed Phone's subscription is tied to the phone, so revoking the phone takes its voice with it (ADR 0003).
- **The message is written in the reader's language, on the server.** The farm knows who it is speaking to; the browser does not. A Vet who reads English and a milker who reads Bangla get the same news in different words, and a message nobody can read is a message nobody acts on.
- **A browser the push service says is gone stops being told**, and its row stays revoked rather than being deleted: who was told what, and who stopped being told, is part of the farm's record.
- **A farm with no push keys does not push**, and nothing above notices. Development and the tests run silent; the transport is injected, so the tests watch what would have left the farm.
- **One notice per thing per kind.** A phone that has been in a pocket all morning should show what is waiting, not a history of being told, so each notice carries a tag that replaces the last.
- Sending is recorded on the sweep's own Audit Event — how many left, how many were refused, how many browsers turned out to be gone — so "we told them" is something the trail can show.

Digests, quiet hours and SMS stay where the map put them, in increments 2 and 3.

**Review outcomes folded in (follow-up commit).** Two of these were security holes, and one was a hole in the audit trail that has been open since ticket 12.

- **Anyone could write over anyone else's browser.** A subscription was keyed on the endpoint alone, farm-wide, and `listen` upserted onto it without asking whose it was. Knowing an endpoint — and `listen` was writing endpoints into the audit trail, which Owners and Managers can read — was enough to silently stop somebody being told, and to leave the farm telling the wrong person its business. The key is now the Farm and the endpoint together, a browser already listening for somebody else is refused, and the trail names the subscription rather than the address.
- **The endpoint was somewhere this farm's server could be pointed.** It is the server that does the POSTing, so an unchecked URL is a staff member aiming it at a cloud metadata service or a machine on the office network. It has to be a push service on the open web, over TLS.
- **`recordEvent` never wrote the snapshot it was handed.** Every Audit Event written on a caller-held transaction — which is every entry in every batch a phone has ever sent (ticket 12) — recorded that something happened without recording what. It reads the event's own `before` and `after` now.
- **A revoked Shed Phone was told the farm's business for ever.** Revoking set the phone's own flag and nothing else, and the push lookup never asked. Revoking silences its browsers, and the lookup asks anyway — one lock on the door is not enough for a handset lost in a yard.
- **A push went out inside the transaction that raised the Alert**, holding a lock every phone in the shed waits on across a call to somebody else's server, and buzzing pockets about work that might still roll back. It goes out afterwards, with its own timeout, and a service that will not answer cannot fail a request.
- **A send-back never reached the doer's pocket**, though the notification table says immediate; and the sweep leaked every recipient's id and the Alert params to any caller.
- Also: a second sweep could tell somebody the same thing twice, because what was pushed was built from what was _intended_ rather than from what was actually written; the worker announced English words as Bangla; a malformed key would have failed every request in the process rather than simply not pushing; and declining the permission was raised as an error to the person declining it.

**The test suite now runs one file at a time.** Every test here runs against one real database holding one Farm — which is the point, because the rules being tested are rules about a farm. But a farm has farm-wide state, and two files running at once fight over it: one tunes the escalation window while another times an escalation, one sweeps the Alert watermark into a fake year another is working in, one takes the Tag Number a third expected. Those were real flakes and none of them were bugs in the farm. The suite takes twenty seconds instead of seven and says the same thing every time, which is the trade worth making for tests anybody is meant to believe.
