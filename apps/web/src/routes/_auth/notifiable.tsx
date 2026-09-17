import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Archive, Plus, ShieldAlert, ShieldOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import {
  EmptyState,
  Loaded,
  Page,
  PageHeader,
  StatusBadge,
} from "@/components/page";
import { FormDialog, FormField, RowMenu } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { sayWhy } from "@/lib/saying";
import { orpc } from "@/utils/orpc";

type Disease = Awaited<ReturnType<typeof orpc.notifiable.list.call>>[number];

interface DiseaseRow extends Disease {
  keeps: boolean;
  handleTakeOff: (disease: Disease) => void;
}

/** The disease in the reader's language, as the farm wrote it. */
const nameOf = (disease: Disease, language: string) =>
  language === "en" && disease.nameEn ? disease.nameEn : disease.nameBn;

/** On the list, or taken off it, as a word with its colour. */
const Standing = ({ disease }: { disease: Disease }) => {
  const { t } = useLanguage();
  return disease.retiredAt ? (
    <StatusBadge icon={Archive} tone="neutral">
      {t("notifiable.retired")}
    </StatusBadge>
  ) : (
    <StatusBadge icon={ShieldAlert} tone="warning">
      {t("notifiable.onList")}
    </StatusBadge>
  );
};

const DiseaseNameCell = ({ row }: { row: { original: DiseaseRow } }) => {
  const { language } = useLanguage();
  const disease = row.original;
  const other = language === "en" ? disease.nameBn : disease.nameEn;
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={disease.retiredAt ? "text-muted-foreground" : "font-medium"}
      >
        {nameOf(disease, language)}
      </span>
      {other && other !== nameOf(disease, language) ? (
        <span className="text-muted-foreground text-xs">{other}</span>
      ) : null}
    </div>
  );
};

const StandingCell = ({ row }: { row: { original: DiseaseRow } }) => (
  <Standing disease={row.original} />
);

const NoteCell = ({ row }: { row: { original: DiseaseRow } }) =>
  row.original.note ? (
    <span className="text-muted-foreground">{row.original.note}</span>
  ) : (
    <span className="text-muted-foreground">—</span>
  );

const AddedByCell = ({ row }: { row: { original: DiseaseRow } }) => {
  const { language } = useLanguage();
  const disease = row.original;
  if (!disease.addedByName) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-col">
      <span>{disease.addedByName}</span>
      <span className="text-muted-foreground text-xs whitespace-nowrap">
        {formatDate(new Date(disease.createdAt), language, "date")}
      </span>
    </div>
  );
};

/** The menu at the end of a disease's row: taking it off the list, which asks why. */
const DiseaseMenu = ({ row }: { row: DiseaseRow }) => {
  const { t, language } = useLanguage();
  const { handleTakeOff } = row;
  if (row.retiredAt || !row.keeps) {
    return null;
  }
  return (
    <RowMenu
      actions={[
        {
          label: t("notifiable.retire"),
          icon: ShieldOff,
          destructive: true,
          handleSelect: () => handleTakeOff(row),
        },
      ]}
      label={t("notifiable.rowActions", { name: nameOf(row, language) })}
    />
  );
};

const MenuCell = ({ row }: { row: { original: DiseaseRow } }) => (
  <div className="flex justify-end">
    <DiseaseMenu row={row.original} />
  </div>
);

const column = createListColumns<DiseaseRow>();
const diseaseColumns = column.columns([
  column.accessor("nameBn", {
    header: listHeader("notifiable.name"),
    cell: DiseaseNameCell,
  }),
  column.accessor((disease) => (disease.retiredAt ? 1 : 0), {
    id: "standing",
    header: listHeader("notifiable.col.status"),
    cell: StandingCell,
  }),
  column.accessor((disease) => disease.note ?? "", {
    id: "note",
    header: listHeader("notifiable.note"),
    cell: NoteCell,
  }),
  column.accessor((disease) => new Date(disease.createdAt).getTime(), {
    id: "added",
    header: listHeader("notifiable.col.addedBy"),
    cell: AddedByCell,
  }),
  column.display({
    id: "menu",
    header: ActionsHeader,
    cell: MenuCell,
    meta: { align: "end", className: "w-12" },
  }),
]);

/** A disease on a phone: its name and standing on one line, what the ULO said and who put it on beneath. */
const DiseaseCard = ({ row }: { row: DiseaseRow }) => {
  const { t, language } = useLanguage();
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={row.retiredAt ? "text-muted-foreground" : "font-medium"}
          >
            {nameOf(row, language)}
          </span>
          <Standing disease={row} />
        </div>
        {row.note ? <p className="text-sm">{row.note}</p> : null}
        {row.addedByName ? (
          <p className="text-muted-foreground text-xs">
            {t("notifiable.addedBy", { name: row.addedByName })} ·{" "}
            {formatDate(new Date(row.createdAt), language, "date")}
          </p>
        ) : null}
      </div>
      <DiseaseMenu row={row} />
    </div>
  );
};

const diseaseCard = (row: DiseaseRow) => <DiseaseCard row={row} />;

