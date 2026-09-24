import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  CalendarClock,
  Gauge,
  ListPlus,
  PackagePlus,
  Pencil,
  Pill,
  Plus,
  ShoppingCart,
  Syringe,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { LotAndExpiry } from "@/components/expiry";
import { Nothing, SaidDate } from "@/components/list-cells";
import { EmptyState, Section, StatusBadge } from "@/components/page";
import type { RowAction } from "@/components/page-kit";
import {
  ConfirmDialog,
  FormDialog,
  FormField,
  RowMenu,
} from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

import type { DrugProduct } from "./drug-types";
import { STANDING_TONE, productName, standingOf } from "./drug-types";

/** Days as a box holds them: blank for days nobody has written. */
const daysTyped = (days: number | null): string =>
  days === null ? "" : String(days);

/** What the page does when a product's row is used: the in-house Vet keeps it, the Manager buys for it. */
interface ProductActions {
  isVet: boolean;
  mayBuy: boolean;
  busy: boolean;
  handleDays: (product: DrugProduct) => void;
  handleVaccine: (product: DrugProduct) => void;
  handleRetire: (product: DrugProduct) => void;
  handleBringBack: (product: DrugProduct) => void;
  handleRename: (product: DrugProduct) => void;
  handleBuy: (productId: string) => void;
  /** What was bought of it: the Bought tab, with it chosen. */
  handleBought: (productId: string) => void;
  handleLevel: (product: DrugProduct) => void;
}

interface ProductRow extends DrugProduct {
  actions: ProductActions;
}

/** A product's standing, as a word with its colour. */
const Standing = ({ product }: { product: DrugProduct }) => {
  const { t } = useLanguage();
  const standing = standingOf(product);
  const words = {
    prescribable: t("drugs.status.prescribable"),
    waiting: t("drugs.blank"),
    retired: t("drugs.retired"),
  } as const;
  return (
    <StatusBadge
      icon={standing === "retired" ? Archive : undefined}
      tone={STANDING_TONE[standing]}
    >
      {words[standing]}
    </StatusBadge>
  );
};

/** A vaccine says so beside its name: the Campaigns draw from these. */
const VaccineMark = ({ product }: { product: DrugProduct }) => {
  const { t } = useLanguage();
  if (!product.vaccine) {
    return null;
  }
  return (
    <StatusBadge icon={Syringe} tone="info">
      {t("drugs.vaccine")}
    </StatusBadge>
  );
};

const NameCell = ({ row }: { row: { original: ProductRow } }) => {
  const { language } = useLanguage();
  const product = row.original;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={product.retiredAt ? "text-muted-foreground" : "font-medium"}
      >
        {productName(product, language)}
      </span>
      <VaccineMark product={product} />
    </div>
  );
};

const StandingCell = ({ row }: { row: { original: ProductRow } }) => (
  <Standing product={row.original} />
);

/**
 * What the store holds of a product: the doses left, whether that is under the level set for it, and the soonest
 * day any of it expires. A list cached before the store was counted says nothing, and shows nothing.
 */
const InStock = ({ product }: { product: DrugProduct }) => {
  const { t, language } = useLanguage();
  const { stock } = product;
  if (!stock) {
    return <Nothing />;
  }
  return (
    <span className="flex flex-col items-start gap-1">
      <span className="flex flex-wrap items-center gap-1 whitespace-nowrap">
        <span className="font-medium tabular-nums">
          {t("drugs.dosesOnHand", {
            doses: formatNumber(stock.onHand, language),
          })}
        </span>
        {stock.runningLow ? (
          <StatusBadge tone="warning">{t("drugs.runningLow")}</StatusBadge>
        ) : null}
      </span>
    </span>
  );
};

/**
 * The Lot with doses left that goes off first — its number, so the box can be found, and its day — and, in red,
 * how many doses are already past their day and still on the shelf.
 */
