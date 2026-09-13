import type { PaymentMethod } from "@OpenFarm/domain";
import { farmDayOf, maundsOf } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Page, PageHeader, Section } from "@/components/page";
import { PaymentMethodField } from "@/components/payment-method";
import { useLanguage, useT } from "@/i18n/language-provider";
import { wordedRefusal } from "@/lib/correction-refusal";
import { orpc } from "@/utils/orpc";

interface RationRow {
  id: string;
  name: { bn: string; en: string | null };
  number: number | null;
  items: { feedItemId: string; kgPerAnimalPerDay: number }[];
  penIds: string[];
}

interface FeedRow {
  id: string;
  nameBn: string;
  unit: string;
  retiredAt: Date | null;
}

/** What the farm feeds, what each Ration says, and what this session calls for in a Pen. The
 *  figures are the farm's own: a Ration says what one animal gets in a day, and the bucket's
 *  number is worked out from the animals actually standing there. */
const FeedPage = () => {
  const t = useT();
  const queryClient = useQueryClient();
  const [penId, setPenId] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  const sheds = useQuery(orpc.herd.list.queryOptions());
  const items = useQuery(orpc.feed.items.queryOptions());
  const rations = useQuery(orpc.feed.rations.queryOptions());
  const pens = (sheds.data ?? []).flatMap((shed) =>
    shed.pens.map((pen) => ({ id: pen.id, name: `${shed.name} / ${pen.name}` }))
  );
  const chosen = penId || pens[0]?.id || "";
  const target = useQuery({
    ...orpc.feed.target.queryOptions({ input: { penId: chosen } }),
    enabled: chosen !== "",
  });

  /** Only what this screen shows: a whole-app refetch for a saved ration is a waste of a
   *  shed phone's signal. */
  const refresh = () => {
    for (const key of [
      orpc.feed.items.key(),
      orpc.feed.rations.key(),
      orpc.feed.target.key(),
    ]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const assign = useMutation(
    orpc.feed.assignRation.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error(error.message),
    })
  );

  return (
    <Page width="narrow" className="max-w-3xl">
      <PageHeader title={t("feed.title")} />

      <FeedItems items={(items.data ?? []) as FeedRow[]} onChanged={refresh} />

      <FeedStock items={(items.data ?? []) as FeedRow[]} />

      <Section title={t("feed.target")}>
        <div className="space-y-1">
          <Label htmlFor="feed-pen">{t("feed.pen")}</Label>
          <select
            className="bg-card border-input h-11 w-full rounded-md border px-3 text-base md:h-9 md:text-sm"
            id="feed-pen"
            onChange={(e) => setPenId(e.target.value)}
            value={chosen}
          >
            {pens.map((pen) => (
              <option key={pen.id} value={pen.id}>
                {pen.name}
              </option>
            ))}
          </select>
        </div>
        {target.data?.ration ? (
          <TargetPanel target={target.data} />
        ) : (
          <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-sm">
            {t("feed.noRation")}
          </p>
        )}
      </Section>

      <Section title={t("feed.rations")}>
        {(rations.data ?? []).map((row) => (
          <article className="surface space-y-2 p-4" key={row.id}>
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-medium">{row.name.bn}</span>
              <span className="text-muted-foreground text-xs">
                {row.number ? t("feed.version", { number: row.number }) : ""}
                {" · "}
                {t("feed.pensOn", { count: row.penIds.length })}
              </span>
            </header>
            <div className="flex flex-wrap gap-2">
              {row.penIds.includes(chosen) ? (
                <span className="text-muted-foreground text-xs">
                  {t("feed.assigned")}
                </span>
              ) : (
                <Button
                  onClick={() =>
                    assign.mutate({ penId: chosen, rationId: row.id })
                  }
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {t("feed.assign")}
                </Button>
              )}
              <Button
                onClick={() => setEditing(editing === row.id ? null : row.id)}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t("sop.edit")}
              </Button>
            </div>
            {editing === row.id ? (
              <RationForm
                items={(items.data ?? []) as FeedRow[]}
                onSaved={() => {
                  setEditing(null);
                  refresh();
                }}
                ration={row}
              />
            ) : null}
          </article>
        ))}
        {editing === "new" ? (
          <RationForm
            items={(items.data ?? []) as FeedRow[]}
            onSaved={() => {
              setEditing(null);
              refresh();
            }}
            ration={null}
          />
        ) : (
          <Button
            onClick={() => setEditing("new")}
            type="button"
            variant="outline"
          >
            {t("feed.newRation")}
          </Button>
        )}
      </Section>
    </Page>
  );
};

