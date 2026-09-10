# Notification channels

Status: resolved

Type: grilling

Blocked by: 17

Map: [OpenFarm Release 1](../map.md)

## Question

**Grilling.** [Shape of an SOP](./05-shape-of-an-sop.md) decided the Manager is _alerted_ when an instance goes overdue, and that withdrawal gates block milk and sale. Decide how people are told:

- Channels in R1: in-app only, push notifications (depends on the packaging chosen in [Offline capture and sync decision](./17-offline-capture-and-sync-decision.md)), SMS, WhatsApp?
- Which events notify whom: overdue instance → Manager; sent-back instance → doer; withdrawal ending → Manager/milkers; expected calving approaching; DLS renewal due; low feed stock.
- Quiet hours, batching (one morning digest vs immediate), and language of the message.
- Cost/ownership if SMS or WhatsApp: which provider, who pays.

Resolved when the channel list, the event→recipient table, and delivery rules are written down.

## Answer

Decided with the Owner on 2026-09-10.

### Channels

**In-app + web push** (installed PWA) for everything. **SMS in addition, only for the two safety-critical alerts** — _withdrawal ending_ and _notifiable diagnosis_ — to the Manager and Owner, via a local Bangladeshi SMS gateway; the farm pays the (small) bill. No WhatsApp in R1.

### Event → recipient

| Event | Recipients | Timing |
| --- | --- | --- |
| Instance overdue | Manager (+ assignee) | immediate |
| Overdue still open after 2 h (parameter) | **+ Owner** (escalation, one rung) | immediate |
| Instance sent back | doer | immediate |
| Instance claimed / reassigned | new assignee | digest |
| Withdrawal ending tomorrow | Manager + milkers of that Pen | immediate + **SMS** |
| Withdrawal set / shortened | Manager | immediate |
| Notifiable diagnosis (DLS letter SOP raised) | Manager + Owner | immediate + **SMS** |
| Expected calving in 7 days / dry-off due | Manager | digest |
| Repeat Breeder flag | Manager + Vet | digest |
| Low feed stock | Manager | digest |
| Money Event awaiting approval | Owner | digest |
| SOP proposal | Owner | digest |
| New SOP Version published | everyone in the assigned role | digest |
| DLS renewal due (90 days) | Owner | digest |
| Needs-review entries | Manager | digest |
| Sync paused — login needed / entries rejected | that user | immediate |

### Delivery rules (farm parameters)

Safety and overdue alerts **immediate**; everything else in a **morning digest (06:00)** and **evening digest (18:00)**. **Quiet hours 22:00–05:00**, safety alerts excepted. Message language follows the recipient's language setting. Every notification is also visible in-app until dismissed.

### Assumed — correct me if wrong

- When a new SOP Version is published, the first instance a person opens on it carries a "changed" marker with what changed; no separate acknowledgement step in R1.
- SMS gateway choice (e.g. a local provider with BDT billing) is an implementation detail; credentials held by the Owner.

### Consequences

- Roles: notification preferences are per user within what the table allows; nobody can opt out of safety alerts.
- Backups/DR: the SMS gateway is an external dependency to list.