const FirstToExpire = ({ product }: { product: DrugProduct }) => {
  const { t, language } = useLanguage();
  const { stock } = product;
  const expired = stock?.expiredOnHand ?? 0;
  if (!(stock?.nextExpiresOn || expired > 0)) {
    return <Nothing />;
  }
  return (
    <span className="flex flex-col items-start gap-1">
      {stock?.nextExpiresOn ? (
        <LotAndExpiry
          expiresOn={stock.nextExpiresOn}
          lotNumber={stock.nextLotNumber ?? null}
          standing={stock.nextStanding}
        />
      ) : null}
      {expired > 0 ? (
        <span className="text-danger text-xs font-medium">
          {t("drugs.expiredOnHand", {
            doses: formatNumber(expired, language),
          })}
        </span>
      ) : null}
    </span>
  );
};

const ExpiryCell = ({ row }: { row: { original: ProductRow } }) => (
  <FirstToExpire product={row.original} />
);

/** The doses below which the store says it is running low, or a dash for a product nobody watches. */
const LevelCell = ({ row }: { row: { original: ProductRow } }) => {
  const { t, language } = useLanguage();
  const level = row.original.stock?.lowStockAt ?? row.original.lowStockAt;
  if (level === null || level === undefined) {
    return <Nothing />;
  }
  return (
    <span className="whitespace-nowrap tabular-nums">
      {t("drugs.dosesOnHand", { doses: formatNumber(level, language) })}
    </span>
  );
};

/** The day it was last bought, or a dash for a product never bought. */
const LastBoughtCell = ({ row }: { row: { original: ProductRow } }) => (
  <span className="whitespace-nowrap">
    <SaidDate at={row.original.stock?.lastPurchasedOn} />
  </span>
);

const StockCell = ({ row }: { row: { original: ProductRow } }) => (
  <InStock product={row.original} />
);

/** Days of one kind as written, or a dash where nobody has written them. */
const DaysFigure = ({ days }: { days: number | null }) => {
  const { t, language } = useLanguage();
  if (days === null) {
    return <Nothing />;
  }
  return (
    <span className="whitespace-nowrap">
      {t("drugs.days", { count: formatNumber(days, language) })}
    </span>
  );
};

const MilkDaysCell = ({ row }: { row: { original: ProductRow } }) => (
  <DaysFigure days={row.original.milkWithdrawalDays} />
);

const MeatDaysCell = ({ row }: { row: { original: ProductRow } }) => (
  <DaysFigure days={row.original.meatWithdrawalDays} />
);

const SetByCell = ({ row }: { row: { original: ProductRow } }) => {
  const { daysSetByName, daysSetAt } = row.original;
  if (!daysSetByName || !daysSetAt) {
    return <Nothing />;
  }
  return (
    <div className="flex flex-col">
      <span>{daysSetByName}</span>
      <span className="text-muted-foreground text-xs whitespace-nowrap">
        <SaidDate at={daysSetAt} />
      </span>
    </div>
  );
};

/** What a product's menu holds: for the in-house Vet, its days, whether it is a vaccine, and retiring it; for
 *  whoever buys, medicine bought for it. */
const menuFor = (
  product: DrugProduct,
  actions: ProductActions,
  t: ReturnType<typeof useLanguage>["t"]
): RowAction[] => {
  const menu: RowAction[] = [];
  if (actions.mayBuy && !product.retiredAt) {
    menu.push(
      {
        label: t("drugs.recordPurchase"),
        icon: PackagePlus,
        handleSelect: () => actions.handleBuy(product.id),
      },
      {
        label: t("drugs.setLowStock"),
        icon: Gauge,
        handleSelect: () => actions.handleLevel(product),
      }
    );
  }
  // What was bought of it — retired ones too, whose history still stands — without choosing it again on the tab.
  if (actions.mayBuy) {
    menu.push({
      label: t("drugs.whatWasBought"),
      icon: ShoppingCart,
      handleSelect: () => actions.handleBought(product.id),
    });
  }
  if (!actions.isVet) {
    return menu;
  }
  // Not while the days are waiting to be written: the row has them as a button of its own then, and one act
  // offered twice on one row is one too many.
  if (standingOf(product) !== "waiting") {
    menu.push({
      label: t("drugs.save"),
      icon: CalendarClock,
      handleSelect: () => actions.handleDays(product),
    });
  }
  menu.push(
    {
      label: t("drugs.rename"),
      icon: Pencil,
      handleSelect: () => actions.handleRename(product),
    },
    {
      label: t(product.vaccine ? "drugs.unmarkVaccine" : "drugs.markVaccine"),
      icon: Syringe,
      disabled: actions.busy,
      handleSelect: () => actions.handleVaccine(product),
    }
  );
  if (product.retiredAt) {
    menu.push({
      label: t("drugs.bringBack"),
      icon: ArchiveRestore,
      handleSelect: () => actions.handleBringBack(product),
    });
  } else {
    menu.push({
      label: t("drugs.retire"),
      icon: Archive,
      destructive: true,
      handleSelect: () => actions.handleRetire(product),
    });
  }
  return menu;
};

