import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  ArrowDownLeft,
  ArrowUpRight,
  Beef as Herd,
  Plus,
  Tags,
} from "lucide-react";
import { useState } from "react";

import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { RetiredBadge, nameTone, retiredLast } from "@/components/list-cells";
import { useIsOwner, categoryName } from "@/components/money";
import { EmptyState, SegmentedControl, StatusBadge } from "@/components/page";
import {
  ConfirmDialog,
  FormDialog,
  FormField,
  RowMenu,
} from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

type Category = Awaited<ReturnType<typeof orpc.money.categories.call>>[number];

type Direction = "in" | "out";

/** A Category in the list, with its name in the reader's language and what may be done to it. */
interface CategoryRow extends Category {
  name: string;
  retiring: boolean;
  /** Only the Owner marks a Category as one the animals carry. */
  mayMark: boolean;
  handleRetire: () => void;
  handleBringBack: () => void;
  handleMark: () => void;
}

/** A Category whose money the animals of its Side carry, split by the days each stood here that month. */
const CarriedBadge = ({ row }: { row: CategoryRow }) => {
  const { t } = useLanguage();
  return row.chargedToAnimals ? (
    <StatusBadge icon={Herd} tone="neutral">
      {t("byHand.chargedToAnimals")}
    </StatusBadge>
  ) : null;
};

/** Which way a Category's money goes, as a word with its icon and colour. */
const DirectionBadge = ({ direction }: { direction: Direction }) => {
  const { t } = useLanguage();
  return direction === "in" ? (
    <StatusBadge icon={ArrowDownLeft} tone="success">
      {t("byHand.in")}
    </StatusBadge>
  ) : (
    <StatusBadge icon={ArrowUpRight} tone="neutral">
      {t("byHand.out")}
    </StatusBadge>
  );
};

/** A Category no longer entered under, kept for the money already booked to it. */
const Retired = ({ row }: { row: CategoryRow }) =>
  row.retiredAt ? <RetiredBadge word="byHand.retired" /> : null;

/** The menu at the end of a Category's row: marking it and retiring it where it may be, and bringing a retired one
 *  back. */
const CategoryMenu = ({ row }: { row: CategoryRow }) => {
  const { t } = useLanguage();
  const { handleRetire, handleBringBack, handleMark } = row;
  if (row.retiredAt) {
    return (
      <RowMenu
        actions={[
          {
            label: t("byHand.bringBack"),
            icon: ArchiveRestore,
            handleSelect: handleBringBack,
          },
        ]}
        label={row.name}
      />
    );
  }
  if (!(row.retirable || row.mayMark)) {
    return null;
  }
  return (
    <RowMenu
      actions={[
        ...(row.mayMark
          ? [
              {
                label: t(
                  row.chargedToAnimals
                    ? "byHand.stopCharging"
                    : "byHand.chargeToAnimals"
                ),
                icon: Herd,
                handleSelect: handleMark,
              },
            ]
          : []),
        ...(row.retirable
          ? [
              {
                label: t("byHand.retire"),
                icon: Archive,
                handleSelect: handleRetire,
                destructive: true,
                disabled: row.retiring,
              },
            ]
          : []),
      ]}
      label={row.name}
    />
  );
};

const NameCell = ({ row }: { row: { original: CategoryRow } }) => (
  <span className={nameTone(row.original)}>{row.original.name}</span>
);

const DirectionCell = ({ row }: { row: { original: CategoryRow } }) => (
  <DirectionBadge direction={row.original.direction === "in" ? "in" : "out"} />
);

const StatusCell = ({ row }: { row: { original: CategoryRow } }) => (
  <div className="flex flex-wrap gap-2">
    <Retired row={row.original} />
    <CarriedBadge row={row.original} />
  </div>
);

const MenuCell = ({ row }: { row: { original: CategoryRow } }) => (
  <div className="flex justify-end">
    <CategoryMenu row={row.original} />
  </div>
);

const column = createListColumns<CategoryRow>();
const categoryColumns = column.columns([
  column.accessor("name", {
    header: listHeader("byHand.categoryName"),
    cell: NameCell,
  }),
  column.accessor("direction", {
    header: listHeader("byHand.direction"),
    cell: DirectionCell,
  }),
  column.accessor(retiredLast, {
    id: "status",
    header: listHeader("money.col.status"),
    cell: StatusCell,
  }),
  column.display({
    id: "menu",
    header: ActionsHeader,
    cell: MenuCell,
    meta: { align: "end" },
  }),
]);

