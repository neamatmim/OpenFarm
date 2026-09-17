import type { NotPrescribable, PaymentMethod } from "@OpenFarm/domain";
import { farmDayOf } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Pill, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { EmptyState, Page, PageHeader, Section } from "@/components/page";
import { PaymentMethodField } from "@/components/payment-method";
import { useLanguage, useT } from "@/i18n/language-provider";
import { wordedRefusal } from "@/lib/correction-refusal";
import { sayWhy } from "@/lib/saying";
import { orpc } from "@/utils/orpc";

/** Why a product may not be prescribed, in the reader's words. Typed by the reason, so a
 *  new one is a compile error here rather than a blank line on a Vet's screen. */
const WHY_NOT: Record<NotPrescribable, MessageKey> = {
  no_withdrawal_days: "drugs.blank",
  retired: "drugs.retiredReason",
};

/**
 * The farm's Drug List: what it treats animals with, and what each product costs the milk
 * and the meat in days.
 *
 * There is no national table for this — the days come off the label and the prescribing
 * Vet — so this list is the only place they exist, and it is what the farm shows a slaughter
 * vet asking about the last thirty days. A product whose days are blank sits here saying so:
 * the farm owns it, and nothing may be prescribed from it yet.
 */
const DrugsPage = () => {
  const t = useT();
  const queryClient = useQueryClient();
  const me = useQuery(orpc.people.me.queryOptions());
  const drugs = useQuery(orpc.drugs.list.queryOptions());
  const [name, setName] = useState("");
  // A vet called in for a visit reads the Drug List to prescribe from; keeping it is the farm's own Vet's.
  const visiting = me.data?.scopes.vet?.kind === "cases";
  const isVet = (me.data?.roles.includes("vet") ?? false) && !visiting;
  const buys =
    me.data?.roles.some((role) => role === "owner" || role === "manager") ??
    false;

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.drugs.key() });
  const add = useMutation(
    orpc.drugs.add.mutationOptions({
      onSuccess: () => {
        setName("");
        refresh();
      },
      onError: (error) => toast.error(sayWhy(error, t)),
    })
  );
  const retire = useMutation(
    orpc.drugs.retire.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error(sayWhy(error, t)),
    })
  );
  const bringBack = useMutation(
    orpc.drugs.bringBack.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error(sayWhy(error, t)),
    })
  );

  return (
    <Page>
      <PageHeader title={t("drugs.title")} />

      <Section>
        {drugs.data?.length ? (
          <>
            <ul className="space-y-2 md:hidden">
              {drugs.data.map((product) => (
                <Product
                  isVet={isVet}
                  key={product.id}
                  onChanged={refresh}
                  onBringBack={() => bringBack.mutate({ id: product.id })}
                  onRetire={() => retire.mutate({ id: product.id })}
                  product={product}
                />
              ))}
            </ul>
            <DrugTable
              drugs={drugs.data}
              isVet={isVet}
              onBringBack={(id) => bringBack.mutate({ id })}
              onChanged={refresh}
              onRetire={(id) => retire.mutate({ id })}
            />
          </>
        ) : (
          <EmptyState bare icon={Pill} title={t("drugs.none")} />
        )}

        {visiting ? null : (
          <form
            className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim()) {
                add.mutate({ name: { bn: name.trim() } });
              }
            }}
          >
            <div className="flex-1 space-y-1">
              <Label htmlFor="drug-name">{t("drugs.name")}</Label>
              <Input
                id="drug-name"
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </div>
            <Button type="submit">
              <Plus aria-hidden />
              {t("drugs.add")}
            </Button>
          </form>
        )}
      </Section>

      {buys && drugs.data ? (
        <BuyMedicine
          products={drugs.data.filter((product) => !product.retiredAt)}
        />
      ) : null}
    </Page>
  );
};

const NOTHING_BOUGHT = {
  quantity: "",
  doses: "",
  price: "",
  seller: "",
};

/**
 * Medicine bought for the Drug List: how much as the box says it, roughly how many doses that is, what
 * it cost and who sold it. The Manager's, and the farm's money for the medicine comes from it.
 */