/** The end of a product's row: the days, as a button, where the Vet has yet to write them; everything else in the menu. */
const ProductRowActions = ({
  product,
  actions,
}: {
  product: DrugProduct;
  actions: ProductActions;
}) => {
  const { t, language } = useLanguage();
  const { handleDays } = actions;
  const waiting = actions.isVet && standingOf(product) === "waiting";
  return (
    <div className="flex items-center justify-end gap-1">
      {waiting ? (
        <Button
          onClick={() => handleDays(product)}
          size="sm"
          type="button"
          variant="outline"
        >
          <CalendarClock aria-hidden data-icon="inline-start" />
          {t("drugs.save")}
        </Button>
      ) : null}
      <RowMenu
        actions={menuFor(product, actions, t)}
        label={t("drugs.rowActions", {
          name: productName(product, language),
        })}
      />
    </div>
  );
};

const ActionsCell = ({ row }: { row: { original: ProductRow } }) => (
  <ProductRowActions actions={row.original.actions} product={row.original} />
);

const column = createListColumns<ProductRow>();
const productColumns = column.columns([
  column.accessor("nameBn", {
    header: listHeader("drugs.name"),
    cell: NameCell,
  }),
  column.accessor(
    (product) =>
      ["waiting", "prescribable", "retired"].indexOf(standingOf(product)),
    {
      id: "standing",
      header: listHeader("drugs.col.status"),
      cell: StandingCell,
    }
  ),
  column.accessor((product) => product.stock?.onHand ?? undefined, {
    id: "stock",
    header: listHeader("drugs.col.stock"),
    cell: StockCell,
  }),
  column.accessor((product) => product.stock?.nextExpiresOn ?? undefined, {
    id: "expiry",
    header: listHeader("stock.col.nextExpiry"),
    cell: ExpiryCell,
  }),
  column.accessor((product) => product.stock?.lowStockAt ?? undefined, {
    id: "level",
    header: listHeader("drugs.col.level"),
    cell: LevelCell,
    meta: { align: "end" },
  }),
  column.accessor(
    (product) =>
      product.stock?.lastPurchasedOn
        ? new Date(product.stock.lastPurchasedOn).getTime()
        : undefined,
    {
      id: "lastBought",
      header: listHeader("drugs.col.lastBought"),
      cell: LastBoughtCell,
    }
  ),
  column.accessor((product) => product.milkWithdrawalDays ?? undefined, {
    id: "milkDays",
    header: listHeader("drugs.milkDays"),
    cell: MilkDaysCell,
    meta: { align: "end" },
  }),
  column.accessor((product) => product.meatWithdrawalDays ?? undefined, {
    id: "meatDays",
    header: listHeader("drugs.meatDays"),
    cell: MeatDaysCell,
    meta: { align: "end" },
  }),
  column.accessor((product) => product.daysSetByName ?? undefined, {
    id: "setBy",
    header: listHeader("drugs.col.setBy"),
    cell: SetByCell,
  }),
  column.display({
    id: "actions",
    header: ActionsHeader,
    cell: ActionsCell,
    meta: { align: "end" },
  }),
]);

/** One figure on a product's card: what it is, small, and the days beneath. */
const CardDays = ({ label, days }: { label: string; days: number | null }) => (
  <div className="flex min-w-0 flex-col">
    <span className="text-muted-foreground truncate text-xs">{label}</span>
    <span className="text-base font-semibold tabular-nums">
      <DaysFigure days={days} />
    </span>
  </div>
);

