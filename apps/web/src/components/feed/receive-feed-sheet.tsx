import type { FeedPack, PaymentMethod } from "@OpenFarm/domain";
import {
  FEED_PACK_WORDS,
  SMALLEST_FEED_AMOUNT,
  farmDayOf,
  feedUnitEach,
  feedUnitOf,
  feedUnitWord,
  maundsOf,
  quantityOfPacks,
} from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Notice, SegmentedControl } from "@/components/page";
import { FormField, FormSheet, NativeSelect } from "@/components/page-kit";
import type { AccountTyped } from "@/components/payment-method";
import {
  accountSent,
  NO_ACCOUNT,
  PaymentMethodField,
} from "@/components/payment-method";
import { useLanguage } from "@/i18n/language-provider";
import { keptAmount } from "@/lib/feed-figures";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

import type { FeedItemRow } from "./feed-types";
import { namesIn } from "./feed-types";
import { PriceChange } from "./price-change";

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
  /** Which Farm Account mobile money or bank money came out of, and its transaction ID. */
  account: AccountTyped;
  receivedOn: string;
  /** The bag's Lot Number and last day, where it prints them: concentrate and premix do, hay does not. */
  lotNumber: string;
  expiresOn: string;
  /** What the farm's scale showed, in kilos, where the lot was weighed as it came; empty where it was not. */
  weighed: string;
}

const freshDraft = (feedItemId: string): Draft => ({
  feedItemId,
  kind: "purchase",
  countedIn: "own",
  quantity: "",
  price: "",
  seller: "",
  paymentMethod: "cash",
  account: NO_ACCOUNT,
  receivedOn: farmDayOf(new Date()),
  lotNumber: "",
  expiresOn: "",
  weighed: "",
});

/** What the scale showed, where a Purchase of feed bought by the kilo was weighed; nothing where it was not. */
const weighedOf = (draft: Draft, item: FeedItemRow): number | null => {
  const typed = Number(draft.weighed);
  return draft.kind === "purchase" &&
    feedUnitOf(item.unit) === "kg" &&
    draft.weighed.trim() !== "" &&
    typed >= SMALLEST_FEED_AMOUNT
    ? typed
    : null;
};

/** Whether the scale box holds something that is not a weight: empty is fine, it is optional. */
const weighedIsWrong = (draft: Draft) =>
  draft.weighed.trim() !== "" &&
  !(Number(draft.weighed) >= SMALLEST_FEED_AMOUNT);

/** Whether the sheet says what its kind needs: a Purchase its price and seller, and the scale only a weight or nothing;
 *  a Harvest nothing more. */
const saysWhatAPurchaseNeeds = (draft: Draft) =>
  draft.kind === "harvest" ||
  (Number(draft.price) > 0 &&
    draft.seller.trim() !== "" &&
    !weighedIsWrong(draft));

/** The ways a Feed Item may be counted as it comes in: its own unit, and — for feed weighed in kilos — maunds, and
 *  bags once the farm has said what its bags weigh. */
const waysToCount = (item: FeedItemRow): CountedIn[] => {
  if (feedUnitOf(item.unit) !== "kg") {
    return ["own"];
  }
  return item.bagSizeKg === null ? ["own", "maund"] : ["own", "bag", "maund"];
};

/** A cut of a feed with no Fodder Price yet is kept, and priced when the Owner sets one — said as it is cut. */
const UnpricedCut = ({
  item,
  kind,
}: {
  item: FeedItemRow | null;
  kind: Draft["kind"];
}) => {
  const { t } = useLanguage();
  return kind === "harvest" && item?.fodderPriceMoney === null ? (
    <Notice title={t("stock.harvestUnpriced")} tone="info" />
  ) : null;
};

/**
 * Opened with nothing typed, it is today's lorry: the sheet is made once with the page, and a page left open overnight
 * wrote this morning's under yesterday.
 */
const useTodayWhenOpened = (
  open: boolean,
  draft: Draft,
  setDraft: (change: (current: Draft) => Draft) => void
) => {
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    const today = farmDayOf(new Date());
    if (open && draft.quantity === "" && draft.receivedOn !== today) {
      setDraft((current) => ({ ...current, receivedOn: today }));
    }
  }
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
  // No less than the store keeps, as the farm reads it: less was refused, in English.
  if (countedIn === "own") {
    return keptAmount(typed);
  }
  const packed = quantityOfPacks(
    { kind: countedIn, count: typed },
    { unit: feedUnitOf(item.unit), bagSizeKg: item.bagSizeKg }
  );
  return "quantity" in packed ? keptAmount(packed.quantity) : null;
};

/** How far the price typed moves on the last purchase, to a tenth of a percent. */
const changeOn = (last: number, now: number) =>
  Math.round(((now - last) / last) * 1000) / 10;

/** The last purchase of this feed, for the lorry at the gate to be set beside before it is saved: what a unit cost then,
 *  and — once a price is typed — how far this one moves on it. */
