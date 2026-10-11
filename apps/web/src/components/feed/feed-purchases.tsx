import { feedUnitWord } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Badge } from "@OpenFarm/ui/components/badge";
import { Button } from "@OpenFarm/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { ShoppingCart } from "lucide-react";
import { useState } from "react";

import { EmptyState, Loaded, Notice, Section } from "@/components/page";
import { FormField, NativeSelect } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useMoney } from "@/lib/money";
import { namesIn } from "@/lib/names-in";
import { orpc } from "@/utils/orpc";

import type { FeedPurchase, PurchaseAction } from "./feed-purchase-actions";
import {
  PurchaseApprovalSheet,
  PurchaseEndSheet,
  PurchasePlaceSheet,
} from "./feed-purchase-actions";
import { PurchaseRequestSheet } from "./feed-purchase-request";
import type { FeedItemRow } from "./feed-types";
import { PurchasePrintButton } from "./purchase-paper";
import { ReceiveFeedSheet } from "./receive-feed-sheet";

const ApprovedPurchasePaper = ({ order }: { order: FeedPurchase }) =>
  order.approvedAt &&
  ["approved", "ordered", "closed"].includes(order.state) ? (
    <div className="mt-3">
      <PurchasePrintButton id={order.id} />
    </div>
  ) : null;

const PurchaseRowActions = ({
  order,
  owner,
  myId,
  onAction,
  onReceive,
}: {
  order: FeedPurchase;
  owner: boolean;
  myId: string;
  onAction: (action: PurchaseAction) => void;
  onReceive: () => void;
}) => {
  const { t } = useLanguage();
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {owner && order.state === "requested" ? (
        <>
          <Button size="sm" onClick={() => onAction("approve")}>
            {t("purchasing.approve")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAction("rejected")}
          >
            {t("purchasing.action.rejected")}
          </Button>
        </>
      ) : null}
      {order.state === "approved" ? (
        <Button size="sm" onClick={() => onAction("place")}>
          {t("purchasing.place")}
        </Button>
      ) : null}
      {order.state === "ordered" && order.remaining > 0 ? (
        <Button size="sm" onClick={onReceive}>
          {t("purchasing.receive")}
        </Button>
      ) : null}
      {owner && order.state !== "requested" ? (
        <Button size="sm" variant="outline" onClick={() => onAction("approve")}>
          {t("purchasing.revise")}
        </Button>
      ) : null}
      {owner && order.state === "ordered" ? (
        <Button size="sm" variant="outline" onClick={() => onAction("closed")}>
          {t("purchasing.action.closed")}
        </Button>
      ) : null}
      {owner || (order.state === "requested" && order.requestedBy === myId) ? (
        <Button size="sm" variant="ghost" onClick={() => onAction("cancelled")}>
          {t("purchasing.action.cancelled")}
        </Button>
      ) : null}
    </div>
  );
};

const HistoricalOverrunAction = ({
  order,
  owner,
  onAction,
}: {
  order: FeedPurchase;
  owner: boolean;
  onAction: (action: PurchaseAction) => void;
}) => {
  const { t } = useLanguage();
  return !["requested", "approved", "ordered"].includes(order.state) &&
    owner &&
    (order.overBudget || order.overQuantity) ? (
    <Button
      className="mt-3"
      size="sm"
      variant="outline"
      onClick={() => onAction("approve")}
    >
      {t("purchasing.revise")}
    </Button>
  ) : null;
};

