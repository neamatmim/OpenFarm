import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { EmptyState, Page, PageHeader } from "@/components/page";
import { useLanguage, useT } from "@/i18n/language-provider";
import { sayWhy } from "@/lib/saying";
import { orpc } from "@/utils/orpc";

type Disease = Awaited<ReturnType<typeof orpc.notifiable.list.call>>[number];

interface DiseaseRow extends Disease {
  keeps: boolean;
  comingOff: boolean;
  why: string;
  handleComingOff: () => void;
  handleWhy: (value: string) => void;
  handleTakeOff: () => void;
}

const DiseaseNameCell = ({ row }: { row: { original: DiseaseRow } }) => {
  const t = useT();
  const { language } = useLanguage();
  const disease = row.original;
  return (
    <span className={disease.retiredAt ? "text-muted-foreground" : ""}>
      <span className="font-medium">
        {language === "en" && disease.nameEn ? disease.nameEn : disease.nameBn}
      </span>
      {disease.retiredAt ? ` · ${t("notifiable.retired")}` : ""}
    </span>
  );
};

const NoteCell = ({ row }: { row: { original: DiseaseRow } }) =>
  row.original.note ? (
    <span className="text-muted-foreground">{row.original.note}</span>
  ) : (
    "—"
  );

const AddedByCell = ({ row }: { row: { original: DiseaseRow } }) => {
  const { language } = useLanguage();
  const disease = row.original;
  if (!disease.addedByName) {
    return "—";
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

/** Taking a disease off the list, in its own row: the button, and once pressed, the reason typed beside it. */
const TakeOffCell = ({ row }: { row: { original: DiseaseRow } }) => {
  const t = useT();
  const disease = row.original;
  if (disease.retiredAt || !disease.keeps) {
    return null;
  }
  if (!disease.comingOff) {
    return (
      <Button
        onClick={disease.handleComingOff}
        size="sm"
        type="button"
        variant="ghost"
      >
        {t("notifiable.retire")}
      </Button>
    );
  }
  return (
    <form
      className="flex flex-col items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        disease.handleTakeOff();
      }}
    >
      <div className="w-48 space-y-1 text-left">
        <Label htmlFor={`why-row-${disease.id}`}>{t("notifiable.why")}</Label>
        <Input
          id={`why-row-${disease.id}`}
          onChange={(event) => disease.handleWhy(event.target.value)}
          value={disease.why}
        />
      </div>
      <Button disabled={!disease.why.trim()} size="sm" type="submit">
        {t("notifiable.retire")}
      </Button>
    </form>
  );
};

const column = createListColumns<DiseaseRow>();
const diseaseColumns = column.columns([
  column.accessor("nameBn", {
    header: listHeader("notifiable.name"),
    cell: DiseaseNameCell,
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
    id: "takeOff",
    header: ActionsHeader,
    cell: TakeOffCell,
    meta: { align: "end" },
  }),
]);