/** A product on a phone: its name and standing on one line, the milk and meat days large beneath, who wrote them. */
const ProductCard = ({ row }: { row: ProductRow }) => {
  const { t, language } = useLanguage();
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={row.retiredAt ? "text-muted-foreground" : "font-medium"}
          >
            {productName(row, language)}
          </span>
          <Standing product={row} />
          <VaccineMark product={row} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <CardDays days={row.milkWithdrawalDays} label={t("drugs.milkDays")} />
          <CardDays days={row.meatWithdrawalDays} label={t("drugs.meatDays")} />
        </div>
        <InStock product={row} />
        <FirstToExpire product={row} />
        {row.daysSetByName && row.daysSetAt ? (
          <span className="text-muted-foreground text-xs">
            {t("drugs.setBy", {
              name: row.daysSetByName,
              date: formatDate(new Date(row.daysSetAt), language, "date"),
            })}
          </span>
        ) : null}
      </div>
      <ProductRowActions actions={row.actions} product={row} />
    </div>
  );
};

const productCard = (row: ProductRow) => <ProductCard row={row} />;

/** The milk and meat days of one product, written by the in-house Vet in a dialog over the list. */
const DaysDialog = ({
  product,
  onOpenChange,
}: {
  product: DrugProduct | null;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t, language } = useLanguage();
  const refused = useRefused();
  const [milk, setMilk] = useState(
    daysTyped(product?.milkWithdrawalDays ?? null)
  );
  const [meat, setMeat] = useState(
    daysTyped(product?.meatWithdrawalDays ?? null)
  );
  const save = useMutation(
    orpc.drugs.setWithdrawal.mutationOptions({
      onSuccess: () => {
        toast.success(t("drugs.daysSaved"));
        onOpenChange(false);
      },
      onError: refused,
    })
  );
  return (
    <FormDialog
      description={t("drugs.daysHint")}
      onOpenChange={onOpenChange}
      onSubmit={() => {
        if (product) {
          save.mutate({
            id: product.id,
            milkWithdrawalDays: Number(milk),
            meatWithdrawalDays: Number(meat),
          });
        }
      }}
      open={product !== null}
      pending={save.isPending}
      ready={product !== null && milk !== "" && meat !== ""}
      submitLabel={t("drugs.save")}
      title={
        product ? `${t("drugs.save")} — ${productName(product, language)}` : ""
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <FormField id="days-milk" label={t("drugs.milkDays")}>
          <Input
            id="days-milk"
            inputMode="numeric"
            max={365}
            min={0}
            onChange={(event) => setMilk(event.target.value)}
            step="1"
            type="number"
            value={milk}
          />
        </FormField>
        <FormField id="days-meat" label={t("drugs.meatDays")}>
          <Input
            id="days-meat"
            inputMode="numeric"
            max={365}
            min={0}
            onChange={(event) => setMeat(event.target.value)}
            step="1"
            type="number"
            value={meat}
          />
        </FormField>
      </div>
      {product?.daysSetByName && product.daysSetAt ? (
        <p className="text-muted-foreground text-xs">
          {t("drugs.setBy", {
            name: product.daysSetByName,
            date: formatDate(new Date(product.daysSetAt), language, "date"),
          })}
        </p>
      ) : null}
    </FormDialog>
  );
};

/** A new product on the Drug List, by its name on the label. Its days wait for the Vet. */
const AddProductDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [name, setName] = useState("");
  const add = useMutation(
    orpc.drugs.add.mutationOptions({
      onSuccess: () => {
        setName("");
        toast.success(t("drugs.added"));
        onOpenChange(false);
      },
      onError: refused,
    })
  );
  return (
    <FormDialog
      description={t("drugs.addHint")}
      onOpenChange={onOpenChange}
      onSubmit={() => add.mutate({ name: { bn: name.trim() } })}
      open={open}
      pending={add.isPending}
      ready={name.trim() !== ""}
      submitLabel={t("drugs.add")}
      title={t("drugs.add")}
    >
      <FormField id="drug-name" label={t("drugs.name")}>
        <Input
          autoComplete="off"
          id="drug-name"
          onChange={(event) => setName(event.target.value)}
          value={name}
        />
      </FormField>
    </FormDialog>
  );
};

/**
 * How few doses of a product the store may hold before it says it is running low, set in a dialog. Blank says
 * nothing: a product nobody watches.
 */
