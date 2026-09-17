import { Button } from "@OpenFarm/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@OpenFarm/ui/components/dialog";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, Plus, Wheat } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { EmptyState, Section, StatusBadge } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { sayWhy } from "@/lib/saying";
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
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [english, setEnglish] = useState("");
  const [unit, setUnit] = useState("kg");
  const addItem = useMutation(
    orpc.feed.addItem.mutationOptions({
      onSuccess: async () => {
        setName("");
        setEnglish("");
        onOpenChange(false);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: orpc.feed.items.key() }),
          queryClient.invalidateQueries({ queryKey: orpc.stock.key() }),
        ]);
      },
      onError: (error) => toast.error(sayWhy(error, t)),
    })
  );
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent closeLabel={t("common.close")}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) {
              return;
            }
            addItem.mutate({
              name: {
                bn: name.trim(),
                ...(english.trim() ? { en: english.trim() } : {}),
              },
              unit: unit.trim() || "kg",
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("feed.addItem")}</DialogTitle>
            <DialogDescription>{t("feed.itemsDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="feed-name">{t("sop.bangla")}</Label>
            <Input
              id="feed-name"
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </div>
          <div className="grid grid-cols-[1fr_6rem] gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="feed-en">{t("feed.english")}</Label>
              <Input
                id="feed-en"
                onChange={(event) => setEnglish(event.target.value)}
                value={english}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="feed-unit">{t("feed.unit")}</Label>
              <Input
                id="feed-unit"
                onChange={(event) => setUnit(event.target.value)}
                value={unit}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              {t("common.cancel")}
            </Button>
            <Button disabled={!name.trim() || addItem.isPending} type="submit">
              {addItem.isPending ? <Spinner /> : null}
              {t("feed.addItem")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

/** The farm's Feed Items: what it feeds, in what unit, and whether it still does. */
export const ItemsTab = ({ items }: { items: FeedItemRow[] }) => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const retireItem = useMutation(
    orpc.feed.retireItem.mutationOptions({
      onSuccess: () =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: orpc.feed.items.key() }),
          queryClient.invalidateQueries({ queryKey: orpc.stock.key() }),
        ]),
      onError: (error) => toast.error(sayWhy(error, t)),
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
