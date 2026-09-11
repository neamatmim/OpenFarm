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
