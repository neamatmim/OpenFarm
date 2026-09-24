import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Archive,
  ArchiveRestore,
  BadgeCheck,
  Dna,
  Pencil,
  Plus,
} from "lucide-react";
import { useState } from "react";

import { useBreeds } from "@/components/breed-field";
import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { Nothing } from "@/components/list-cells";
import {
  EmptyState,
  Page,
  PageHeader,
  Section,
  StatusBadge,
} from "@/components/page";
import {
  ConfirmDialog,
  FormDialog,
  FormField,
  RowMenu,
} from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { breedName } from "@/lib/breed";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

type Breed = Awaited<ReturnType<typeof orpc.breeds.list.call>>[number];

/** A breed in the list, with its name in the reader's language and what may be done to it. */
interface BreedRow extends Breed {
  name: string;
  handleRename: () => void;
  handleRetire: () => void;
  handleRestore: () => void;
}

/** Whether a breed came with the farm, and whether it is retired. */
const Badges = ({ row }: { row: BreedRow }) => {
  const { t } = useLanguage();
  return (
    <div className="flex flex-wrap gap-2">
      {row.key ? (
        <StatusBadge icon={BadgeCheck} tone="neutral">
          {t("breeds.standard")}
        </StatusBadge>
      ) : null}
      {row.retiredAt ? (
        <StatusBadge icon={Archive} tone="neutral">
          {t("breeds.retired")}
        </StatusBadge>
      ) : null}
    </div>
  );
};

/** The menu at the end of a breed's row: rename it, and retire it or bring it back. */
const BreedMenu = ({ row }: { row: BreedRow }) => {
  const { t } = useLanguage();
  return (
    <RowMenu
      actions={[
        {
          label: t("herd.rename"),
          icon: Pencil,
          handleSelect: row.handleRename,
        },
        row.retiredAt
          ? {
              label: t("breeds.restore"),
              icon: ArchiveRestore,
              handleSelect: row.handleRestore,
            }
          : {
              label: t("breeds.retire"),
              icon: Archive,
              handleSelect: row.handleRetire,
              destructive: true,
            },
      ]}
      label={row.name}
    />
  );
};

const NameCell = ({ row }: { row: { original: BreedRow } }) => (
  <span
    className={row.original.retiredAt ? "text-muted-foreground" : "font-medium"}
  >
    {row.original.nameBn}
  </span>
);

const EnglishCell = ({ row }: { row: { original: BreedRow } }) =>
  row.original.nameEn ? <span>{row.original.nameEn}</span> : <Nothing />;

const AnimalsCell = ({ row }: { row: { original: BreedRow } }) => {
  const { language } = useLanguage();
  return <span>{formatNumber(row.original.animals, language)}</span>;
};

const StatusCell = ({ row }: { row: { original: BreedRow } }) => (
  <Badges row={row.original} />
);

const MenuCell = ({ row }: { row: { original: BreedRow } }) => (
  <div className="flex justify-end">
    <BreedMenu row={row.original} />
  </div>
);

