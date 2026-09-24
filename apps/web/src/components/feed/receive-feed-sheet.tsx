import type { FeedPack, PaymentMethod } from "@OpenFarm/domain";
import {
  FEED_PACK_WORDS,
  farmDayOf,
  feedUnitEach,
  feedUnitOf,
  feedUnitWord,
  maundsOf,
  quantityOfPacks,
} from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { SegmentedControl } from "@/components/page";
import { FormField, FormSheet, NativeSelect } from "@/components/page-kit";
import { PaymentMethodField } from "@/components/payment-method";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

import type { FeedItemRow } from "./feed-types";

type Kind = "purchase" | "harvest";

/** What the quantity was typed in: the feed's own unit, or the bags or maunds on the trader's slip. */
type CountedIn = "own" | FeedPack;

/** What is typed into the sheet, before it is feed in the store. */
interface Draft {
  feedItemId: string;
  kind: Kind;
  countedIn: CountedIn;
  quantity: string;
  price: string;
  seller: string;
  paymentMethod: PaymentMethod;
  receivedOn: string;
  /** The bag's Lot Number and last day, where it prints them: concentrate and premix do, hay does not. */
  lotNumber: string;
  expiresOn: string;
}

const freshDraft = (feedItemId: string): Draft => ({
  feedItemId,
  kind: "purchase",
  countedIn: "own",
  quantity: "",
  price: "",
  seller: "",
  paymentMethod: "cash",
  receivedOn: farmDayOf(new Date()),
  lotNumber: "",
  expiresOn: "",
});

/** The ways a Feed Item may be counted as it comes in: its own unit, and — for feed weighed in kilos — maunds, and
 *  bags once the farm has said what its bags weigh. */
const waysToCount = (item: FeedItemRow): CountedIn[] => {
  if (feedUnitOf(item.unit) !== "kg") {
    return ["own"];
  }
  return item.bagSizeKg === null ? ["own", "maund"] : ["own", "bag", "maund"];
};

/** What was typed, in the feed's own unit: as it stands, or the bags or maunds worked out into kilos. Nothing for
 *  what cannot be. */
const amountOf = (
  draft: Draft,
  countedIn: CountedIn,
  item: FeedItemRow
): number | null => {
  const typed = Number(draft.quantity);
  if (!(typed > 0)) {
    return null;
  }
  if (countedIn === "own") {
    return typed;
  }
  const packed = quantityOfPacks(
    { kind: countedIn, count: typed },
    { unit: feedUnitOf(item.unit), bagSizeKg: item.bagSizeKg }
  );
  return "quantity" in packed ? packed.quantity : null;
};

/** What a trader's slip would say, worked out as it is typed: what bags or maunds come to, the maunds kilos come
 *  to, and what a unit cost. */