const BuyMedicine = ({
  products,
}: {
  products: { id: string; nameBn: string }[];
}) => {
  const t = useT();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const [productId, setProductId] = useState("");
  const [typed, setTyped] = useState(NOTHING_BOUGHT);
  const [purchasedOn, setPurchasedOn] = useState(() => farmDayOf(new Date()));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const chosen = products.find(
    (product) => product.id === (productId || products[0]?.id)
  );
  const bought = useQuery({
    ...orpc.drugs.purchases.queryOptions({
      input: { drugProductId: chosen?.id ?? "" },
    }),
    enabled: chosen !== undefined,
  });
  const buy = useMutation(
    orpc.drugs.purchase.mutationOptions({
      onSuccess: async () => {
        setTyped(NOTHING_BOUGHT);
        toast.success(t("drugs.bought"));
        await queryClient.invalidateQueries({ queryKey: orpc.drugs.key() });
      },
      onError: (error) =>
        toast.error(
          wordedRefusal(error, t) ?? (error.message || t("common.error"))
        ),
    })
  );
  if (!chosen) {
    return null;
  }
  const set = (key: keyof typeof NOTHING_BOUGHT) => (value: string) =>
    setTyped((current) => ({ ...current, [key]: value }));
  const complete =
    typed.quantity.trim() !== "" &&
    Number(typed.doses) > 0 &&
    Number(typed.price) > 0 &&
    typed.seller.trim() !== "";
  return (
    <Section title={t("drugs.buy")}>
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          buy.mutate({
            drugProductId: chosen.id,
            quantity: typed.quantity.trim(),
            doses: Number(typed.doses),
            priceBdt: Number(typed.price),
            seller: { name: typed.seller.trim() },
            purchasedOn,
            paymentMethod,
          });
        }}
      >
        <select
          aria-label={t("drugs.title")}
          className="bg-card border-input h-11 w-full rounded-md border px-3 text-base md:h-9 md:text-sm"
          onChange={(event) => setProductId(event.target.value)}
          value={chosen.id}
        >
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.nameBn}
            </option>
          ))}
        </select>
        {(
          [
            ["quantity", "drugs.quantity", "text"],
            ["doses", "drugs.doses", "number"],
            ["price", "drugs.price", "number"],
            ["seller", "drugs.seller", "text"],
          ] as const
        ).map(([key, label, type]) => (
          <div className="space-y-1" key={key}>
            <Label htmlFor={`buy-${key}`}>{t(label)}</Label>
            <Input
              id={`buy-${key}`}
              onChange={(event) => set(key)(event.target.value)}
              type={type}
              value={typed[key]}
            />
          </div>
        ))}
        <div className="space-y-1">
          <Label htmlFor="buy-on">{t("drugs.boughtOn")}</Label>
          <Input
            id="buy-on"
            onChange={(event) => setPurchasedOn(event.target.value)}
            type="date"
            value={purchasedOn}
          />
        </div>
        <PaymentMethodField
          id="buy-paid-by"
          onChange={setPaymentMethod}
          value={paymentMethod}
        />
        <Button
          disabled={!complete || buy.isPending}
          type="submit"
          variant="outline"
        >
          {t("drugs.recordPurchase")}
        </Button>
      </form>
      {bought.data?.length ? (
        <ul className="space-y-1 text-sm md:hidden">
          {bought.data.map((one) => (
            <li className="bg-card rounded-lg border p-3" key={one.id}>
              {formatDate(one.purchasedOn, language)} · {one.quantity} ·{" "}
              {t("drugs.dosesHeld", {
                doses: formatNumber(one.doses, language),
              })}{" "}
              · ৳{formatNumber(one.priceBdt, language)} · {one.sellerName}
            </li>
          ))}
        </ul>
      ) : null}
      {bought.data?.length ? <PurchaseTable purchases={bought.data} /> : null}
    </Section>
  );
};

