import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Notice } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

import type { FeedPurchase } from "./feed-purchase-actions";

export const purchasesNeedingAttention = (rows: FeedPurchase[]): number =>
  rows.filter(
    (order) =>
      order.state === "requested" ||
      order.orderLate ||
      order.deliveryLate ||
      order.overBudget ||
      order.overQuantity
  ).length;

export const FeedPurchaseAttention = () => {
  const { t } = useLanguage();
  const purchases = useQuery(orpc.feedPurchasing.list.queryOptions());
  if (purchases.isError) {
    return <Notice tone="warning" title={t("common.loadFailed")} />;
  }
  const rows = purchases.data ?? [];
  if (!purchasesNeedingAttention(rows)) {
    return null;
  }
  return (
    <Notice
      tone="warning"
      title={t("purchasing.queue")}
      action={
        <Link
          to="/feed/purchases"
          className="text-sm font-medium underline underline-offset-4"
        >
          {t("purchasing.open")}
        </Link>
      }
    >
      {t("purchasing.queueHint", {
        approvals: rows.filter((order) => order.state === "requested").length,
        ordering: rows.filter((order) => order.orderLate).length,
        deliveries: rows.filter((order) => order.deliveryLate).length,
      })}
    </Notice>
  );
};