const LotSummary = ({
  draft,
  countedIn,
  item,
}: {
  draft: Draft;
  countedIn: CountedIn;
  item: FeedItemRow;
}) => {
  const { t, language } = useLanguage();
  const amount = amountOf(draft, countedIn, item);
  const price = Number(draft.price);
  if (amount === null) {
    return null;
  }
  const parts: string[] = [];
  if (countedIn !== "own") {
    parts.push(
      t("stock.comesTo", {
        quantity: formatNumber(Math.round(amount * 10) / 10, language),
        unit: feedUnitWord(item.unit, language),
      })
    );
  } else if (feedUnitOf(item.unit) === "kg") {
    parts.push(
      t("stock.maunds", { maunds: formatNumber(maundsOf(amount), language) })
    );
  }
  if (draft.kind === "purchase" && price > 0) {
    parts.push(
      t("stock.averagePrice", {
        taka: formatNumber(Math.round((price / amount) * 100) / 100, language),
        unit: feedUnitEach(item.unit, language),
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
  const { t, language } = useLanguage();
  const refused = useRefused();
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
      onSuccess: () => {
        toast.success(t("stock.received"));
        setDraft(freshDraft(chosen?.id ?? ""));
        setEntryId(crypto.randomUUID());
        onOpenChange(false);
      },
      onError: refused,
    })
  );

  // Moving to a feed that is not bought that way goes back to its own unit.
  const ways: CountedIn[] = chosen ? waysToCount(chosen) : ["own"];
  const countedIn = ways.includes(draft.countedIn) ? draft.countedIn : "own";
  const amount = chosen ? amountOf(draft, countedIn, chosen) : null;
  // Both are the farm's own days, so they sort as text.
  const expiredWhenBought =
    draft.expiresOn !== "" && draft.expiresOn < draft.receivedOn;
  const ready =
    chosen !== null &&
    amount !== null &&
    !expiredWhenBought &&
    (draft.kind === "harvest" ||
      (Number(draft.price) > 0 && draft.seller.trim() !== ""));

  return (
    <FormSheet
      description={t("stock.sheetDescription")}
      onOpenChange={onOpenChange}
      onSubmit={() => {
        if (!chosen) {
          return;
        }
        receive.mutate({
          id: entryId,
          feedItemId: chosen.id,
          kind: draft.kind,
          ...(countedIn === "own"
            ? { quantity: Number(draft.quantity) }
            : {
                pack: { kind: countedIn, count: Number(draft.quantity) },
              }),
          receivedOn: draft.receivedOn,
          ...(draft.kind === "purchase"
            ? {
                priceBdt: Number(draft.price),
                seller: { name: draft.seller.trim() },
                paymentMethod: draft.paymentMethod,
                lotNumber: draft.lotNumber.trim() || undefined,
                expiresOn: draft.expiresOn || undefined,
              }
            : {}),
        });
      }}
      open={open}
      pending={receive.isPending}
      ready={ready}
      submitLabel={t("stock.record")}
      title={t("stock.recordArrival")}
    >
      {chosen ? (
        <>
          <FormField id="receive-item" label={t("stock.col.item")}>
            <NativeSelect
              id="receive-item"
              onChange={(event) => set("feedItemId", event.target.value)}
              value={chosen.id}
            >
              {live.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nameBn}
                </option>
              ))}
            </NativeSelect>
          </FormField>

          <div className="flex flex-col gap-1.5">
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

          {ways.length > 1 ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">
                {t("stock.countedIn")}
              </span>
              <SegmentedControl
                label={t("stock.countedIn")}
                name="receive-counted-in"
                onChange={(value) => set("countedIn", value)}
                options={ways.map((way) => ({
                  value: way,
                  label:
                    way === "own"
                      ? feedUnitWord(chosen.unit, language)
                      : FEED_PACK_WORDS[way][language],
                }))}
                value={countedIn}
              />
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              hint={
                countedIn === "bag" && chosen.bagSizeKg !== null
                  ? t("stock.bagHolds", {
                      kg: formatNumber(chosen.bagSizeKg, language),
                    })
                  : undefined
              }
              id="receive-quantity"
              label={t("stock.quantity", {
                unit:
                  countedIn === "own"
                    ? feedUnitWord(chosen.unit, language)
                    : FEED_PACK_WORDS[countedIn][language],
              })}
            >
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
            </FormField>
            <FormField id="receive-on" label={t("stock.receivedOn")}>
              <Input
                id="receive-on"
                onChange={(event) => set("receivedOn", event.target.value)}
                required
                type="date"
                value={draft.receivedOn}
              />
            </FormField>
          </div>

          {draft.kind === "purchase" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField id="receive-price" label={t("stock.price")}>
                  <Input
                    id="receive-price"
                    inputMode="numeric"
                    min={0}
                    onChange={(event) => set("price", event.target.value)}
                    required
                    type="number"
                    value={draft.price}
                  />
                </FormField>
                <PaymentMethodField
                  id="receive-paid-by"
                  onChange={(method) => set("paymentMethod", method)}
                  value={draft.paymentMethod}
                />
              </div>
              <FormField id="receive-seller" label={t("stock.seller")}>
                <Input
                  autoComplete="off"
                  id="receive-seller"
                  onChange={(event) => set("seller", event.target.value)}
                  required
                  value={draft.seller}
                />
              </FormField>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField id="receive-lot" label={t("lots.lotNumber")}>
                  <Input
                    autoComplete="off"
                    id="receive-lot"
                    maxLength={60}
                    onChange={(event) => set("lotNumber", event.target.value)}
                    value={draft.lotNumber}
                  />
                </FormField>
                <FormField
                  hint={
                    expiredWhenBought
                      ? t("refusal.expiredWhenBought")
                      : t("lots.feedExpiresOnHint")
                  }
                  id="receive-expires"
                  label={t("lots.expiresOn")}
                >
                  <Input
                    aria-invalid={expiredWhenBought}
                    id="receive-expires"
                    min={draft.receivedOn}
                    onChange={(event) => set("expiresOn", event.target.value)}
                    type="date"
                    value={draft.expiresOn}
                  />
                </FormField>
              </div>
            </>
          ) : null}

          <LotSummary countedIn={countedIn} draft={draft} item={chosen} />
        </>
      ) : (
        <p className="text-muted-foreground text-sm">{t("feed.noItems")}</p>
      )}
    </FormSheet>
  );
};
