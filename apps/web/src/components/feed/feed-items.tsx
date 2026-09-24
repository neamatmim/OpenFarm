import type { FeedUnit } from "@OpenFarm/domain";
import { FEED_UNITS, feedUnitOf, feedUnitWord } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { Archive, Package, Plus, Wheat } from "lucide-react";
import { useState } from "react";

import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { EmptyState, Section, StatusBadge } from "@/components/page";
import {
  FormDialog,
  FormField,
  NativeSelect,
  RowMenu,
} from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

import type { FeedItemRow } from "./feed-types";

interface ItemRow extends FeedItemRow {
  handleRetire: (id: string) => void;
  handleSetBagSize: (item: FeedItemRow) => void;
  retiring: boolean;
}

const NameCell = ({ row }: { row: { original: ItemRow } }) => (
  <span
    className={row.original.retiredAt ? "text-muted-foreground" : "font-medium"}
  >
    {row.original.nameBn}
  </span>
);

/** In use or retired, as a word with its colour. */
const ItemStanding = ({ retired }: { retired: boolean }) => {
  const { t } = useLanguage();
  return retired ? (
    <StatusBadge icon={Archive} tone="neutral">
      {t("feed.retired")}
    </StatusBadge>
  ) : (
    <StatusBadge tone="success">{t("feed.inUse")}</StatusBadge>
  );
};

const StandingCell = ({ row }: { row: { original: ItemRow } }) => (
  <ItemStanding retired={row.original.retiredAt !== null} />
);

/** What it is counted in, and — for feed bought by the bag — what one of its bags weighs. */
const UnitOf = ({ item }: { item: FeedItemRow }) => {
  const { t, language } = useLanguage();
  const unit = feedUnitWord(item.unit, language);
  return item.bagSizeKg === null
    ? unit
    : `${unit} · ${t("feed.bagOf", { kg: formatNumber(item.bagSizeKg, language) })}`;
};

const UnitCell = ({ row }: { row: { original: ItemRow } }) => (
  <span className="whitespace-nowrap">
    <UnitOf item={row.original} />
  </span>
);

/** The menu at the end of a Feed Item's row: what its bags weigh, for feed weighed in kilos, and retiring it —
 *  rather than removing it, because a Ration that fed it still names it. */
const ItemMenu = ({ row }: { row: ItemRow }) => {
  const { t } = useLanguage();
  const { handleRetire, handleSetBagSize } = row;
  if (row.retiredAt) {
    return null;
  }
  return (
    <RowMenu
      actions={[
        ...(feedUnitOf(row.unit) === "kg"
          ? [
              {
                label: t("feed.setBagSize"),
                icon: Package,
                handleSelect: () => handleSetBagSize(row),
              },
            ]
          : []),
        {
          label: t("feed.retire"),
          icon: Archive,
          handleSelect: () => handleRetire(row.id),
          destructive: true,
          disabled: row.retiring,
        },
      ]}
      label={t("feed.itemActions", { name: row.nameBn })}
    />
  );
};

const MenuCell = ({ row }: { row: { original: ItemRow } }) => (
  <div className="flex justify-end">
    <ItemMenu row={row.original} />
  </div>
);

const column = createListColumns<ItemRow>();
const itemColumns = column.columns([
  column.accessor("nameBn", {
    header: listHeader("stock.col.item"),
    cell: NameCell,
  }),
  column.accessor("unit", { header: listHeader("feed.unit"), cell: UnitCell }),
  column.accessor((item) => (item.retiredAt ? 1 : 0), {
    id: "standing",
    header: listHeader("feed.col.status"),
    cell: StandingCell,
  }),
  column.display({
    id: "menu",
    header: ActionsHeader,
    cell: MenuCell,
    meta: { align: "end" },
  }),
]);

const ItemCard = ({ row }: { row: ItemRow }) => (
  <div className="flex items-center justify-between gap-3">
    <div className="flex min-w-0 flex-col gap-1">
      <span className={row.retiredAt ? "text-muted-foreground" : "font-medium"}>
        {row.nameBn} · <UnitOf item={row} />
      </span>
      <ItemStanding retired={row.retiredAt !== null} />
    </div>
    <ItemMenu row={row} />
  </div>
);

const itemCard = (row: ItemRow) => <ItemCard row={row} />;

/** A bag's weight as typed: a figure, or nothing where the box is blank. */
const bagSizeOf = (typed: string): number | null =>
  typed.trim() === "" ? null : Number(typed);