/** One product: its days, or the fact that nobody has written them yet. */
const Product = ({
  product,
  isVet,
  onChanged,
  onRetire,
  onBringBack,
}: {
  product: {
    id: string;
    nameBn: string;
    nameEn: string | null;
    milkWithdrawalDays: number | null;
    meatWithdrawalDays: number | null;
    daysSetByName: string | null;
    daysSetAt: Date | null;
    retiredAt: Date | null;
    vaccine: boolean;
    prescribable: boolean;
    whyNot: NotPrescribable | null;
  };
  isVet: boolean;
  onChanged: () => void;
  onRetire: () => void;
  onBringBack: () => void;
}) => {
  const t = useT();
  const { language } = useLanguage();
  const [milk, setMilk] = useState(
    product.milkWithdrawalDays === null
      ? ""
      : String(product.milkWithdrawalDays)
  );
  const [meat, setMeat] = useState(
    product.meatWithdrawalDays === null
      ? ""
      : String(product.meatWithdrawalDays)
  );
  const save = useMutation(
    orpc.drugs.setWithdrawal.mutationOptions({
      onSuccess: onChanged,
      onError: (error) => toast.error(sayWhy(error, t)),
    })
  );
  const markVaccine = useMutation(
    orpc.drugs.markVaccine.mutationOptions({
      onSuccess: onChanged,
      onError: (error) => toast.error(sayWhy(error, t)),
    })
  );

  return (
    <li className="surface space-y-2 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className={product.retiredAt ? "text-muted-foreground" : ""}>
          {language === "en" && product.nameEn
            ? product.nameEn
            : product.nameBn}
          {product.vaccine ? ` · ${t("drugs.vaccine")}` : ""}
          {product.retiredAt ? ` · ${t("drugs.retired")}` : ""}
        </span>
        {isVet ? (
          <Button
            onClick={product.retiredAt ? onBringBack : onRetire}
            size="sm"
            type="button"
            variant="ghost"
          >
            {product.retiredAt ? t("drugs.bringBack") : t("drugs.retire")}
          </Button>
        ) : null}
      </div>

      {product.milkWithdrawalDays === null ||
      product.meatWithdrawalDays === null ? null : (
        <p className="text-muted-foreground text-sm">
          {t("drugs.milkDays")}:{" "}
          {t("drugs.days", {
            count: formatNumber(product.milkWithdrawalDays, language),
          })}{" "}
          · {t("drugs.meatDays")}:{" "}
          {t("drugs.days", {
            count: formatNumber(product.meatWithdrawalDays, language),
          })}
          {product.daysSetByName && product.daysSetAt ? (
            <span className="block text-xs">
              {t("drugs.setBy", {
                name: product.daysSetByName,
                date: formatDate(new Date(product.daysSetAt), language, "date"),
              })}
            </span>
          ) : null}
        </p>
      )}
      {product.whyNot ? (
        <p className="text-warning text-sm">{t(WHY_NOT[product.whyNot])}</p>
      ) : null}

      {isVet ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate({
              id: product.id,
              milkWithdrawalDays: Number(milk),
              meatWithdrawalDays: Number(meat),
            });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor={`milk-${product.id}`}>{t("drugs.milkDays")}</Label>
            <Input
              className="w-24"
              id={`milk-${product.id}`}
              max={365}
              min={0}
              onChange={(event) => setMilk(event.target.value)}
              step="1"
              type="number"
              value={milk}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`meat-${product.id}`}>{t("drugs.meatDays")}</Label>
            <Input
              className="w-24"
              id={`meat-${product.id}`}
              max={365}
              min={0}
              onChange={(event) => setMeat(event.target.value)}
              step="1"
              type="number"
              value={meat}
            />
          </div>
          <Button disabled={milk === "" || meat === ""} type="submit">
            {t("drugs.save")}
          </Button>
          <Button
            disabled={markVaccine.isPending}
            onClick={() =>
              markVaccine.mutate({ id: product.id, vaccine: !product.vaccine })
            }
            type="button"
            variant="outline"
          >
            {t(product.vaccine ? "drugs.unmarkVaccine" : "drugs.markVaccine")}
          </Button>
        </form>
      ) : (
        <p className="text-muted-foreground text-xs">
          {t("drugs.managerAdds")}
        </p>
      )}
    </li>
  );
};

type DrugProduct = Awaited<ReturnType<typeof orpc.drugs.list.call>>[number];

/** Days as a box holds them: blank for days nobody has written. */
const daysTyped = (days: number | null): string =>
  days === null ? "" : String(days);

interface DrugRow extends DrugProduct {
  isVet: boolean;
  milk: string;
  meat: string;
  handleMilk: (value: string) => void;
  handleMeat: (value: string) => void;
  onChanged: () => void;
  onRetire: () => void;
  onBringBack: () => void;
}

/** A row's days boxes sit in their own cells, and belong to the form in the row's last cell by its id. */
const daysForm = (id: string) => `drug-days-${id}`;

const ProductCell = ({ row }: { row: { original: DrugRow } }) => {
  const t = useT();
  const { language } = useLanguage();
  const product = row.original;
  return (
    <div className="flex flex-col gap-0.5">
      <span className={product.retiredAt ? "text-muted-foreground" : ""}>
        <span className="font-medium">
          {language === "en" && product.nameEn
            ? product.nameEn
            : product.nameBn}
        </span>
        {product.vaccine ? ` · ${t("drugs.vaccine")}` : ""}
        {product.retiredAt ? ` · ${t("drugs.retired")}` : ""}
      </span>
      {product.whyNot ? (
        <span className="text-warning text-sm">
          {t(WHY_NOT[product.whyNot])}
        </span>
      ) : null}
    </div>
  );
};