const PurchaseRow = ({
  order,
  owner,
  myId,
  onAction,
  onReceive,
}: {
  order: FeedPurchase;
  owner: boolean;
  myId: string;
  onAction: (action: PurchaseAction) => void;
  onReceive: () => void;
}) => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  const active = ["requested", "approved", "ordered"].includes(order.state);
  const delivered = order.state === "ordered" && order.remaining === 0;
  return (
    <article className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-medium">{namesIn(order, language).shown}</h3>
          <p className="text-muted-foreground text-sm break-words">
            {order.supplierName}
            {order.supplierPhone ? ` · ${order.supplierPhone}` : ""}
          </p>
        </div>
        <Badge
          variant={
            order.orderLate ||
            order.deliveryLate ||
            order.overBudget ||
            order.overQuantity
              ? "destructive"
              : "secondary"
          }
        >
          {t(
            delivered
              ? "purchasing.state.delivered"
              : `purchasing.state.${order.state}`
          )}
        </Badge>
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">{t("purchasing.quantity")}</dt>
          <dd className="tabular-nums">
            {formatNumber(order.quantity, language)}{" "}
            {feedUnitWord(order.unit, language)} ·{" "}
            {t("purchasing.received", {
              quantity: formatNumber(order.received, language),
            })}
            <p className="text-muted-foreground">
              {t("purchasing.remaining", {
                quantity: formatNumber(order.remaining, language),
              })}
            </p>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("purchasing.budget")}</dt>
          <dd className="tabular-nums">
            {asMoney(order.budgetMoney)} ·{" "}
            {t("purchasing.spent", { money: asMoney(order.spentMoney) })}
            <p className="text-muted-foreground">
              {t("purchasing.budgetLeft", {
                money: asMoney(order.budgetLeftMoney),
              })}
            </p>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("purchasing.assignee")}</dt>
          <dd>{order.assigneeName}</dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span>{t("purchasing.orderBy", { day: order.orderBy })}</span>
        <span>
          {t("purchasing.neededOn")}: {order.neededOn}
        </span>
        {order.deliveryDueOn ? (
          <span>
            {t("purchasing.deliveryDue")}: {order.deliveryDueOn}
          </span>
        ) : null}
      </div>
      {order.orderLate && active ? (
        <p className="text-warning mt-2 text-sm">{t("purchasing.orderLate")}</p>
      ) : null}
      {order.deliveryLate ? (
        <p className="text-warning mt-2 text-sm">
          {t("purchasing.deliveryLate")}
        </p>
      ) : null}
      {order.overQuantity || order.overBudget ? (
        <Notice tone="warning" title={t("purchasing.correctedAboveLimits")} />
      ) : null}
      {order.note ? (
        <p className="text-muted-foreground mt-2 text-sm break-words">
          {order.note}
        </p>
      ) : null}
      {order.endReason ? (
        <p className="mt-2 text-sm break-words">
          {t("purchasing.reason")}: {order.endReason}
        </p>
      ) : null}
      {active ? (
        <PurchaseRowActions
          order={order}
          owner={owner}
          myId={myId}
          onAction={onAction}
          onReceive={onReceive}
        />
      ) : null}
      <ApprovedPurchasePaper order={order} />
      <HistoricalOverrunAction
        order={order}
        owner={owner}
        onAction={onAction}
      />
      <details className="mt-3 text-sm">
        <summary className="text-muted-foreground cursor-pointer">
          {t("purchasing.history")}
        </summary>
        <div className="mt-2 flex flex-col gap-2">
          <p>
            {t("purchasing.requestedOn")}:{" "}
            {formatDate(order.requestedAt, language, "dateTime")} ·{" "}
            {t("purchasing.unitPrice")}: {asMoney(order.unitPriceMoney)}
          </p>
          {order.approvedAt ? (
            <p>
              {t("purchasing.approvedOn")}:{" "}
              {formatDate(order.approvedAt, language, "dateTime")}
            </p>
          ) : null}
          {order.orderReference ? (
            <p className="break-words">
              {t("purchasing.orderReference")}: {order.orderReference}
            </p>
          ) : null}
          {order.receipts.length ? (
            order.receipts.map((receipt) => (
              <p key={receipt.id} className="tabular-nums">
                {formatDate(receipt.receivedOn, language, "date")} ·{" "}
                {formatNumber(receipt.quantity, language)}{" "}
                {feedUnitWord(order.unit, language)} ·{" "}
                {asMoney(receipt.priceMoney ?? 0)}
              </p>
            ))
          ) : (
            <p>{t("purchasing.noReceipts")}</p>
          )}
        </div>
      </details>
    </article>
  );
};

export const FeedPurchasesTab = ({ items }: { items: FeedItemRow[] }) => {
  const { t } = useLanguage();
  const orders = useQuery(orpc.feedPurchasing.list.queryOptions());
  const me = useQuery(orpc.people.me.queryOptions());
  const [requesting, setRequesting] = useState(false);
  const [filter, setFilter] = useState("active");
  const [action, setAction] = useState<{
    order: FeedPurchase;
    type: PurchaseAction;
  } | null>(null);
  const [receiving, setReceiving] = useState<FeedPurchase | null>(null);
  const owner = me.data?.roles.includes("owner") ?? false;
  const rows = (orders.data ?? []).filter(
    (order) =>
      filter === "all" ||
      (filter === "approval"
        ? order.state === "requested"
        : ["requested", "approved", "ordered"].includes(order.state))
  );
  const needsApproval = (orders.data ?? []).filter(
    (order) => order.state === "requested"
  ).length;
  return (
    <Section
      title={t("purchasing.title")}
      description={t("purchasing.description")}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <FormField id="purchase-filter" label={t("purchasing.show")}>
          <NativeSelect
            id="purchase-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="active">{t("purchasing.active")}</option>
            <option value="approval">
              {t("purchasing.awaitingApproval", { count: needsApproval })}
            </option>
            <option value="all">{t("purchasing.all")}</option>
          </NativeSelect>
        </FormField>
        <Button
          onClick={() => setRequesting(true)}
          disabled={!items.some((item) => !item.retiredAt)}
        >
          {t("purchasing.request")}
        </Button>
      </div>
      <Loaded query={orders}>
        {rows.length ? (
          <div className="flex flex-col gap-3">
            {rows.map((order) => (
              <PurchaseRow
                key={order.id}
                order={order}
                owner={owner}
                myId={me.data?.id ?? ""}
                onAction={(type) => setAction({ order, type })}
                onReceive={() => setReceiving(order)}
              />
            ))}
          </div>
        ) : (
          <EmptyState icon={ShoppingCart} title={t("purchasing.empty")} />
        )}
      </Loaded>
      {requesting ? (
        <PurchaseRequestSheet items={items} open onOpenChange={setRequesting} />
      ) : null}
      {action?.type === "approve" ? (
        <PurchaseApprovalSheet
          order={action.order}
          onClose={() => setAction(null)}
        />
      ) : null}
      {action?.type === "place" ? (
        <PurchasePlaceSheet
          order={action.order}
          onClose={() => setAction(null)}
        />
      ) : null}
      {action &&
      (action.type === "rejected" ||
        action.type === "cancelled" ||
        action.type === "closed") ? (
        <PurchaseEndSheet
          order={action.order}
          outcome={action.type}
          onClose={() => setAction(null)}
        />
      ) : null}
      {receiving ? (
        <ReceiveFeedSheet
          items={items}
          purchaseOrder={receiving}
          feedItemId={receiving.feedItemId}
          open
          onOpenChange={(open) => {
            if (!open) {
              setReceiving(null);
            }
          }}
        />
      ) : null}
    </Section>
  );
};