/** This session's Feeding Target, with the arithmetic beside it. A number nobody can check
 *  is a number nobody trusts. */
const TargetPanel = ({
  target,
}: {
  target: {
    ration: { name: { bn: string }; number: number } | null;
    animals: number;
    sessionsPerDay: number;
    items: {
      feedItemId: string;
      nameBn: string;
      unit: string;
      kgPerAnimalPerDay: number;
      quantity: number;
    }[];
  };
}) => {
  const t = useT();
  const { language } = useLanguage();
  return (
    <div className="surface space-y-2 p-4">
      <p className="text-sm font-medium">
        {target.ration?.name.bn}
        {target.ration
          ? ` · ${t("feed.version", { number: target.ration.number })}`
          : ""}
      </p>
      <ul className="space-y-1 text-sm">
        {target.items.map((line) => (
          <li key={line.feedItemId}>
            <span className="font-medium">
              {line.nameBn}: {formatNumber(line.quantity, language)} {line.unit}
            </span>
            <span className="text-muted-foreground">
              {" · "}
              {t("feed.working", {
                headcount: formatNumber(target.animals, language),
                perAnimal: formatNumber(line.kgPerAnimalPerDay, language),
                sessions: formatNumber(target.sessionsPerDay, language),
              })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** The farm's Feed Items. Retired rather than removed: a Ration that fed it still names it. */
const FeedItems = ({
  items,
  onChanged,
}: {
  items: FeedRow[];
  onChanged: () => void;
}) => {
  const t = useT();
  const [name, setName] = useState("");
  const [english, setEnglish] = useState("");
  const [unit, setUnit] = useState("kg");

  const addItem = useMutation(
    orpc.feed.addItem.mutationOptions({
      onSuccess: () => {
        setName("");
        setEnglish("");
        onChanged();
      },
      onError: (error) => toast.error(error.message),
    })
  );
  const retireItem = useMutation(
    orpc.feed.retireItem.mutationOptions({
      onSuccess: onChanged,
      onError: (error) => toast.error(error.message),
    })
  );

  return (
    <Section title={t("feed.items")}>
      <ul className="space-y-1 text-sm">
        {items.map((item) => (
          <li className="flex items-center justify-between gap-2" key={item.id}>
            <span className={item.retiredAt ? "text-muted-foreground" : ""}>
              {item.nameBn} · {item.unit}
              {item.retiredAt ? ` · ${t("feed.retired")}` : ""}
            </span>
            {item.retiredAt ? null : (
              <Button
                onClick={() => retireItem.mutate({ id: item.id })}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t("feed.retire")}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) {
            addItem.mutate({
              name: {
                bn: name.trim(),
                ...(english.trim() ? { en: english.trim() } : {}),
              },
              unit: unit.trim() || "kg",
            });
          }
        }}
      >
        <div className="flex-1 space-y-1">
          <Label htmlFor="feed-name">{t("sop.bangla")}</Label>
          <Input
            id="feed-name"
            onChange={(e) => setName(e.target.value)}
            value={name}
          />
        </div>
        <div className="flex-1 space-y-1">
          <Label htmlFor="feed-en">{t("feed.english")}</Label>
          <Input
            id="feed-en"
            onChange={(e) => setEnglish(e.target.value)}
            value={english}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="feed-unit">{t("feed.unit")}</Label>
          <Input
            className="w-20"
            id="feed-unit"
            onChange={(e) => setUnit(e.target.value)}
            value={unit}
          />
        </div>
        <Button type="submit">{t("feed.addItem")}</Button>
      </form>
    </Section>
  );
};

/**
 * Writing a Ration: a line per Feed Item, in units per animal per day.
 *
 * Every Item the Ration already names is offered, retired ones included. Dropping a line
 * because the feed was retired would rewrite what a Pen is fed without anybody asking for it.
 */
const RationForm = ({
  ration,
  items,
  onSaved,
}: {
  ration: RationRow | null;
  items: FeedRow[];
  onSaved: () => void;
}) => {
  const t = useT();
  const inRation = new Set(
    (ration?.items ?? []).map((line) => line.feedItemId)
  );
  const offered = items.filter(
    (item) => !item.retiredAt || inRation.has(item.id)
  );

  const [name, setName] = useState(ration?.name.bn ?? "");
  const [english, setEnglish] = useState(ration?.name.en ?? "");
  const [kg, setKg] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (ration?.items ?? []).map((line) => [
        line.feedItemId,
        String(line.kgPerAnimalPerDay),
      ])
    )
  );

  const save = useMutation(
    orpc.feed.saveRation.mutationOptions({
      onSuccess: onSaved,
      onError: (error) => toast.error(error.message),
    })
  );

  if (offered.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("feed.noItems")}</p>;
  }

  const lines = offered
    .map((item) => ({
      feedItemId: item.id,
      kgPerAnimalPerDay: Number(kg[item.id] ?? ""),
    }))
    .filter((line) => line.kgPerAnimalPerDay > 0);

  return (
    <form
      className="space-y-2 border-t pt-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) {
          return;
        }
        save.mutate({
          ...(ration ? { rationId: ration.id } : {}),
          name: {
            bn: name.trim(),
            ...(english.trim() ? { en: english.trim() } : {}),
          },
          items: lines,
        });
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label htmlFor={`ration-name-${ration?.id ?? "new"}`}>
            {t("feed.rationName")}
          </Label>
          <Input
            id={`ration-name-${ration?.id ?? "new"}`}
            onChange={(e) => setName(e.target.value)}
            value={name}
          />
        </div>
        <div className="flex-1 space-y-1">
          <Label htmlFor={`ration-en-${ration?.id ?? "new"}`}>
            {t("feed.english")}
          </Label>
          <Input
            id={`ration-en-${ration?.id ?? "new"}`}
            onChange={(e) => setEnglish(e.target.value)}
            value={english}
          />
        </div>
      </div>
      <ul className="space-y-1">
        {offered.map((item) => (
          <li key={item.id}>
            <Label htmlFor={`kg-${ration?.id ?? "new"}-${item.id}`}>
              {item.nameBn} ({item.unit})
              {item.retiredAt ? ` · ${t("feed.retired")}` : ""}
            </Label>
            <Input
              id={`kg-${ration?.id ?? "new"}-${item.id}`}
              min={0}
              onChange={(e) =>
                setKg((current) => ({ ...current, [item.id]: e.target.value }))
              }
              placeholder={t("feed.kgPerAnimal")}
              step="0.1"
              type="number"
              value={kg[item.id] ?? ""}
            />
          </li>
        ))}
      </ul>
      <Button disabled={lines.length === 0 || !name.trim()} type="submit">
        {t("feed.setRation")}
      </Button>
    </form>
  );
};

/**
 * What is in the store, what came into it, and feed coming in. What is on hand is worked out from what
 * came in and what the pens were given — nobody types it — and a line below nothing says feed arrived
 * that nobody wrote down. Recording feed coming in is the Manager's; the Owner reads.
 */
const FeedStock = ({ items }: { items: FeedRow[] }) => {
  const t = useT();
  const { language } = useLanguage();
  const me = useQuery(orpc.people.me.queryOptions());
  const stock = useQuery(orpc.stock.onHand.queryOptions());
  const arrivals = useQuery(orpc.stock.arrivals.queryOptions({ input: {} }));
  const adjustments = useQuery(
    orpc.stock.adjustments.queryOptions({ input: {} })
  );
  const mayRecord = me.data?.roles.includes("manager") ?? false;
  return (
    <Section title={t("stock.title")}>
      <ul className="space-y-1 text-sm">
        {(stock.data ?? []).map((line) => (
          <li
            className="flex flex-wrap justify-between gap-2"
            key={line.feedItemId}
          >
            <span>
              {line.nameBn}
              {line.retiredAt ? ` · ${t("feed.retired")}` : ""}
            </span>
            {mayRecord && !line.retiredAt ? (
              <LowStockAt
                feedItemId={line.feedItemId}
                threshold={line.lowStockAt}
              />
            ) : null}
            <span
              className={
                line.onHand < 0 || line.runningLow ? "text-destructive" : ""
              }
            >
              {formatNumber(line.onHand, language)} {line.unit}
              {line.averagePriceBdt === null
                ? ""
                : ` · ${t("stock.averagePrice", {
                    taka: formatNumber(line.averagePriceBdt, language),
                    unit: line.unit,
                  })}`}
            </span>
          </li>
        ))}
      </ul>
      {mayRecord ? <ReceiveFeed items={items} /> : null}
      {adjustments.data?.length ? (
        <div className="space-y-1">
          <h3 className="text-sm font-medium">{t("stock.adjustments")}</h3>
          <ul className="space-y-1 text-sm">
            {adjustments.data.map((one) => (
              <li key={one.id}>
                {formatDate(one.countedAt, language)} · {one.nameBn} ·{" "}
                {t("stock.adjustment", {
                  expected: formatNumber(one.expected, language),
                  counted: formatNumber(one.counted, language),
                })}{" "}
                · {one.reason}
                {one.countedByName ? ` · ${one.countedByName}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {arrivals.data?.length ? (
        <div className="space-y-1">
          <h3 className="text-sm font-medium">{t("stock.arrivals")}</h3>
          <ul className="space-y-1 text-sm">
            {arrivals.data.map((one) => (
              <li key={one.id}>
                {formatDate(one.receivedOn, language)} · {one.nameBn} ·{" "}
                {formatNumber(one.quantity, language)} {one.unit}
                {one.maunds === null
                  ? ""
                  : ` (${t("stock.maunds", { maunds: formatNumber(one.maunds, language) })})`}
                {one.priceBdt === null
                  ? ` · ${t("stock.harvest")}`
                  : ` · ৳${formatNumber(one.priceBdt, language)} · ${one.sellerName ?? ""}`}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Section>
  );
};

/** How low a Feed Item may run before the Manager is told; blank for one nobody watches. */
const LowStockAt = ({
  feedItemId,
  threshold,
}: {
  feedItemId: string;
  threshold: number | null;
}) => {
  const t = useT();
  const queryClient = useQueryClient();
  const [value, setValue] = useState(
    threshold === null ? "" : String(threshold)
  );
  const save = useMutation(
    orpc.feed.setLowStock.mutationOptions({
      // The level decides what is on the home queues as well as this screen.
      onSuccess: () =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: orpc.stock.key() }),
          queryClient.invalidateQueries({ queryKey: orpc.home.key() }),
        ]),
      onError: (error) => toast.error(error.message || t("common.error")),
    })
  );
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({
          feedItemId,
          threshold: value.trim() === "" ? null : Number(value),
        });
      }}
    >
      <Input
        aria-label={t("stock.lowAt")}
        className="h-8 w-20"
        min={0.1}
        step="0.1"
        onChange={(event) => setValue(event.target.value)}
        placeholder={t("stock.lowAt")}
        type="number"
        value={value}
      />
      <Button disabled={save.isPending} size="sm" type="submit" variant="ghost">
        {t("stock.setLow")}
      </Button>
    </form>
  );
};

/** The form for feed coming in: a Purchase, with its price and seller, or a Harvest, with neither. */
const ReceiveFeed = ({ items }: { items: FeedRow[] }) => {
  const t = useT();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const live = items.filter((item) => !item.retiredAt);
  const [feedItemId, setFeedItemId] = useState("");
  const [kind, setKind] = useState<"purchase" | "harvest">("purchase");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [seller, setSeller] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [receivedOn, setReceivedOn] = useState(() => farmDayOf(new Date()));
  // One id per filling-in of the form: a second tap is the same lorry, not another.
  const [entryId, setEntryId] = useState(() => crypto.randomUUID());
  const chosenItem = live.find(
    (item) => item.id === (feedItemId || live[0]?.id)
  );
  const receive = useMutation(
    orpc.stock.receive.mutationOptions({
      onSuccess: async () => {
        setQuantity("");
        setPrice("");
        setEntryId(crypto.randomUUID());
        toast.success(t("stock.received"));
        await queryClient.invalidateQueries({ queryKey: orpc.stock.key() });
      },
      onError: (error) =>
        toast.error(
          wordedRefusal(error, t) ?? (error.message || t("common.error"))
        ),
    })
  );
  if (!chosenItem) {
    return null;
  }
  const amount = Number(quantity);
  const complete =
    amount > 0 &&
    (kind === "harvest" || (Number(price) > 0 && seller.trim() !== ""));
  return (
    <form
      className="surface space-y-2 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        receive.mutate({
          id: entryId,
          feedItemId: chosenItem.id,
          kind,
          quantity: amount,
          receivedOn,
          ...(kind === "purchase"
            ? {
                priceBdt: Number(price),
                seller: { name: seller },
                paymentMethod,
              }
            : {}),
        });
      }}
    >
      <div className="flex flex-wrap gap-2">
        <select
          aria-label={t("feed.items")}
          className="bg-card border-input h-11 rounded-md border px-3 text-base md:h-9 md:text-sm"
          onChange={(event) => setFeedItemId(event.target.value)}
          value={chosenItem.id}
        >
          {live.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nameBn}
            </option>
          ))}
        </select>
        <select
          aria-label={t("stock.kind")}
          className="bg-card border-input h-11 rounded-md border px-3 text-base md:h-9 md:text-sm"
          onChange={(event) =>
            setKind(event.target.value === "harvest" ? "harvest" : "purchase")
          }
          value={kind}
        >
          <option value="purchase">{t("stock.purchase")}</option>
          <option value="harvest">{t("stock.harvest")}</option>
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="stock-quantity">
          {t("stock.quantity", { unit: chosenItem.unit })}
        </Label>
        <Input
          id="stock-quantity"
          min={0}
          onChange={(event) => setQuantity(event.target.value)}
          step="0.1"
          type="number"
          value={quantity}
        />
        {/* A trader's slip is in maunds: shown alongside kg on a purchase, and nowhere else. */}
        {kind === "purchase" && chosenItem.unit === "kg" && amount > 0 ? (
          <p className="text-muted-foreground text-xs">
            {t("stock.maunds", {
              maunds: formatNumber(maundsOf(amount), language),
            })}
          </p>
        ) : null}
      </div>
      {kind === "purchase" ? (
        <>
          <div className="space-y-1">
            <Label htmlFor="stock-price">{t("stock.price")}</Label>
            <Input
              id="stock-price"
              min={0}
              onChange={(event) => setPrice(event.target.value)}
              type="number"
              value={price}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="stock-seller">{t("stock.seller")}</Label>
            <Input
              id="stock-seller"
              onChange={(event) => setSeller(event.target.value)}
              value={seller}
            />
          </div>
          <PaymentMethodField
            id="stock-paid-by"
            onChange={setPaymentMethod}
            value={paymentMethod}
          />
        </>
      ) : null}
      <div className="space-y-1">
        <Label htmlFor="stock-on">{t("stock.receivedOn")}</Label>
        <Input
          id="stock-on"
          onChange={(event) => setReceivedOn(event.target.value)}
          type="date"
          value={receivedOn}
        />
      </div>
      <Button
        disabled={!complete || receive.isPending}
        type="submit"
        variant="outline"
      >
        {t("stock.record")}
      </Button>
    </form>
  );
};

export const Route = createFileRoute("/_auth/admin/feed")({
  component: FeedPage,
});