/** What one of a Feed Item's bags weighs, in a dialog; blank for feed the farm does not buy by the bag. */
const BagSizeDialog = ({
  item,
  onOpenChange,
}: {
  item: FeedItemRow | null;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [typed, setTyped] = useState(
    item?.bagSizeKg === null || item === null ? "" : String(item.bagSizeKg)
  );
  const setBagSize = useMutation(
    orpc.feed.setBagSize.mutationOptions({
      onSuccess: () => onOpenChange(false),
      onError: refused,
    })
  );
  return (
    <FormDialog
      description={t("feed.bagSizeHint")}
      onOpenChange={onOpenChange}
      onSubmit={() => {
        if (item) {
          setBagSize.mutate({
            feedItemId: item.id,
            bagSizeKg: bagSizeOf(typed),
          });
        }
      }}
      open={item !== null}
      pending={setBagSize.isPending}
      ready={item !== null}
      submitLabel={t("common.save")}
      title={item ? `${t("feed.setBagSize")} — ${item.nameBn}` : ""}
    >
      <FormField id="feed-bag-size" label={t("feed.bagSize")}>
        <Input
          id="feed-bag-size"
          inputMode="decimal"
          max={200}
          min={0.1}
          onChange={(event) => setTyped(event.target.value)}
          step="0.1"
          type="number"
          value={typed}
        />
      </FormField>
    </FormDialog>
  );
};

/** A new Feed Item, in a dialog: its Bangla name, an English one if there is one, the unit it is counted in, and —
 *  for feed weighed in kilos — what its bags weigh. */
const AddItemDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t, language } = useLanguage();
  const refused = useRefused();
  const [name, setName] = useState("");
  const [english, setEnglish] = useState("");
  const [unit, setUnit] = useState<FeedUnit>("kg");
  const [bagSize, setBagSize] = useState("");
  const bagSizeKg = unit === "kg" ? bagSizeOf(bagSize) : null;
  const addItem = useMutation(
    orpc.feed.addItem.mutationOptions({
      onSuccess: () => {
        setName("");
        setEnglish("");
        setUnit("kg");
        setBagSize("");
        onOpenChange(false);
      },
      onError: refused,
    })
  );
  return (
    <FormDialog
      description={t("feed.itemsDescription")}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        addItem.mutate({
          name: {
            bn: name.trim(),
            ...(english.trim() ? { en: english.trim() } : {}),
          },
          unit,
          ...(bagSizeKg === null ? {} : { bagSizeKg }),
        })
      }
      open={open}
      pending={addItem.isPending}
      ready={name.trim() !== ""}
      submitLabel={t("feed.addItem")}
      title={t("feed.addItem")}
    >
      <FormField id="feed-name" label={t("sop.bangla")}>
        <Input
          id="feed-name"
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
      </FormField>
      <FormField id="feed-en" label={t("feed.english")}>
        <Input
          id="feed-en"
          onChange={(event) => setEnglish(event.target.value)}
          value={english}
        />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField id="feed-unit" label={t("feed.unit")}>
          <NativeSelect
            id="feed-unit"
            onChange={(event) => setUnit(feedUnitOf(event.target.value))}
            value={unit}
          >
            {FEED_UNITS.map((one) => (
              <option key={one} value={one}>
                {feedUnitWord(one, language)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        {/* A bag is kilos: feed counted in litres or bundles is not bought by it. */}
        {unit === "kg" ? (
          <FormField id="feed-bag" label={t("feed.bagSize")}>
            <Input
              id="feed-bag"
              inputMode="decimal"
              max={200}
              min={0.1}
              onChange={(event) => setBagSize(event.target.value)}
              step="0.1"
              type="number"
              value={bagSize}
            />
          </FormField>
        ) : null}
      </div>
    </FormDialog>
  );
};

/** The farm's Feed Items: what it feeds, in what unit, and whether it still does. */
export const ItemsTab = ({ items }: { items: FeedItemRow[] }) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [adding, setAdding] = useState(false);
  const [bagFor, setBagFor] = useState<FeedItemRow | null>(null);
  const retireItem = useMutation(
    orpc.feed.retireItem.mutationOptions({
      onError: refused,
    })
  );
  const table = useListTable({
    columns: itemColumns,
    data: items.map((item) => ({
      ...item,
      handleRetire: (id: string) => retireItem.mutate({ id }),
      handleSetBagSize: setBagFor,
      retiring: retireItem.isPending,
    })),
    getRowId: (row) => row.id,
  });
  return (
    <Section
      action={
        <Button onClick={() => setAdding(true)} type="button">
          <Plus aria-hidden data-icon="inline-start" />
          {t("feed.addItem")}
        </Button>
      }
      description={t("feed.itemsDescription")}
      title={t("feed.items")}
    >
      {items.length === 0 ? (
        <EmptyState bare icon={Wheat} title={t("feed.noItems")} />
      ) : (
        <DataTable card={itemCard} minWidth="32rem" table={table} />
      )}
      <AddItemDialog onOpenChange={setAdding} open={adding} />
      <BagSizeDialog
        item={bagFor}
        key={bagFor?.id ?? "none"}
        onOpenChange={(open) => {
          if (!open) {
            setBagFor(null);
          }
        }}
      />
    </Section>
  );
};