const LastPurchase = ({
  item,
  draft,
  amount,
}: {
  item: FeedItemRow;
  draft: Draft;
  /** What was typed, in the feed's own unit; nothing until it is. */
  amount: number | null;
}) => {
  const { t, language } = useLanguage();
  const last = useQuery(
    orpc.stock.lastPurchase.queryOptions({ input: { feedItemId: item.id } })
  );
  // A Harvest has no price to set beside anything.
  if (!last.data || draft.kind !== "purchase") {
    return null;
  }
  const typedPrice = Number(draft.price);
  const unitPriceNow =
    amount !== null && typedPrice > 0 ? typedPrice / amount : null;
  const { unitPriceMoney, receivedOn } = last.data;
  const change =
    unitPriceNow === null || unitPriceMoney === 0
      ? null
      : changeOn(unitPriceMoney, unitPriceNow);
  return (
    <p className="text-muted-foreground text-sm tabular-nums">
      {t("stock.lastBought", {
        amount: formatNumber(Math.round(unitPriceMoney * 100) / 100, language),
        unit: feedUnitEach(item.unit, language),
        day: formatDate(new Date(receivedOn), language, "date"),
      })}
      {change === null ? null : (
        <>
          {" · "}
          <PriceChange percent={change} />
        </>
      )}
    </p>
  );
};

/** The scale against the slip, as both are typed: short, over, or agreeing. */
const ScaleAgainstSlip = ({
  slip,
  weighed,
}: {
  slip: number;
  weighed: number;
}) => {
  const { t, language } = useLanguage();
  const short = Math.round((slip - weighed) * 10) / 10;
  const said = {
    slip: formatNumber(Math.round(slip * 10) / 10, language),
    weighed: formatNumber(weighed, language),
  };
  if (short > 0) {
    return (
      <p className="text-warning text-sm font-medium tabular-nums">
        {t("stock.scaleShort", {
          ...said,
          short: formatNumber(short, language),
          percent: formatNumber(
            Math.round((short / slip) * 1000) / 10,
            language
          ),
        })}
      </p>
    );
  }
  return (
    <p className="text-muted-foreground text-sm tabular-nums">
      {short < 0
        ? t("stock.scaleOver", {
            ...said,
            over: formatNumber(-short, language),
          })
        : t("stock.scaleSame")}
    </p>
  );
};

/** The farm's scale, for a Purchase of feed bought by the kilo: optional (the Owner, 2026-09-29), and set against the
 *  slip as it is typed. */
const ScaleField = ({
  draft,
  item,
  slip,
  onChange,
}: {
  draft: Draft;
  item: FeedItemRow;
  /** What the slip says, in kilos, once it is typed. */
  slip: number | null;
  onChange: (value: string) => void;
}) => {
  const { t } = useLanguage();
  if (draft.kind !== "purchase" || feedUnitOf(item.unit) !== "kg") {
    return null;
  }
  const weighed = weighedOf(draft, item);
  return (
    <>
      <FormField
        hint={t("stock.weighedHint")}
        id="receive-weighed"
        label={t("stock.weighed")}
      >
        <Input
          aria-invalid={weighedIsWrong(draft)}
          id="receive-weighed"
          inputMode="decimal"
          min={0}
          onChange={(event) => onChange(event.target.value)}
          step="0.1"
          type="number"
          value={draft.weighed}
        />
      </FormField>
      {slip !== null && weighed !== null ? (
        <ScaleAgainstSlip slip={slip} weighed={weighed} />
      ) : null}
    </>
  );
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
  // A lot's price per unit is on what came — the scale's kilos where it was weighed.
  const stored = weighedOf(draft, item) ?? amount;
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
        amount: formatNumber(
          Math.round((price / (stored ?? amount)) * 100) / 100,
          language
        ),
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
  useTodayWhenOpened(open, draft, setDraft);
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
    saysWhatAPurchaseNeeds(draft);

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
                priceMoney: Number(draft.price),
                seller: { name: draft.seller.trim() },
                paymentMethod: draft.paymentMethod,
                ...accountSent(draft.paymentMethod, draft.account),
                lotNumber: draft.lotNumber.trim() || undefined,
                expiresOn: draft.expiresOn || undefined,
                weighed: weighedOf(draft, chosen) ?? undefined,
              }
            : {}),
        });
      }}
      open={open}
      pending={receive.isPending}
      ready={ready}
      submitLabel={t("stock.record")}
      title={t("stock.recordArrival")}
      wide
    >
      {chosen ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField id="receive-item" label={t("stock.col.item")}>
              <NativeSelect
                id="receive-item"
                onChange={(event) => set("feedItemId", event.target.value)}
                value={chosen.id}
              >
                {live.map((item) => (
                  <option key={item.id} value={item.id}>
                    {namesIn(item, language).shown}
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

            <UnpricedCut item={chosen} kind={draft.kind} />

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
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
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
            {draft.kind === "purchase" ? (
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
            ) : null}
          </div>

          {draft.kind === "purchase" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <PaymentMethodField
                  account={{
                    typed: draft.account,
                    onChange: (account) => set("account", account),
                  }}
                  id="receive-paid-by"
                  onChange={(method) => set("paymentMethod", method)}
                  row
                  value={draft.paymentMethod}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField id="receive-seller" label={t("stock.seller")}>
                  <Input
                    autoComplete="off"
                    id="receive-seller"
                    onChange={(event) => set("seller", event.target.value)}
                    required
                    value={draft.seller}
                  />
                </FormField>
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

          <ScaleField
            draft={draft}
            item={chosen}
            onChange={(value) => set("weighed", value)}
            slip={amount}
          />
          <LotSummary countedIn={countedIn} draft={draft} item={chosen} />
          <LastPurchase
            amount={weighedOf(draft, chosen) ?? amount}
            draft={draft}
            item={chosen}
          />
        </>
      ) : (
        <p className="text-muted-foreground text-sm">{t("feed.noItems")}</p>
      )}
    </FormSheet>
  );
};
