import { farmDayOf, feedUnitWord } from "@OpenFarm/domain";
import {
  incomingFeedQuantity,
  feedQuoteTotal,
  orderByDay,
} from "@OpenFarm/domain/feed-purchasing";
import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { FieldGroup } from "@OpenFarm/ui/components/field";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";

import { Notice } from "@/components/page";
import {
  FormField,
  FormSheet,
  NativeSelect,
  WorkedOut,
} from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useMoney } from "@/lib/money";
import { namesIn } from "@/lib/names-in";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

import type { FeedItemRow } from "./feed-types";
import { SupplierField } from "./supplier-fields";
import { NewSupplierSheet } from "./supplier-forms";

export interface PurchaseSource {
  feedItemId: string;
  quantity: number;
  unitPriceMoney: number | null;
  neededOn: string;
  forecast?: {
    month: string;
    basis: "rations" | "recent" | "planning";
    scenario?: "slow" | "expected" | "fast";
  };
}

export const REFUSALS = {
  feed_order_changed: "purchasing.changed",
  feed_order_needed_day: "purchasing.futureDay",
  feed_order_budget_small: "purchasing.budgetSmall",
  feed_order_assignee: "purchasing.activeAssignee",
  feed_order_forecast_missing: "purchasing.forecastMissing",
  feed_order_terminal: "purchasing.terminal",
  feed_order_reason: "purchasing.reasonNeeded",
  feed_order_needs_approval: "purchasing.needsApproval",
  feed_order_not_ordered: "purchasing.notOrdered",
  feed_order_wrong_delivery: "purchasing.wrongDelivery",
  feed_order_delivery_day: "purchasing.deliveryDay",
  feed_order_quantity_limit: "purchasing.quantityLimit",
  feed_order_budget_limit: "purchasing.budgetLimit",
} as const;

export interface PurchaseTermsDraft {
  quantity: string;
  unitPriceMoney: string;
  budgetMoney: string;
}
export const termsOfDraft = (draft: PurchaseTermsDraft) => ({
  quantity: Number(draft.quantity),
  unitPriceMoney: Number(draft.unitPriceMoney),
  budgetMoney:
    draft.budgetMoney === ""
      ? feedQuoteTotal(Number(draft.quantity), Number(draft.unitPriceMoney))
      : Number(draft.budgetMoney),
});
export const validPurchaseTerms = (draft: PurchaseTermsDraft): boolean => {
  const terms = termsOfDraft(draft);
  return (
    Number.isFinite(terms.quantity) &&
    Number.isFinite(terms.unitPriceMoney) &&
    Number.isFinite(terms.budgetMoney) &&
    terms.quantity >= 0.1 &&
    terms.quantity <= 1_000_000 &&
    terms.unitPriceMoney >= 0.01 &&
    terms.budgetMoney >= 0.01 &&
    terms.budgetMoney <= 100_000_000 &&
    terms.budgetMoney >= feedQuoteTotal(terms.quantity, terms.unitPriceMoney)
  );
};

export const PurchaseTermsFields = ({
  draft,
  onChange,
  unit,
}: {
  draft: PurchaseTermsDraft;
  onChange: (field: keyof PurchaseTermsDraft, value: string) => void;
  unit: string;
}) => {
  const { t, language } = useLanguage();
  const prefix = useId();
  return (
    <FieldGroup className="grid gap-4 sm:grid-cols-3">
      <FormField
        id={`${prefix}-quantity`}
        label={`${t("purchasing.quantity")} (${feedUnitWord(unit, language)})`}
      >
        <Input
          id={`${prefix}-quantity`}
          type="number"
          inputMode="decimal"
          min="0.1"
          max="1000000"
          step="0.1"
          required
          value={draft.quantity}
          onChange={(event) => onChange("quantity", event.target.value)}
        />
      </FormField>
      <FormField id={`${prefix}-price`} label={t("purchasing.unitPrice")}>
        <Input
          id={`${prefix}-price`}
          type="number"
          inputMode="decimal"
          min="0.01"
          max="100000000"
          step="0.01"
          required
          value={draft.unitPriceMoney}
          onChange={(event) => onChange("unitPriceMoney", event.target.value)}
        />
      </FormField>
      <FormField
        id={`${prefix}-budget`}
        label={t("purchasing.budget")}
        hint={t("purchasing.budgetHint")}
      >
        <Input
          id={`${prefix}-budget`}
          type="number"
          inputMode="decimal"
          min="0.01"
          max="100000000"
          step="0.01"
          value={draft.budgetMoney}
          placeholder={String(termsOfDraft(draft).budgetMoney || "")}
          onChange={(event) => onChange("budgetMoney", event.target.value)}
        />
      </FormField>
    </FieldGroup>
  );
};