/** A disease the ULO has confirmed, put on the list in a dialog: its Bangla name, an English one, and what was said. */
const AddDiseaseDialog = ({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}) => {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [note, setNote] = useState("");
  const add = useMutation(
    orpc.notifiable.add.mutationOptions({
      onSuccess: () => {
        setName("");
        setNameEn("");
        setNote("");
        toast.success(t("notifiable.added"));
        onOpenChange(false);
        onAdded();
      },
      onError: (error) => toast.error(sayWhy(error, t)),
    })
  );
  return (
    <FormDialog
      description={t("notifiable.addHint")}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        add.mutate({
          // The English name too, when the farm has one: a Vet who writes "Anthrax" and a
          // list that only says "তড়কা" would not match, and the farm would not report.
          name: {
            bn: name.trim(),
            ...(nameEn.trim() ? { en: nameEn.trim() } : {}),
          },
          ...(note.trim() ? { note: note.trim() } : {}),
        })
      }
      open={open}
      pending={add.isPending}
      ready={name.trim() !== ""}
      submitLabel={t("notifiable.add")}
      title={t("notifiable.add")}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="disease-name" label={t("notifiable.name")}>
          <Input
            autoComplete="off"
            id="disease-name"
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </FormField>
        <FormField id="disease-name-en" label={t("notifiable.nameEn")}>
          <Input
            autoComplete="off"
            id="disease-name-en"
            onChange={(event) => setNameEn(event.target.value)}
            value={nameEn}
          />
        </FormField>
      </div>
      <FormField id="disease-note" label={t("notifiable.note")}>
        <Input
          id="disease-note"
          maxLength={300}
          onChange={(event) => setNote(event.target.value)}
          value={note}
        />
      </FormField>
    </FormDialog>
  );
};

/** Taking a disease off the list, in a dialog that asks why: the reason is the farm's answer when somebody asks. */
const TakeOffDialog = ({
  disease,
  onOpenChange,
  onTakenOff,
}: {
  disease: Disease | null;
  onOpenChange: (open: boolean) => void;
  onTakenOff: () => void;
}) => {
  const { t, language } = useLanguage();
  const [why, setWhy] = useState("");
  const retire = useMutation(
    orpc.notifiable.retire.mutationOptions({
      onSuccess: () => {
        toast.success(t("notifiable.takenOff"));
        onOpenChange(false);
        onTakenOff();
      },
      onError: (error) => toast.error(sayWhy(error, t)),
    })
  );
  return (
    <FormDialog
      description={t("notifiable.takeOffHint")}
      onOpenChange={onOpenChange}
      onSubmit={() => {
        if (disease) {
          retire.mutate({ id: disease.id, reason: why.trim() });
        }
      }}
      open={disease !== null}
      pending={retire.isPending}
      ready={disease !== null && why.trim() !== ""}
      submitLabel={t("notifiable.retire")}
      title={
        disease
          ? `${t("notifiable.retire")} — ${nameOf(disease, language)}`
          : ""
      }
    >
      <FormField id="disease-why" label={t("notifiable.why")}>
        <Input
          id="disease-why"
          maxLength={300}
          onChange={(event) => setWhy(event.target.value)}
          value={why}
        />
      </FormField>
    </FormDialog>
  );
};

/** The list as a table where there is room, and as cards on a phone. */
const DiseaseList = ({ rows }: { rows: DiseaseRow[] }) => {
  const table = useListTable({
    columns: diseaseColumns,
    data: rows,
    getRowId: (row) => row.id,
  });
  return (
    <div className="bg-card rounded-xl border p-4 md:p-5">
      <DataTable card={diseaseCard} minWidth="44rem" table={table} />
    </div>
  );
};

/**
 * The farm's list of diseases that must be reported to DLS without delay.
 *
 * Not a table shipped with the software: the schedule of the Animal Disease Rules could not be
 * sourced, so what is reportable is what the Upazila Livestock Officer confirms to this farm —
 * and the note beside each one is the farm's answer to "why did you report that one".
 */
const NotifiablePage = () => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const list = useQuery(orpc.notifiable.list.queryOptions());
  const me = useQuery(orpc.people.me.queryOptions());
  // A vet called in for a visit reads the list; keeping it is the farm's own people's.
  const keeps = me.data !== undefined && me.data.scopes.vet?.kind !== "cases";
  const [adding, setAdding] = useState(false);
  /** Which disease is being taken off: its dialog asks why. */
  const [comingOff, setComingOff] = useState<Disease | null>(null);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.notifiable.key() });

  const addButton = keeps ? (
    <Button onClick={() => setAdding(true)} type="button">
      <Plus aria-hidden data-icon="inline-start" />
      {t("notifiable.add")}
    </Button>
  ) : null;

  return (
    <Page>
      <PageHeader
        actions={addButton}
        description={t("notifiable.subtitle")}
        title={t("notifiable.title")}
      />

      <Loaded query={list}>
        {list.data?.length ? (
          <DiseaseList
            rows={list.data.map((disease) => ({
              ...disease,
              keeps,
              handleTakeOff: setComingOff,
            }))}
          />
        ) : (
          <EmptyState icon={ShieldAlert} title={t("notifiable.none")} />
        )}
      </Loaded>

      {keeps ? (
        <>
          <AddDiseaseDialog
            onAdded={refresh}
            onOpenChange={setAdding}
            open={adding}
          />
          <TakeOffDialog
            disease={comingOff}
            key={comingOff?.id ?? "none"}
            onOpenChange={(open) => {
              if (!open) {
                setComingOff(null);
              }
            }}
            onTakenOff={refresh}
          />
        </>
      ) : null}
    </Page>
  );
};

export const Route = createFileRoute("/_auth/notifiable")({
  /** The Owner, the Manager and the Vet keep this list (roles matrix); Barn Staff have no
   *  business in it, so they are sent away rather than shown a form that would refuse them. */
  beforeLoad: ({ context }) => {
    const allowed = new Set(["owner", "manager", "vet"]);
    if (!context.me.roles.some((role) => allowed.has(role))) {
      throw redirect({ to: "/today", search: {} });
    }
  },
  component: NotifiablePage,
});
