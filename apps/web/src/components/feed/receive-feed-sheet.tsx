import type { PaymentMethod } from "@OpenFarm/domain";
import { farmDayOf, maundsOf } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@OpenFarm/ui/components/sheet";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { SegmentedControl } from "@/components/page";
import { PaymentMethodField } from "@/components/payment-method";
import { useLanguage } from "@/i18n/language-provider";
import { wordedRefusal } from "@/lib/correction-refusal";
import { orpc } from "@/utils/orpc";

import type { FeedItemRow } from "./feed-types";

const SELECT_CLASS =
  "bg-card border-input focus-visible:ring-ring/50 h-11 w-full rounded-md border px-3 text-base outline-none focus-visible:ring-3 md:h-9 md:text-sm";

type Kind = "purchase" | "harvest";

/** What is typed into the sheet, before it is feed in the store. */
interface Draft {
  feedItemId: string;
  kind: Kind;
  quantity: string;
  price: string;
  seller: string;
  paymentMethod: PaymentMethod;
  receivedOn: string;
}

const freshDraft = (feedItemId: string): Draft => ({
  feedItemId,
  kind: "purchase",
  quantity: "",
  price: "",
  seller: "",
  paymentMethod: "cash",
  receivedOn: farmDayOf(new Date()),
});

/** What a trader's slip would say, worked out as it is typed: the maunds, and what a unit cost. */
const LotSummary = ({ draft, unit }: { draft: Draft; unit: string }) => {
  const { t, language } = useLanguage();
  const amount = Number(draft.quantity);
  const price = Number(draft.price);
  if (!(amount > 0)) {
    return null;
  }
  const parts: string[] = [];
  if (unit === "kg") {
    parts.push(
      t("stock.maunds", { maunds: formatNumber(maundsOf(amount), language) })
    );
  }
  if (draft.kind === "purchase" && price > 0) {
    parts.push(
      t("stock.averagePrice", {
        taka: formatNumber(Math.round((price / amount) * 100) / 100, language),
        unit,
      })
    );
  }
  if (parts.length === 0) {
    return null;
  }
  return (
    <p className="bg-muted text-muted-foreground rounded-md px-3 py-2 text-sm tabular-nums">
      {parts.join(" · ")}
    </p>
  );
};

/**
 * Feed coming into the store, in a sheet beside the page: a Feed Purchase with its price and seller, or a Harvest
 * with neither. Opened from the page's own button, or from a Feed Item's row with that item already chosen — the page
 * keys it on that item, so opening it for another starts a fresh sheet.
 */
export const ReceiveFeedSheet = ({
  items,
  open,
  onOpenChange,
  feedItemId,
}: {
  items: FeedItemRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feedItemId?: string;
}) => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const live = items.filter((item) => !item.retiredAt);
  const [draft, setDraft] = useState(() =>
    freshDraft(feedItemId ?? live[0]?.id ?? "")
  );
  // One id per filling-in of the sheet: a second tap is the same lorry, not another.
  const [entryId, setEntryId] = useState(() => crypto.randomUUID());
  const chosen =
    live.find((item) => item.id === draft.feedItemId) ?? live[0] ?? null;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const receive = useMutation(
    orpc.stock.receive.mutationOptions({
      onSuccess: async () => {
        toast.success(t("stock.received"));
        setDraft(freshDraft(chosen?.id ?? ""));
        setEntryId(crypto.randomUUID());
        onOpenChange(false);
        await queryClient.invalidateQueries({ queryKey: orpc.stock.key() });
      },
      onError: (error) =>
        toast.error(
          wordedRefusal(error, t) ?? (error.message || t("common.error"))
        ),
    })
  );

  const amount = Number(draft.quantity);
  const complete =
    chosen !== null &&
    amount > 0 &&
    (draft.kind === "harvest" ||
      (Number(draft.price) > 0 && draft.seller.trim() !== ""));

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>{t("stock.recordArrival")}</SheetTitle>
          <SheetDescription>{t("stock.sheetDescription")}</SheetDescription>
        </SheetHeader>
        {chosen ? (
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              if (!complete) {
                return;
              }
              receive.mutate({
                id: entryId,
                feedItemId: chosen.id,
                kind: draft.kind,
                quantity: amount,
                receivedOn: draft.receivedOn,
                ...(draft.kind === "purchase"
                  ? {
                      priceBdt: Number(draft.price),
                      seller: { name: draft.seller.trim() },
                      paymentMethod: draft.paymentMethod,
                    }
                  : {}),
              });
            }}
          >
            <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
              <div className="space-y-1.5">
                <Label htmlFor="receive-item">{t("stock.col.item")}</Label>
                <select
                  className={SELECT_CLASS}
                  id="receive-item"
                  onChange={(event) => set("feedItemId", event.target.value)}
                  value={chosen.id}
                >
                  {live.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nameBn}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <span className="text-sm font-medium">{t("stock.kind")}</span>
                <SegmentedControl
                  label={t("stock.kind")}
                  name="receive-kind"
                  onChange={(value) => set("kind", value)}
                  options={[
                    { value: "purchase", label: t("stock.purchase") },
                    { value: "harvest", label: t("stock.harvest") },
                  ]}
                  value={draft.kind}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="receive-quantity">
                    {t("stock.quantity", { unit: chosen.unit })}
                  </Label>
                  <Input
                    id="receive-quantity"
                    inputMode="decimal"
                    min={0}
                    onChange={(event) => set("quantity", event.target.value)}
                    required
                    step="0.1"
                    type="number"
                    value={draft.quantity}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="receive-on">{t("stock.receivedOn")}</Label>
                  <Input
                    id="receive-on"
                    onChange={(event) => set("receivedOn", event.target.value)}
                    required
                    type="date"
                    value={draft.receivedOn}
                  />
                </div>
              </div>

              {draft.kind === "purchase" ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="receive-price">{t("stock.price")}</Label>
                      <Input
                        id="receive-price"
                        inputMode="numeric"
                        min={0}
                        onChange={(event) => set("price", event.target.value)}
                        required
                        type="number"
                        value={draft.price}
                      />
                    </div>
                    <PaymentMethodField
                      id="receive-paid-by"
                      onChange={(method) => set("paymentMethod", method)}
                      value={draft.paymentMethod}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="receive-seller">{t("stock.seller")}</Label>
                    <Input
                      autoComplete="off"
                      id="receive-seller"
                      onChange={(event) => set("seller", event.target.value)}
                      required
                      value={draft.seller}
                    />
                  </div>
                </>
              ) : null}

              <LotSummary draft={draft} unit={chosen.unit} />
            </div>
            <SheetFooter className="flex-row justify-end border-t">
              <Button
                onClick={() => onOpenChange(false)}
                type="button"
                variant="outline"
              >
                {t("common.cancel")}
              </Button>
              <Button disabled={!complete || receive.isPending} type="submit">
                {receive.isPending ? <Spinner /> : null}
                {t("stock.record")}
              </Button>
            </SheetFooter>
          </form>
        ) : (
          <p className="text-muted-foreground p-4 text-sm">
            {t("feed.noItems")}
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
};