const WHOLE_DAYS = /^\d+$/u;
const initialFeedId = (
  source: PurchaseSource | undefined,
  items: FeedItemRow[]
) => source?.feedItemId ?? items[0]?.id ?? "";
const initialTerms = (source?: PurchaseSource): PurchaseTermsDraft => ({
  quantity: "",
  unitPriceMoney: source?.unitPriceMoney ? String(source.unitPriceMoney) : "",
  budgetMoney: "",
});
const requestReady = ({
  chosen,
  supplier,
  assignee,
  ordersReady,
  draft,
  neededOn,
  leadDays,
  bufferDays,
}: {
  chosen: FeedItemRow | undefined;
  supplier: string;
  assignee: string;
  ordersReady: boolean;
  draft: PurchaseTermsDraft;
  neededOn: string;
  leadDays: string;
  bufferDays: string;
}) =>
  !!chosen &&
  !!supplier.trim() &&
  !!assignee &&
  ordersReady &&
  validPurchaseTerms(draft) &&
  neededOn >= farmDayOf(new Date()) &&
  WHOLE_DAYS.test(leadDays) &&
  Number(leadDays) <= 90 &&
  WHOLE_DAYS.test(bufferDays) &&
  Number(bufferDays) <= 30;

export const PurchaseRequestSheet = ({
  source,
  items,
  open,
  onOpenChange,
}: {
  source?: PurchaseSource;
  items: FeedItemRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t, language } = useLanguage();
  const prefix = useId();
  const refused = useRefused(REFUSALS);
  const asMoney = useMoney();
  const live = items.filter((item) => !item.retiredAt);
  const [id, setId] = useState(() => crypto.randomUUID());
  const [feedItemId, setFeedItemId] = useState(initialFeedId(source, live));
  const [terms, setTerms] = useState<PurchaseTermsDraft>(initialTerms(source));
  const [supplier, setSupplier] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [assignedTo, setAssignedTo] = useState("");
  const [neededOn, setNeededOn] = useState(
    source?.neededOn ?? farmDayOf(new Date())
  );
  const [leadDays, setLeadDays] = useState("3");
  const [bufferDays, setBufferDays] = useState("2");
  const [note, setNote] = useState("");
  const assignees = useQuery({
    ...orpc.feedPurchasing.assignees.queryOptions(),
    enabled: open,
  });
  const orders = useQuery({
    ...orpc.feedPurchasing.list.queryOptions(),
    enabled: open,
  });
  const chosen = live.find((item) => item.id === feedItemId);
  const assignee = assignedTo || assignees.data?.[0]?.id || "";
  const related = (orders.data ?? []).filter(
    (order) =>
      order.feedItemId === feedItemId &&
      ["requested", "approved", "ordered"].includes(order.state) &&
      order.remaining > 0
  );
  const incoming = incomingFeedQuantity(related, neededOn);
  const draft = {
    ...terms,
    quantity:
      source && terms.quantity === ""
        ? String(
            Math.max(0, Math.round((source.quantity - incoming) * 10) / 10)
          )
        : terms.quantity,
  };
  const request = useMutation(
    orpc.feedPurchasing.request.mutationOptions({
      onSuccess: () => {
        toast.success(t("purchasing.requested"));
        setId(crypto.randomUUID());
        onOpenChange(false);
      },
      onError: refused,
    })
  );
  const ready = requestReady({
    chosen,
    supplier,
    assignee,
    ordersReady: orders.isSuccess,
    draft,
    neededOn,
    leadDays,
    bufferDays,
  });
  return (
    <>
      <FormSheet
        title={t("purchasing.request")}
        description={t("purchasing.requestHint")}
        open={open}
        onOpenChange={onOpenChange}
        pending={request.isPending}
        ready={ready}
        submitLabel={t("purchasing.submit")}
        wide
        onSubmit={() => {
          if (!ready) {
            return;
          }
          request.mutate({
            id,
            feedItemId,
            supplier: { name: supplier },
            supplierId: supplierId || undefined,
            assignedTo: assignee,
            ...termsOfDraft(draft),
            neededOn,
            leadDays: Number(leadDays),
            bufferDays: Number(bufferDays),
            note: note || undefined,
            forecast: source?.forecast,
          });
        }}
      >
        <FormField id={`${prefix}-feed`} label={t("stock.col.item")}>
          <NativeSelect
            id={`${prefix}-feed`}
            value={feedItemId}
            disabled={!!source}
            onChange={(event) => setFeedItemId(event.target.value)}
          >
            {live.map((item) => (
              <option key={item.id} value={item.id}>
                {namesIn(item, language).shown}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        {related.length > 0 ? (
          <Notice
            tone="warning"
            title={t("purchasing.existing", { count: related.length })}
          >
            {t(
              source
                ? "purchasing.incomingHint"
                : "purchasing.incomingAvailable",
              {
                quantity: formatNumber(incoming, language),
                unit: feedUnitWord(chosen?.unit ?? "kg", language),
              }
            )}
          </Notice>
        ) : null}
        <PurchaseTermsFields
          draft={draft}
          unit={chosen?.unit ?? "kg"}
          onChange={(field, value) =>
            setTerms((current) => ({ ...current, [field]: value }))
          }
        />
        <WorkedOut>
          {t("purchasing.quoteTotal", {
            money: asMoney(
              feedQuoteTotal(
                Number(draft.quantity),
                Number(draft.unitPriceMoney)
              )
            ),
          })}
        </WorkedOut>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <SupplierField
            name={supplier}
            supplierId={supplierId}
            onNewSupplier={() => setAddingSupplier(true)}
            onChange={(chosenSupplier) => {
              setSupplier(chosenSupplier.name);
              setSupplierId(chosenSupplier.id);
            }}
          />
          <FormField id={`${prefix}-assignee`} label={t("purchasing.assignee")}>
            <NativeSelect
              id={`${prefix}-assignee`}
              value={assignee}
              onChange={(event) => setAssignedTo(event.target.value)}
            >
              {(assignees.data ?? []).map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id={`${prefix}-needed`} label={t("purchasing.neededOn")}>
            <Input
              id={`${prefix}-needed`}
              required
              type="date"
              min={farmDayOf(new Date())}
              value={neededOn}
              onChange={(event) => setNeededOn(event.target.value)}
            />
          </FormField>
          <FormField id={`${prefix}-lead`} label={t("purchasing.leadDays")}>
            <Input
              id={`${prefix}-lead`}
              required
              type="number"
              inputMode="numeric"
              min={0}
              max={90}
              value={leadDays}
              onChange={(event) => setLeadDays(event.target.value)}
            />
          </FormField>
          <FormField id={`${prefix}-buffer`} label={t("purchasing.bufferDays")}>
            <Input
              id={`${prefix}-buffer`}
              required
              type="number"
              inputMode="numeric"
              min={0}
              max={30}
              value={bufferDays}
              onChange={(event) => setBufferDays(event.target.value)}
            />
          </FormField>
        </FieldGroup>
        {neededOn && ready ? (
          <WorkedOut>
            {t("purchasing.orderBy", {
              day: orderByDay(neededOn, Number(leadDays), Number(bufferDays)),
            })}
          </WorkedOut>
        ) : null}
        <FormField id={`${prefix}-note`} label={t("purchasing.note")}>
          <Input
            id={`${prefix}-note`}
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </FormField>
      </FormSheet>
      <NewSupplierSheet
        open={addingSupplier}
        onClose={() => setAddingSupplier(false)}
        onCreated={(created) => {
          setSupplier(created.name);
          setSupplierId(created.id);
        }}
      />
    </>
  );
};

/** Forecasts remain gross shortages. Incoming orders are shown separately, because a promised delivery is not stock. */
export const PurchaseFromForecast = ({
  source,
}: {
  source: PurchaseSource;
}) => {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const items = useQuery({
    ...orpc.feed.items.list.queryOptions(),
    enabled: open,
  });
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={source.quantity < 0.1}
      >
        {t("purchasing.request")}
      </Button>
      {open && items.data ? (
        <PurchaseRequestSheet
          items={items.data}
          source={source}
          open
          onOpenChange={setOpen}
        />
      ) : null}
    </>
  );
};

export interface ForecastPurchaseLine {
  feedItemId: string;
  nameBn: string;
  nameEn?: string | null;
  unit: string;
  quantity: number;
  unitPriceMoney: number | null;
}

export const ForecastPurchasePicker = ({
  lines,
  month,
  basis,
  scenario,
}: {
  lines: ForecastPurchaseLine[];
  month: string;
  basis: "rations" | "recent" | "planning";
  scenario?: "slow" | "expected" | "fast";
}) => {
  const { t, language } = useLanguage();
  const prefix = useId();
  const [chosenId, setChosenId] = useState("");
  const chosen = lines.find((line) => line.feedItemId === chosenId) ?? lines[0];
  if (!chosen) {
    return null;
  }
  const today = farmDayOf(new Date());
  const neededOn = `${month}-01` > today ? `${month}-01` : today;
  return (
    <div className="my-4 flex flex-wrap items-end gap-3">
      <FormField
        id={`${prefix}-purchase-feed`}
        label={t("purchasing.fromForecast")}
      >
        <NativeSelect
          id={`${prefix}-purchase-feed`}
          value={chosen.feedItemId}
          onChange={(event) => setChosenId(event.target.value)}
        >
          {lines.map((line) => (
            <option key={line.feedItemId} value={line.feedItemId}>
              {namesIn(line, language).shown} ·{" "}
              {formatNumber(line.quantity, language)}{" "}
              {feedUnitWord(line.unit, language)}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <PurchaseFromForecast
        key={`${chosen.feedItemId}-${month}-${basis}-${scenario}`}
        source={{
          feedItemId: chosen.feedItemId,
          quantity: chosen.quantity,
          unitPriceMoney: chosen.unitPriceMoney,
          neededOn,
          forecast: { month, basis, scenario },
        }}
      />
    </div>
  );
};