/** One product's days of one kind: a box the in-house Vet writes them in, the days as written for everybody else. */
const Days = ({
  days,
  typed,
  onType,
  label,
  row,
}: {
  days: number | null;
  typed: string;
  onType: (value: string) => void;
  label: string;
  row: DrugRow;
}) => {
  const t = useT();
  const { language } = useLanguage();
  if (row.isVet) {
    return (
      <Input
        aria-label={label}
        className="ml-auto w-20"
        form={daysForm(row.id)}
        max={365}
        min={0}
        onChange={(event) => onType(event.target.value)}
        step="1"
        type="number"
        value={typed}
      />
    );
  }
  return days === null
    ? "—"
    : t("drugs.days", { count: formatNumber(days, language) });
};

const MilkDaysCell = ({ row }: { row: { original: DrugRow } }) => {
  const t = useT();
  return (
    <Days
      days={row.original.milkWithdrawalDays}
      label={t("drugs.milkDays")}
      onType={row.original.handleMilk}
      row={row.original}
      typed={row.original.milk}
    />
  );
};

const MeatDaysCell = ({ row }: { row: { original: DrugRow } }) => {
  const t = useT();
  return (
    <Days
      days={row.original.meatWithdrawalDays}
      label={t("drugs.meatDays")}
      onType={row.original.handleMeat}
      row={row.original}
      typed={row.original.meat}
    />
  );
};

const SetByCell = ({ row }: { row: { original: DrugRow } }) => {
  const { language } = useLanguage();
  const { daysSetByName, daysSetAt } = row.original;
  if (!daysSetByName || !daysSetAt) {
    return "—";
  }
  return (
    <div className="flex flex-col">
      <span>{daysSetByName}</span>
      <span className="text-muted-foreground text-xs whitespace-nowrap">
        {formatDate(new Date(daysSetAt), language, "date")}
      </span>
    </div>
  );
};

/** What the in-house Vet does to a product from its row: write its days, mark it a vaccine or not, retire it. */
const KeepCell = ({ row }: { row: { original: DrugRow } }) => {
  const t = useT();
  const product = row.original;
  const save = useMutation(
    orpc.drugs.setWithdrawal.mutationOptions({
      onSuccess: product.onChanged,
      onError: (error) => toast.error(sayWhy(error, t)),
    })
  );
  const markVaccine = useMutation(
    orpc.drugs.markVaccine.mutationOptions({
      onSuccess: product.onChanged,
      onError: (error) => toast.error(sayWhy(error, t)),
    })
  );
  return (
    <form
      className="flex flex-wrap justify-end gap-2"
      id={daysForm(product.id)}
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({
          id: product.id,
          milkWithdrawalDays: Number(product.milk),
          meatWithdrawalDays: Number(product.meat),
        });
      }}
    >
      <Button
        disabled={product.milk === "" || product.meat === ""}
        size="sm"
        type="submit"
      >
        {t("drugs.save")}
      </Button>
      <Button
        disabled={markVaccine.isPending}
        onClick={() =>
          markVaccine.mutate({ id: product.id, vaccine: !product.vaccine })
        }
        size="sm"
        type="button"
        variant="outline"
      >
        {t(product.vaccine ? "drugs.unmarkVaccine" : "drugs.markVaccine")}
      </Button>
      <Button
        onClick={product.retiredAt ? product.onBringBack : product.onRetire}
        size="sm"
        type="button"
        variant="ghost"
      >
        {product.retiredAt ? t("drugs.bringBack") : t("drugs.retire")}
      </Button>
    </form>
  );
};

const drugColumn = createListColumns<DrugRow>();
const drugReadColumns = [
  drugColumn.accessor("nameBn", {
    header: listHeader("drugs.name"),
    cell: ProductCell,
  }),
  drugColumn.accessor((product) => product.milkWithdrawalDays ?? -1, {
    id: "milkDays",
    header: listHeader("drugs.milkDays"),
    cell: MilkDaysCell,
    meta: { align: "end" },
  }),
  drugColumn.accessor((product) => product.meatWithdrawalDays ?? -1, {
    id: "meatDays",
    header: listHeader("drugs.meatDays"),
    cell: MeatDaysCell,
    meta: { align: "end" },
  }),
  drugColumn.accessor((product) => product.daysSetByName ?? "", {
    id: "setBy",
    header: listHeader("drugs.col.setBy"),
    cell: SetByCell,
  }),
];
const drugColumns = drugColumn.columns(drugReadColumns);
const drugKeepColumns = drugColumn.columns([
  ...drugReadColumns,
  drugColumn.display({
    id: "keep",
    header: ActionsHeader,
    cell: KeepCell,
    meta: { align: "end" },
  }),
]);

