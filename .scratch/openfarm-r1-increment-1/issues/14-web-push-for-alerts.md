# 14 — Web push for Alerts

**What to build:** Overdue and escalation Alerts reach the Manager's and Owner's installed PWA by web push, in the recipient's language, with the in-app Alert as the fallback when push is unavailable. Users grant permission from a settings screen; the farm's push keys are provisioned as configuration. Digests, quiet hours and SMS are out of this ticket (increments 2 and 3).

**Blocked by:** 10

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 1.

- [ ] A user can enable push from settings; the subscription is stored per device and revoked on device removal
- [ ] An Overdue Alert and an escalation Alert are delivered by push to subscribed recipients and also appear in-app
- [ ] Message text follows the recipient's language setting
- [ ] Sending is recorded as an Audit Event on the Alert; delivery failures fall back to in-app without error to the user
- [ ] Tests assert the push payload and recipients through a fake push transport
