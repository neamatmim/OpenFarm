# 33 — SMS for the two safety Alerts

**What to build:** Two Alerts are worth a text message as well as a push: a Withdrawal ending, and a notifiable Diagnosis. Both cost money or break a legal deadline if they are missed, and a push that does not arrive has cost nobody anything — which is fine for the rest, and not fine for these two. The gateway is injected the way web push is, so the farm's own provider is configured at go-live and the path is built and tested before the account exists. Confirmed with the Owner 2026-09-12.

This also closes the last row the notification table still owes: sync problems reach the person whose entries were rejected, immediately.

**Blocked by:** 29, 32

**Status:** ready-for-agent

**Spec:** [OpenFarm Release 1 spec](../../openfarm-release-1/spec.md) — increment 3, user story 92; [Notification channels](../../openfarm-release-1/issues/23-notification-channels.md).

- [ ] An SMS transport is injected like the push one, silent by default, with the farm's gateway configured at go-live
- [ ] Withdrawal ending and a notifiable Diagnosis go by SMS to the Manager and the Owner, on top of push and in-app
- [ ] Nothing else goes by SMS, and the farm's delivery table is still the one place that decides
- [ ] A rejected entry tells the person who recorded it, immediately, in the app
- [ ] Tests watch the gateway and assert what was sent, to whom, and in which language
