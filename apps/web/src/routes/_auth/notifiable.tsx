import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Plus, ShieldAlert, ShieldOff } from "lucide-react";
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
  Nothing,
  RetiredBadge,
  SaidDate,
  nameTone,
  retiredLast,
} from "@/components/list-cells";
import {
  EmptyState,
  Loaded,
  Page,
  PageHeader,
  StatusBadge,
} from "@/components/page";
import { FormDialog, FormField, RowMenu } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

type Disease = Awaited<ReturnType<typeof orpc.notifiable.list.call>>[number];

interface DiseaseRow extends Disease {
  keeps: boolean;
  handleTakeOff: (disease: Disease) => void;
  handlePutBack: (disease: Disease) => void;
}

/** The disease in the reader's language, as the farm wrote it. */
const nameOf = (disease: Disease, language: string) =>
  language === "en" && disease.nameEn ? disease.nameEn : disease.nameBn;

/** On the list, or taken off it, as a word with its colour. */
const Standing = ({ disease }: { disease: Disease }) => {
  const { t } = useLanguage();
  return disease.retiredAt ? (
    <RetiredBadge word="notifiable.retired" />
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
      <span className={nameTone(disease)}>{nameOf(disease, language)}</span>
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
    <Nothing />
  );

const AddedByCell = ({ row }: { row: { original: DiseaseRow } }) => {
  const disease = row.original;
  if (!disease.addedByName) {
    return <Nothing />;
  }
  return (
    <div className="flex flex-col">
      <span>{disease.addedByName}</span>
      <span className="text-muted-foreground text-xs whitespace-nowrap">
        <SaidDate at={disease.createdAt} />
      </span>
    </div>
  );
};

/** The menu at the end of a disease's row: taking it off the list, or putting it back — each asks why. */
const DiseaseMenu = ({ row }: { row: DiseaseRow }) => {
  const { t, language } = useLanguage();
  const { handleTakeOff, handlePutBack } = row;
  if (!row.keeps) {
    return null;
  }
  return (
    <RowMenu
      actions={[
        row.retiredAt
          ? {
              label: t("notifiable.putBack"),
              icon: ShieldAlert,
              handleSelect: () => handlePutBack(row),
            }
          : {
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
  column.accessor(retiredLast, {
    id: "standing",
    header: listHeader("notifiable.col.status"),
    cell: StandingCell,
  }),
  column.accessor((disease) => disease.note ?? undefined, {
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
          <span className={nameTone(row)}>{nameOf(row, language)}</span>
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
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
      },
      onError: refused,
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

/** Taking a disease off the list, or putting it back, in a dialog that asks why: the reason is the farm's answer
 *  when somebody asks. */
const ChangeDialog = ({
  disease,
  back,
  onOpenChange,
}: {
  disease: Disease | null;
  /** Putting it back on the list, rather than taking it off. */
  back: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t, language } = useLanguage();
  const refused = useRefused();
  const [why, setWhy] = useState("");
  const done = (word: "notifiable.takenOff" | "notifiable.putBackDone") => ({
    onSuccess: () => {
      toast.success(t(word));
      setWhy("");
      onOpenChange(false);
    },
    onError: refused,
  });
  const retire = useMutation(
    orpc.notifiable.retire.mutationOptions(done("notifiable.takenOff"))
  );
  const putBack = useMutation(
    orpc.notifiable.bringBack.mutationOptions(done("notifiable.putBackDone"))
  );
  const act = back ? putBack : retire;
  const label = back ? t("notifiable.putBack") : t("notifiable.retire");
  return (
    <FormDialog
      description={
        back ? t("notifiable.putBackHint") : t("notifiable.takeOffHint")
      }
      onOpenChange={onOpenChange}
      onSubmit={() => {
        if (disease) {
          act.mutate({ id: disease.id, reason: why.trim() });
        }
      }}
      open={disease !== null}
      pending={act.isPending}
      ready={disease !== null && why.trim() !== ""}
      submitLabel={label}
      title={disease ? `${label} — ${nameOf(disease, language)}` : ""}
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
    <div className="surface p-4 md:p-5">
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
  const list = useQuery(orpc.notifiable.list.queryOptions());
  const me = useQuery(orpc.people.me.queryOptions());
  // A vet called in for a visit reads the list; keeping it is the farm's own people's.
  const keeps = me.data !== undefined && me.data.scopes.vet?.kind !== "cases";
  const [adding, setAdding] = useState(false);
  /** Which disease is being taken off the list or put back on it: its dialog asks why. */
  const [changing, setChanging] = useState<{
    disease: Disease;
    back: boolean;
  } | null>(null);

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
              handleTakeOff: (one) =>
                setChanging({ disease: one, back: false }),
              handlePutBack: (one) => setChanging({ disease: one, back: true }),
            }))}
          />
        ) : (
          <EmptyState icon={ShieldAlert} title={t("notifiable.none")} />
        )}
      </Loaded>

      {keeps ? (
        <>
          <AddDiseaseDialog onOpenChange={setAdding} open={adding} />
          <ChangeDialog
            back={changing?.back ?? false}
            disease={changing?.disease ?? null}
            key={changing?.disease.id ?? "none"}
            onOpenChange={(open) => {
              if (!open) {
                setChanging(null);
              }
            }}
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
