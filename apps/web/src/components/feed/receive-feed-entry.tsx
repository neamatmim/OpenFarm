import { feedUnitWord } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@OpenFarm/ui/components/dialog";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PackagePlus, ShoppingCart } from "lucide-react";
import { useId, useState } from "react";

import { Loaded } from "@/components/page";
import { FormField, FormSheet } from "@/components/page-kit";
import { SearchablePicker } from "@/components/searchable-picker";
import { useLanguage } from "@/i18n/language-provider";
import { namesIn } from "@/lib/names-in";
import { orpc } from "@/utils/orpc";

import type { FeedPurchase } from "./feed-purchase-actions";
import type { FeedItemRow } from "./feed-types";
import { ReceiveFeedSheet } from "./receive-feed-sheet";

interface ArrivalProps {
  items: FeedItemRow[];
  feedItemId?: string;
  onClose: () => void;
}

/** The receipt gets the selected order itself, so its supplier, item and limits cannot be lost along the way. */
const ChooseFeedOrder = ({
  items,
  feedItemId,
  onClose,
  onBack,
  onChoose,
}: ArrivalProps & {
  onBack: () => void;
  onChoose: (order: FeedPurchase) => void;
}) => {
  const { t, language } = useLanguage();
  const id = useId();
  const [selectedId, setSelectedId] = useState("");
  const orders = useQuery(orpc.feedPurchasing.list.queryOptions());
  const eligible = (orders.data ?? []).filter(
    (order) =>
      order.state === "ordered" &&
      order.remaining > 0 &&
      (!feedItemId || order.feedItemId === feedItemId) &&
      items.some((item) => item.id === order.feedItemId && !item.retiredAt)
  );
  const selected = eligible.find((order) => order.id === selectedId);
  return (
    <FormSheet
      open
      title={t("stock.chooseOrder")}
      description={t("stock.chooseOrderHint")}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      submitLabel={t("stock.useOrder")}
      pending={false}
      ready={!!selected && !orders.isError}
      missing={{
        at: id,
        said: orders.isError ? t("common.loadFailed") : t("stock.chooseOrder"),
      }}
      keepsWhatIsTyped={false}
      onSubmit={() => {
        if (selected && !orders.isError) {
          onChoose(selected);
        }
      }}
    >
      <Loaded query={orders}>
        <FormField id={id} label={t("stock.chooseOrder")}>
          <SearchablePicker
            id={id}
            value={selectedId}
            onChange={setSelectedId}
            placeholder={t("stock.searchOrders")}
            empty={t("stock.noReceivableOrders")}
            options={eligible.map((order) => ({
              value: order.id,
              label: `${namesIn(order, language).shown} · ${order.supplierName}`,
              detail: [
                order.orderReference ?? order.id.slice(0, 8),
                t("purchasing.remaining", {
                  quantity: `${formatNumber(order.remaining, language)} ${feedUnitWord(order.unit, language)}`,
                }),
                order.deliveryDueOn
                  ? `${t("purchasing.deliveryDue")}: ${formatDate(new Date(order.deliveryDueOn), language)}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · "),
            }))}
          />
        </FormField>
      </Loaded>
      <Button variant="outline" render={<Link to="/feed/purchases" />}>
        {t("purchasing.open")}
      </Button>
      <Button type="button" variant="ghost" onClick={onBack}>
        {t("stock.changeArrivalSource")}
      </Button>
    </FormSheet>
  );
};

const FeedArrival = ({ items, feedItemId, onClose }: ArrivalProps) => {
  const { t } = useLanguage();
  const [source, setSource] = useState<"order" | "direct" | null>(null);
  const [order, setOrder] = useState<FeedPurchase | null>(null);
  if (source === "direct" || order) {
    return (
      <ReceiveFeedSheet
        open
        items={items}
        feedItemId={order?.feedItemId ?? feedItemId}
        purchaseOrder={order ?? undefined}
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
      />
    );
  }
  if (source === "order") {
    return (
      <ChooseFeedOrder
        items={items}
        feedItemId={feedItemId}
        onClose={onClose}
        onBack={() => setSource(null)}
        onChoose={setOrder}
      />
    );
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle>{t("stock.recordArrival")}</DialogTitle>
          <DialogDescription>{t("stock.arrivalSourceHint")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Button type="button" onClick={() => setSource("order")}>
            <ShoppingCart aria-hidden data-icon="inline-start" />
            {t("stock.againstOrder")}
          </Button>
          <p className="text-muted-foreground text-sm">
            {t("stock.againstOrderHint")}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setSource("direct")}
          >
            <PackagePlus aria-hidden data-icon="inline-start" />
            {t("stock.directArrival")}
          </Button>
          <p className="text-muted-foreground text-sm">
            {t("stock.directArrivalHint")}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/** Unmount the choice and receipt on close: each delivery starts with a fresh source and idempotency key. */
export const ReceiveFeedEntry = ({
  open,
  onOpenChange,
  ...props
}: Omit<ArrivalProps, "onClose"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) =>
  open ? <FeedArrival {...props} onClose={() => onOpenChange(false)} /> : null;
