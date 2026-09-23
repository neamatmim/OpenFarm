import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { Archive, Plus, Wheat } from "lucide-react";
import { useState } from "react";

import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { EmptyState, Section, StatusBadge } from "@/components/page";
import { FormDialog, FormField } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

import type { FeedItemRow } from "./feed-types";

interface ItemRow extends FeedItemRow {
  handleRetire: (id: string) => void;
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

/** Retired rather than removed: a Ration that fed it still names it. */
const RetireButton = ({ row }: { row: ItemRow }) => {
  const { t } = useLanguage();
  const { handleRetire } = row;
  if (row.retiredAt) {
    return null;
  }
  return (
    <Button
      disabled={row.retiring}
      onClick={() => handleRetire(row.id)}
      size="sm"
      type="button"
      variant="ghost"
    >
      {t("feed.retire")}
    </Button>
  );
};

const RetireCell = ({ row }: { row: { original: ItemRow } }) => (
  <RetireButton row={row.original} />
);

const column = createListColumns<ItemRow>();
const itemColumns = column.columns([
  column.accessor("nameBn", {
    header: listHeader("stock.col.item"),
    cell: NameCell,
  }),
  column.accessor("unit", { header: listHeader("feed.unit") }),
  column.accessor((item) => (item.retiredAt ? 1 : 0), {
    id: "standing",
    header: listHeader("feed.col.status"),
    cell: StandingCell,
  }),
  column.display({
    id: "retire",
    header: ActionsHeader,
    cell: RetireCell,
    meta: { align: "end" },
  }),
]);

const ItemCard = ({ row }: { row: ItemRow }) => (
  <div className="flex items-center justify-between gap-3">
    <div className="flex min-w-0 flex-col gap-1">
      <span className={row.retiredAt ? "text-muted-foreground" : "font-medium"}>
        {row.nameBn} · {row.unit}
      </span>
      <ItemStanding retired={row.retiredAt !== null} />
    </div>
    <RetireButton row={row} />
  </div>
);

const itemCard = (row: ItemRow) => <ItemCard row={row} />;

/** A new Feed Item, in a dialog: its Bangla name, an English one if there is one, and the unit it is counted in. */
const AddItemDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [name, setName] = useState("");
  const [english, setEnglish] = useState("");
  const [unit, setUnit] = useState("kg");
  const addItem = useMutation(
    orpc.feed.addItem.mutationOptions({
      onSuccess: () => {
        setName("");
        setEnglish("");
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
          unit: unit.trim() || "kg",
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
      <div className="grid grid-cols-[1fr_6rem] gap-4">
        <FormField id="feed-en" label={t("feed.english")}>
          <Input
            id="feed-en"
            onChange={(event) => setEnglish(event.target.value)}
            value={english}
          />
        </FormField>
        <FormField id="feed-unit" label={t("feed.unit")}>
          <Input
            id="feed-unit"
            onChange={(event) => setUnit(event.target.value)}
            value={unit}
          />
        </FormField>
      </div>
    </FormDialog>
  );
};

/** The farm's Feed Items: what it feeds, in what unit, and whether it still does. */
export const ItemsTab = ({ items }: { items: FeedItemRow[] }) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [adding, setAdding] = useState(false);
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
    </Section>
  );
};
