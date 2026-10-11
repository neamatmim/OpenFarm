import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Notice } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

export const SupplierAttention = () => {
  const { t } = useLanguage();
  const suppliers = useQuery(orpc.suppliers.list.queryOptions());
  if (suppliers.isError) {
    return <Notice title={t("common.loadFailed")} tone="warning" />;
  }
  const overdue =
    suppliers.data?.filter((row) => row.overdueMoney > 0).length ?? 0;
  return overdue > 0 ? (
    <Notice
      title={t("suppliers.attention")}
      tone="warning"
      action={
        <Link
          to="/money/supplier-payments"
          className="text-sm font-medium underline underline-offset-4"
        >
          {t("payables.viewPlan")}
        </Link>
      }
    >
      {t("suppliers.attentionHint", { count: overdue })}
    </Notice>
  ) : null;
};
