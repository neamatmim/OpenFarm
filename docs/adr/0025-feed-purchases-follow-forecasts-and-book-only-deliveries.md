# Feed purchases follow forecasts and book only deliveries

Supplier credit and payment recording are extended by [ADR 0026](0026-suppliers-keep-invoices-and-credit-separate-from-cash.md): deliveries retain their full feed value, while money events represent only actual payments.

Date: 2026-10-11

The farm needs to act on the quantities its monthly estimate and animal feeding plans say to buy. A request is one feed from one supplier, assigned to an active owner or manager. It keeps the forecast's month, basis, scenario and a server-read snapshot beside the requested quantity, quote, spending ceiling, need date, supplier lead time and safety buffer. Manual requests are also allowed.

The manager or owner submits a request. On a personal session, the owner approves its quantity and maximum spend. The owner or manager records an order actually placed with the supplier, including its reference and promised arrival date. The ordering deadline is the need date less delivery time and safety buffer. Pending requests and approvals are shown when requesting the same feed; only placed orders due by the need date that are not already late or over budget reduce the suggested forecast request. Promised deliveries remain distinct from actual stock.

Each partial delivery goes through `stock.receive`, linking its ordinary arrival and money event to the order in one audited transaction. Actual scale quantity takes precedence over the supplier's slip. Feed, supplier and date must match the order. The remaining approved quantity and spending ceiling are enforced using live arrivals under an order lock. Orders and corrections take the farm lock before their order or arrival locks, so competing deliveries and corrections cannot spend the same remaining allowance. Duplicate delivery and request identifiers create a single record and audit event.

The owner may revise an approval with a reason; the audit trail retains its previous terms. Approval cannot fall below what has already arrived or been spent. Declining, cancelling or closing requires a reason; none removes earlier deliveries or their spending. Managers may withdraw their own unapproved requests; ending approved orders is the owner's decision. Closed purchases are retained, and the screen shows the latest 100 ended purchases alongside every active request.

Arrival corrections retain the ordinary correction windows, settlement protections and audit reasons. Managers cannot correct a delivery beyond its approval. An owner may record the facts even when they exceed it: the discrepancy remains visible and further deliveries stay bounded. The owner may revise an approval to acknowledge an overrun on a closed or cancelled order without reopening it. Voiding or correcting an arrival immediately changes the order's remaining quantity and actual cost.

The owner and manager home screens show pending approvals, ordering deadlines, late deliveries and corrected overruns. These are in-app prompts; this feature does not send supplier orders or external reminders. Purchasing actions require a connection to protect approvals and shared limits. Existing offline shed work continues separately.

## Addendum, 2026-10-13

The request, approval and order this ADR describes are a **Feed Order** in `CONTEXT.md`, and the Feed page calls them
«Feed orders». **Feed Purchase** keeps its one meaning: the feed that came. The glossary had defined Feed Purchase twice, once
for each.