const LevelDialog = ({
  product,
  onOpenChange,
}: {
  product: DrugProduct | null;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t, language } = useLanguage();
  const refused = useRefused();
  const held = product?.stock?.lowStockAt ?? product?.lowStockAt ?? null;
  const [value, setValue] = useState(held === null ? "" : String(held));
  const save = useMutation(
    orpc.drugs.setLowStock.mutationOptions({
      onSuccess: () => {
        toast.success(t("drugs.lowStockSaved"));
        onOpenChange(false);
      },
      onError: refused,
    })
  );
  return (
    <FormDialog
      description={t("drugs.lowStockHint")}
      onOpenChange={onOpenChange}
      onSubmit={() => {
        if (product) {
          save.mutate({
            drugProductId: product.id,
            threshold: value.trim() === "" ? null : Number(value),
          });
        }
      }}
      open={product !== null}
      pending={save.isPending}
      ready={product !== null}
      submitLabel={t("common.save")}
      title={
        product
          ? `${t("drugs.setLowStock")} — ${productName(product, language)}`
          : ""
      }
    >
      <FormField id="drug-level" label={t("drugs.lowStockLabel")}>
        <Input
          id="drug-level"
          inputMode="numeric"
          min={0}
          onChange={(event) => setValue(event.target.value)}
          step="1"
          type="number"
          value={value}
        />
      </FormField>
    </FormDialog>
  );
};

/** A product's names put right by the Vet, in a dialog that starts from the names it has. */
const RenameProductDialog = ({
  product,
  onClose,
}: {
  product: DrugProduct | null;
  onClose: () => void;
}) => {
  const { t, language } = useLanguage();
  const refused = useRefused();
  const [name, setName] = useState(product?.nameBn ?? "");
  const [english, setEnglish] = useState(product?.nameEn ?? "");
  const rename = useMutation(
    orpc.drugs.rename.mutationOptions({ onSuccess: onClose, onError: refused })
  );
  return (
    <FormDialog
      description={t("drugs.renameHint")}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      onSubmit={() => {
        if (product) {
          rename.mutate({
            id: product.id,
            name: {
              bn: name.trim(),
              ...(english.trim() ? { en: english.trim() } : {}),
            },
          });
        }
      }}
      open={product !== null}
      pending={rename.isPending}
      ready={name.trim() !== ""}
      submitLabel={t("common.save")}
      title={t("drugs.renameTitle", {
        name: product ? productName(product, language) : "",
      })}
    >
      <FormField id="drug-rename" label={t("sop.bangla")}>
        <Input
          autoComplete="off"
          id="drug-rename"
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
      </FormField>
      <FormField id="drug-rename-en" label={t("feed.english")}>
        <Input
          autoComplete="off"
          id="drug-rename-en"
          onChange={(event) => setEnglish(event.target.value)}
          value={english}
        />
      </FormField>
    </FormDialog>
  );
};

/**
 * The standard medicines the farm does not have yet, a button away while there are any: what they are is said before
 * they are added, and none of them may be prescribed until the Vet writes their days.
 */
const useStandardMedicines = (mayAdd: boolean) => {
  const { t, language } = useLanguage();
  const refused = useRefused();
  const missing = useQuery({
    ...orpc.drugs.standardMissing.queryOptions(),
    enabled: mayAdd,
  });
  const [asking, setAsking] = useState(false);
  const add = useMutation(
    orpc.drugs.addStandard.mutationOptions({
      onSuccess: (done) => {
        toast.success(
          t("drugs.addedStandard", {
            count: formatNumber(done.added.length, language),
          })
        );
        setAsking(false);
      },
      onError: refused,
    })
  );
  const names = (missing.data ?? []).map((one) =>
    language === "bn" ? one.bn : one.en
  );
  const button =
    mayAdd && names.length > 0 ? (
      <Button onClick={() => setAsking(true)} type="button" variant="outline">
        <ListPlus aria-hidden data-icon="inline-start" />
        {t("drugs.addStandard")}
      </Button>
    ) : null;
  const dialog = (
    <ConfirmDialog
      confirmLabel={t("drugs.addStandard")}
      description={t("drugs.addStandardHint", { names: names.join(", ") })}
      onConfirm={() => add.mutate()}
      onOpenChange={setAsking}
      open={asking}
      pending={add.isPending}
      title={t("drugs.addStandardTitle", {
        count: formatNumber(names.length, language),
      })}
    />
  );
  return { button, dialog };
};