/** A Category on a phone: its name and which way, whether it is retired, and its menu at the right. */
const CategoryCard = ({ row }: { row: CategoryRow }) => (
  <div className="flex items-center justify-between gap-3">
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <NameCell row={{ original: row }} />
      <div className="flex flex-wrap gap-2">
        <DirectionBadge direction={row.direction === "in" ? "in" : "out"} />
        <Retired row={row} />
        <CarriedBadge row={row} />
      </div>
    </div>
    <CategoryMenu row={row} />
  </div>
);

const categoryCard = (row: CategoryRow) => <CategoryCard row={row} />;

/** A new Category of the farm's own: its name and which way its money goes. */
const AddCategoryDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const onError = useRefused();
  const [nameBn, setNameBn] = useState("");
  const [direction, setDirection] = useState<Direction>("out");
  const add = useMutation(
    orpc.money.addCategory.mutationOptions({
      onSuccess: () => {
        setNameBn("");
        onOpenChange(false);
      },
      onError,
    })
  );
  return (
    <FormDialog
      description={t("byHand.newCategoryHint")}
      onOpenChange={onOpenChange}
      onSubmit={() => add.mutate({ nameBn: nameBn.trim(), direction })}
      open={open}
      pending={add.isPending}
      ready={nameBn.trim() !== ""}
      submitLabel={t("byHand.addCategory")}
      title={t("byHand.newCategory")}
    >
      <FormField id="category-name" label={t("byHand.categoryName")}>
        <Input
          autoComplete="off"
          id="category-name"
          onChange={(event) => setNameBn(event.target.value)}
          required
          value={nameBn}
        />
      </FormField>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("byHand.direction")}</span>
        <SegmentedControl
          label={t("byHand.direction")}
          name="category-direction"
          onChange={setDirection}
          options={[
            { value: "out", label: t("byHand.out") },
            { value: "in", label: t("byHand.in") },
          ]}
          value={direction}
        />
      </div>
    </FormDialog>
  );
};

/** The farm's Categories: the standard ones, the farm's own, and the retired — kept by the Owner and the Manager. */
export const CategoriesTab = () => {
  const { t, language } = useLanguage();
  const onError = useRefused();
  const categories = useQuery(orpc.money.categories.queryOptions());
  const [adding, setAdding] = useState(false);
  const [retiring, setRetiring] = useState<{ id: string; name: string } | null>(
    null
  );
  const retire = useMutation(
    orpc.money.retireCategory.mutationOptions({
      onSuccess: () => {
        setRetiring(null);
      },
      onError,
    })
  );
  const bringBack = useMutation(
    orpc.money.bringBackCategory.mutationOptions({ onError })
  );
  const mark = useMutation(
    orpc.money.setChargedToAnimals.mutationOptions({
      onError,
    })
  );
  const isOwner = useIsOwner();
  const table = useListTable({
    columns: categoryColumns,
    data: (categories.data ?? []).map((one) => ({
      ...one,
      name: categoryName(
        { categoryBn: one.nameBn, categoryEn: one.nameEn },
        language
      ),
      retiring: retire.isPending,
      mayMark: isOwner && one.enterable && one.chargeable,
      handleMark: () =>
        mark.mutate({
          categoryId: one.id,
          chargedToAnimals: !one.chargedToAnimals,
        }),
      handleBringBack: () => bringBack.mutate({ id: one.id }),
      handleRetire: () =>
        setRetiring({
          id: one.id,
          name: categoryName(
            { categoryBn: one.nameBn, categoryEn: one.nameEn },
            language
          ),
        }),
    })),
    getRowId: (row) => row.id,
  });
  return (
    <div className="surface flex flex-col gap-4 p-4 md:p-5">
      <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-sm">
          {t("byHand.newCategoryHint")}
        </p>
        <Button
          className="shrink-0"
          onClick={() => setAdding(true)}
          type="button"
          variant="outline"
        >
          <Plus aria-hidden data-icon="inline-start" />
          {t("byHand.newCategory")}
        </Button>
      </div>
      {categories.data === undefined ? (
        <Skeleton className="h-40 rounded-lg" />
      ) : null}
      {categories.data?.length === 0 ? (
        <EmptyState bare icon={Tags} title={t("byHand.noCategories")} />
      ) : null}
      {categories.data?.length ? (
        <DataTable card={categoryCard} minWidth="36rem" table={table} />
      ) : null}
      <AddCategoryDialog onOpenChange={setAdding} open={adding} />
      <ConfirmDialog
        confirmLabel={t("byHand.retire")}
        description={t("byHand.retireWhy")}
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
        title={t("byHand.retireTitle", { name: retiring?.name ?? "" })}
      />
    </div>
  );
};