const column = createListColumns<BreedRow>();
const breedColumns = column.columns([
  column.accessor("nameBn", {
    header: listHeader("breeds.nameBn"),
    cell: NameCell,
  }),
  column.accessor((row) => row.nameEn ?? undefined, {
    id: "nameEn",
    header: listHeader("breeds.nameEn"),
    cell: EnglishCell,
  }),
  column.accessor("animals", {
    header: listHeader("herd.col.animals"),
    cell: AnimalsCell,
    meta: { align: "end" },
  }),
  column.accessor((row) => (row.retiredAt ? 1 : 0), {
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

/** A breed on a phone: its names and how many animals, its badges, and its menu at the right. */
const BreedCard = ({ row }: { row: BreedRow }) => {
  const { t, language } = useLanguage();
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <NameCell row={{ original: row }} />
        <span className="text-muted-foreground text-sm">
          {[
            row.nameEn,
            t("herd.animalCount", {
              count: formatNumber(row.animals, language),
            }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <Badges row={row} />
      </div>
      <BreedMenu row={row} />
    </div>
  );
};

const breedCard = (row: BreedRow) => <BreedCard row={row} />;

/** What the dialog is for: a new breed, or new names for one the farm has. */
type Naming = { kind: "add" } | { kind: "rename"; breed: Breed; name: string };

/** A breed's two names, for a new breed or to put one right. */
const BreedDialog = ({
  naming,
  onClose,
}: {
  naming: Naming | null;
  onClose: () => void;
}) => {
  const { t } = useLanguage();
  const onError = useRefused();
  const current = naming?.kind === "rename" ? naming.breed : null;
  const [nameBn, setNameBn] = useState(current?.nameBn ?? "");
  const [nameEn, setNameEn] = useState(current?.nameEn ?? "");
  const add = useMutation(
    orpc.breeds.add.mutationOptions({ onSuccess: onClose, onError })
  );
  const rename = useMutation(
    orpc.breeds.rename.mutationOptions({ onSuccess: onClose, onError })
  );
  const english = nameEn.trim() || undefined;
  return (
    <FormDialog
      description={t(current ? "breeds.renameHint" : "breeds.newHint")}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      onSubmit={() =>
        current
          ? rename.mutate({
              id: current.id,
              nameBn: nameBn.trim(),
              nameEn: english ?? null,
            })
          : add.mutate({ nameBn: nameBn.trim(), nameEn: english })
      }
      open={naming !== null}
      pending={add.isPending || rename.isPending}
      ready={nameBn.trim() !== ""}
      submitLabel={t(current ? "common.save" : "breeds.add")}
      title={
        naming?.kind === "rename"
          ? t("breeds.renameTitle", { name: naming.name })
          : t("breeds.new")
      }
    >
      <FormField id="breed-name-bn" label={t("breeds.nameBn")}>
        <Input
          autoComplete="off"
          id="breed-name-bn"
          maxLength={60}
          onChange={(event) => setNameBn(event.target.value)}
          required
          value={nameBn}
        />
      </FormField>
      <FormField
        hint={t("breeds.nameEnHint")}
        id="breed-name-en"
        label={t("breeds.nameEn")}
      >
        <Input
          autoComplete="off"
          id="breed-name-en"
          maxLength={60}
          onChange={(event) => setNameEn(event.target.value)}
          value={nameEn}
        />
      </FormField>
    </FormDialog>
  );
};

/**
 * The farm's list of breeds: the standard ones it came with and its own, how many animals are of each, and the
 * retired. Kept by the Owner and the Manager; an animal is written down under one on the intake and register forms.
 */
const BreedsPage = () => {
  const { t, language } = useLanguage();
  const onError = useRefused();
  const breeds = useBreeds();
  const [naming, setNaming] = useState<Naming | null>(null);
  const [retiring, setRetiring] = useState<{ id: string; name: string } | null>(
    null
  );
  const retire = useMutation(
    orpc.breeds.retire.mutationOptions({
      onSuccess: () => setRetiring(null),
      onError,
    })
  );
  const restore = useMutation(orpc.breeds.restore.mutationOptions({ onError }));
  const table = useListTable({
    columns: breedColumns,
    data: (breeds.data ?? []).map((one) => {
      const name = breedName(one, language) ?? one.nameBn;
      return {
        ...one,
        name,
        handleRename: () => setNaming({ kind: "rename", breed: one, name }),
        handleRetire: () => setRetiring({ id: one.id, name }),
        handleRestore: () => restore.mutate({ id: one.id }),
      };
    }),
    getRowId: (row) => row.id,
  });

  return (
    <Page>
      <PageHeader
        actions={
          <Button onClick={() => setNaming({ kind: "add" })} type="button">
            <Plus aria-hidden data-icon="inline-start" />
            {t("breeds.add")}
          </Button>
        }
        description={t("breeds.subtitle")}
        title={t("nav.breeds")}
      />

      <Section>
        {breeds.data === undefined ? (
          <Skeleton className="h-40 rounded-lg" />
        ) : null}
        {breeds.data?.length === 0 ? (
          <EmptyState bare icon={Dna} title={t("breeds.none")} />
        ) : null}
        {breeds.data?.length ? (
          <DataTable card={breedCard} minWidth="40rem" table={table} />
        ) : null}
      </Section>

      {/* Keyed by what is being named, so the boxes start from that breed's names and never another's. */}
      <BreedDialog
        key={naming?.kind === "rename" ? naming.breed.id : "add"}
        naming={naming}
        onClose={() => setNaming(null)}
      />
      <ConfirmDialog
        confirmLabel={t("breeds.retire")}
        description={t("breeds.retireWhy")}
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
        title={t("breeds.retireTitle", { name: retiring?.name ?? "" })}
      />
    </Page>
  );
};

export const Route = createFileRoute("/_auth/admin/breeds")({
  component: BreedsPage,
});