/**
 * The Drug List itself, a row per product: whether it may be prescribed, its milk and meat days, and who wrote them.
 * The in-house Vet writes the days and keeps the list from a row's menu; whoever buys records medicine from it; a vet
 * called in for a visit only reads it.
 */
export const ProductsTab = ({
  products,
  isVet,
  mayAdd,
  mayBuy,
  onBuy,
  onBought,
}: {
  products: DrugProduct[];
  isVet: boolean;
  mayAdd: boolean;
  mayBuy: boolean;
  onBuy: (productId: string) => void;
  onBought: (productId: string) => void;
}) => {
  const { t, language } = useLanguage();
  const refused = useRefused();
  const [adding, setAdding] = useState(false);
  const [daysFor, setDaysFor] = useState<DrugProduct | null>(null);
  const [retiring, setRetiring] = useState<DrugProduct | null>(null);
  const [levelFor, setLevelFor] = useState<DrugProduct | null>(null);
  const [renaming, setRenaming] = useState<DrugProduct | null>(null);
  const standard = useStandardMedicines(mayAdd);
  const onError = refused;
  const retire = useMutation(
    orpc.drugs.retire.mutationOptions({
      onSuccess: () => {
        setRetiring(null);
      },
      onError,
    })
  );
  const bringBack = useMutation(
    orpc.drugs.bringBack.mutationOptions({ onError })
  );
  const markVaccine = useMutation(
    orpc.drugs.markVaccine.mutationOptions({ onError })
  );
  const actions: ProductActions = {
    isVet,
    mayBuy,
    busy: markVaccine.isPending,
    handleDays: setDaysFor,
    handleVaccine: (product) =>
      markVaccine.mutate({ id: product.id, vaccine: !product.vaccine }),
    handleRetire: setRetiring,
    handleBringBack: (product) => bringBack.mutate({ id: product.id }),
    handleRename: setRenaming,
    handleBuy: onBuy,
    handleBought: onBought,
    handleLevel: setLevelFor,
  };
  const table = useListTable({
    columns: productColumns,
    data: products.map((product) => ({ ...product, actions })),
    getRowId: (row) => row.id,
  });
  return (
    <Section
      action={
        mayAdd ? (
          <>
            {standard.button}
            <Button
              onClick={() => setAdding(true)}
              type="button"
              variant="outline"
            >
              <Plus aria-hidden data-icon="inline-start" />
              {t("drugs.add")}
            </Button>
          </>
        ) : null
      }
      description={isVet ? t("drugs.vetOnly") : t("drugs.managerAdds")}
    >
      {products.length === 0 ? (
        <EmptyState bare icon={Pill} title={t("drugs.none")} />
      ) : (
        <DataTable card={productCard} minWidth="52rem" table={table} />
      )}
      {mayAdd ? (
        <AddProductDialog onOpenChange={setAdding} open={adding} />
      ) : null}
      {mayBuy ? (
        <LevelDialog
          key={levelFor?.id ?? "none"}
          onOpenChange={(open) => {
            if (!open) {
              setLevelFor(null);
            }
          }}
          product={levelFor}
        />
      ) : null}
      {standard.dialog}
      {isVet ? (
        <RenameProductDialog
          key={renaming?.id ?? "none"}
          onClose={() => setRenaming(null)}
          product={renaming}
        />
      ) : null}
      {isVet ? (
        <DaysDialog
          key={daysFor?.id ?? "none"}
          onOpenChange={(open) => {
            if (!open) {
              setDaysFor(null);
            }
          }}
          product={daysFor}
        />
      ) : null}
      <ConfirmDialog
        confirmLabel={t("drugs.retire")}
        description={t("drugs.retireWhy")}
        onConfirm={() => {
          if (retiring) {
            retire.mutate({ id: retiring.id });
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setRetiring(null);
          }
        }}
        open={retiring !== null}
        pending={retire.isPending}
        title={t("drugs.retireTitle", {
          name: retiring ? productName(retiring, language) : "",
        })}
      />
    </Section>
  );
};