/** The list as a table where there is room: each disease beside what the ULO said about it and who put it on. */
const DiseaseTable = ({ rows }: { rows: DiseaseRow[] }) => {
  const table = useListTable({
    columns: diseaseColumns,
    data: rows,
    getRowId: (row) => row.id,
  });
  return (
    <div className="bg-card hidden rounded-xl border md:block">
      <DataTable bare minWidth="36rem" table={table} />
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
  const t = useT();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const list = useQuery(orpc.notifiable.list.queryOptions());
  const me = useQuery(orpc.people.me.queryOptions());
  // A vet called in for a visit reads the list; keeping it is the farm's own people's.
  const keeps = me.data !== undefined && me.data.scopes.vet?.kind !== "cases";
  const [name, setName] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [note, setNote] = useState("");
  /** Which disease is being taken off, and why — typed in place, because a browser dialog
   *  blocks everything else on the phone. */
  const [comingOff, setComingOff] = useState<string | null>(null);
  const [why, setWhy] = useState("");

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.notifiable.key() });
  /** Whatever the farm said, in the reader's own language. */
  const onError = (error: Error) => toast.error(sayWhy(error, t));
  const add = useMutation(
    orpc.notifiable.add.mutationOptions({
      onSuccess: () => {
        setName("");
        setNameEn("");
        setNote("");
        refresh();
      },
      onError,
    })
  );
  const retire = useMutation(
    orpc.notifiable.retire.mutationOptions({ onSuccess: refresh, onError })
  );
  const takeOff = (id: string) => {
    retire.mutate({ id, reason: why.trim() });
    setComingOff(null);
    setWhy("");
  };

  return (
    <Page className="max-w-5xl">
      <PageHeader title={t("notifiable.title")} />

      {list.data?.length ? (
        <>
          <ul className="space-y-2 md:hidden">
            {list.data.map((disease) => (
              <li className="surface space-y-1 p-4 text-sm" key={disease.id}>
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={disease.retiredAt ? "text-muted-foreground" : ""}
                  >
                    {language === "en" && disease.nameEn
                      ? disease.nameEn
                      : disease.nameBn}
                    {disease.retiredAt ? ` · ${t("notifiable.retired")}` : ""}
                  </span>
                  {disease.retiredAt || !keeps ? null : (
                    <Button
                      onClick={() => setComingOff(disease.id)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      {t("notifiable.retire")}
                    </Button>
                  )}
                </div>
                {comingOff === disease.id ? (
                  <form
                    className="flex items-end gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      takeOff(disease.id);
                    }}
                  >
                    <div className="flex-1 space-y-1">
                      <Label htmlFor={`why-${disease.id}`}>
                        {t("notifiable.why")}
                      </Label>
                      <Input
                        id={`why-${disease.id}`}
                        onChange={(event) => setWhy(event.target.value)}
                        value={why}
                      />
                    </div>
                    <Button disabled={!why.trim()} size="sm" type="submit">
                      {t("notifiable.retire")}
                    </Button>
                  </form>
                ) : null}
                {disease.note ? (
                  <p className="text-muted-foreground text-xs">
                    {disease.note}
                  </p>
                ) : null}
                {disease.addedByName ? (
                  <p className="text-muted-foreground text-xs">
                    {t("notifiable.addedBy", { name: disease.addedByName })} ·{" "}
                    {formatDate(new Date(disease.createdAt), language, "date")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          <DiseaseTable
            rows={list.data.map((disease) => ({
              ...disease,
              keeps,
              comingOff: comingOff === disease.id,
              why,
              handleComingOff: () => setComingOff(disease.id),
              handleWhy: setWhy,
              handleTakeOff: () => takeOff(disease.id),
            }))}
          />
        </>
      ) : (
        <EmptyState icon={ShieldAlert} title={t("notifiable.none")} />
      )}

      {keeps ? (
        <form
          className="surface flex flex-col gap-4 p-4 md:p-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) {
              add.mutate({
                // The English name too, when the farm has one: a Vet who writes "Anthrax" and a
                // list that only says "তড়কা" would not match, and the farm would not report.
                name: {
                  bn: name.trim(),
                  ...(nameEn.trim() ? { en: nameEn.trim() } : {}),
                },
                ...(note.trim() ? { note: note.trim() } : {}),
              });
            }
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="disease-name">{t("notifiable.name")}</Label>
            <Input
              id="disease-name"
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="disease-name-en">{t("notifiable.nameEn")}</Label>
            <Input
              id="disease-name-en"
              onChange={(event) => setNameEn(event.target.value)}
              value={nameEn}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="disease-note">{t("notifiable.note")}</Label>
            <Input
              id="disease-note"
              onChange={(event) => setNote(event.target.value)}
              value={note}
            />
          </div>
          <Button disabled={!name.trim()} type="submit">
            {t("notifiable.add")}
          </Button>
        </form>
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