/** The Drug List as a table where there is room: each product's milk and meat days side by side, and who wrote
 *  them. The in-house Vet writes the days in the row itself. */
const DrugTable = ({
  drugs,
  isVet,
  onChanged,
  onRetire,
  onBringBack,
}: {
  drugs: DrugProduct[];
  isVet: boolean;
  onChanged: () => void;
  onRetire: (id: string) => void;
  onBringBack: (id: string) => void;
}) => {
  const t = useT();
  const [typed, setTyped] = useState<
    Record<string, { milk?: string; meat?: string }>
  >({});
  const type = (id: string, kind: "milk" | "meat") => (value: string) =>
    setTyped((current) => ({
      ...current,
      [id]: { ...current[id], [kind]: value },
    }));
  const table = useListTable({
    columns: isVet ? drugKeepColumns : drugColumns,
    data: drugs.map((product) => ({
      ...product,
      isVet,
      milk: typed[product.id]?.milk ?? daysTyped(product.milkWithdrawalDays),
      meat: typed[product.id]?.meat ?? daysTyped(product.meatWithdrawalDays),
      handleMilk: type(product.id, "milk"),
      handleMeat: type(product.id, "meat"),
      onChanged,
      onRetire: () => onRetire(product.id),
      onBringBack: () => onBringBack(product.id),
    })),
    getRowId: (row) => row.id,
  });
  return (
    <div className="hidden flex-col gap-3 md:flex">
      <DataTable table={table} />
      {isVet ? null : (
        <p className="text-muted-foreground text-xs">
          {t("drugs.managerAdds")}
        </p>
      )}
    </div>
  );
};

type Purchase = Awaited<ReturnType<typeof orpc.drugs.purchases.call>>[number];

const BoughtOnCell = ({ row }: { row: { original: Purchase } }) => {
  const { language } = useLanguage();
  return (
    <span className="whitespace-nowrap">
      {formatDate(row.original.purchasedOn, language)}
    </span>
  );
};

const DosesCell = ({ row }: { row: { original: Purchase } }) => {
  const { language } = useLanguage();
  return formatNumber(row.original.doses, language);
};

const PurchasePriceCell = ({ row }: { row: { original: Purchase } }) => {
  const { language } = useLanguage();
  return `৳${formatNumber(row.original.priceBdt, language)}`;
};

const purchaseColumn = createListColumns<Purchase>();
const purchaseColumns = purchaseColumn.columns([
  purchaseColumn.accessor((one) => new Date(one.purchasedOn).getTime(), {
    id: "purchasedOn",
    header: listHeader("drugs.boughtOn"),
    cell: BoughtOnCell,
  }),
  purchaseColumn.accessor("quantity", {
    header: listHeader("drugs.quantity"),
  }),
  purchaseColumn.accessor("doses", {
    header: listHeader("drugs.doses"),
    cell: DosesCell,
    meta: { align: "end" },
  }),
  purchaseColumn.accessor("priceBdt", {
    header: listHeader("drugs.price"),
    cell: PurchasePriceCell,
    meta: { align: "end" },
  }),
  purchaseColumn.accessor("sellerName", {
    header: listHeader("drugs.seller"),
  }),
]);

/** A product's Medicine Purchases as a table where there is room, newest first. */
const PurchaseTable = ({ purchases }: { purchases: Purchase[] }) => {
  const table = useListTable({
    columns: purchaseColumns,
    data: purchases,
    getRowId: (row) => row.id,
  });
  return <DataTable className="hidden md:block" table={table} />;
};

export const Route = createFileRoute("/_auth/drugs")({
  /** The Vet keeps it, the Manager adds to it, the Owner reads it — and Barn Staff have no
   *  business in it at all, so they are not shown a form that would refuse them. */
  beforeLoad: ({ context }) => {
    const { roles } = context.me;
    const allowed = new Set(["owner", "manager", "vet"]);
    if (!roles.some((role) => allowed.has(role))) {
      throw redirect({ to: "/today", search: {} });
    }
  },
  component: DrugsPage,
});
