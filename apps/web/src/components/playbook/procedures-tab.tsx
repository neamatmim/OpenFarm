import type { SopContent } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";
import { Input } from "@OpenFarm/ui/components/input";
import { useNavigate } from "@tanstack/react-router";
import {
  BookOpen,
  FileText,
  GitPullRequestArrow,
  Pencil,
  Search,
} from "lucide-react";
import { useState } from "react";

import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { EmptyState } from "@/components/page";
import { FilterBar, RowMenu } from "@/components/page-kit";
import { RaiseWork } from "@/components/raise-work";
import { useLanguage } from "@/i18n/language-provider";

import type { Sop } from "./playbook-types";
import { contentOf, whenWords } from "./playbook-types";

/** What the page does when a procedure's menu is used: open its card, or change it — the Owner by editing, the
 *  Manager by proposing. */
interface ProcedureActions {
  isOwner: boolean;
  handleEdit: (definitionId: string, content: SopContent) => void;
  handleCard: (definitionId: string) => void;
}

/** A procedure as its row reads it: its names in both languages, the Version in force and what it says. */
interface ProcedureRow {
  id: string;
  name: string;
  english: string;
  purpose: string;
  version: number;
  steps: number;
  content: SopContent | undefined;
  actions: ProcedureActions;
}

const toRow = (sop: Sop, actions: ProcedureActions): ProcedureRow => {
  const content = contentOf(sop);
  return {
    id: sop.id,
    name: content?.name.bn ?? "—",
    english: content?.name.en ?? "",
    purpose: content?.purpose.bn ?? "",
    version: sop.currentVersion?.number ?? 0,
    steps: content?.steps.length ?? 0,
    content,
    actions,
  };
};

/** When its work comes up, a line each — or that it is raised when the farm needs it. */
const WhenItComesUp = ({ content }: { content: SopContent | undefined }) => {
  const { t } = useLanguage();
  if (!content) {
    return <span className="text-muted-foreground">—</span>;
  }
  const words = whenWords(content, t);
  if (words.length === 0) {
    return <span className="text-muted-foreground">{t("sop.byHand")}</span>;
  }
  return (
    <ul className="flex flex-col gap-0.5">
      {words.map((word) => (
        <li className="tabular-nums" key={word}>
          {word}
        </li>
      ))}
    </ul>
  );
};

/** Who does it, and beneath, who signs it off. */
const WhoDoesIt = ({ content }: { content: SopContent | undefined }) => {
  const { t } = useLanguage();
  if (!content) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span>{t(`role.${content.assignedRole}`)}</span>
      <span className="text-muted-foreground text-xs">
        {t("sop.checkedBy", {
          role: content.checkerRole
            ? t(`role.${content.checkerRole}`)
            : t("sop.checkerNone"),
        })}
      </span>
    </div>
  );
};

/** The menu at the end of a procedure's row: its card, and the way to change it. */
const ProcedureMenu = ({ row }: { row: ProcedureRow }) => {
  const { t } = useLanguage();
  const { content } = row;
  const { handleCard, handleEdit, isOwner } = row.actions;
  if (!content) {
    return null;
  }
  return (
    <RowMenu
      actions={[
        {
          label: t("sop.readCard"),
          icon: FileText,
          handleSelect: () => handleCard(row.id),
        },
        {
          label: isOwner ? t("sop.edit") : t("sop.propose"),
          icon: isOwner ? Pencil : GitPullRequestArrow,
          handleSelect: () => handleEdit(row.id, content),
        },
      ]}
      label={t("sop.rowActions", { name: row.name })}
    />
  );
};

const NameCell = ({ row }: { row: { original: ProcedureRow } }) => (
  <div className="flex min-w-0 flex-col gap-0.5">
    <span className="font-medium">{row.original.name}</span>
    {row.original.purpose ? (
      <span className="text-muted-foreground line-clamp-2 text-xs">
        {row.original.purpose}
      </span>
    ) : null}
  </div>
);

const WhenCell = ({ row }: { row: { original: ProcedureRow } }) => (
  <WhenItComesUp content={row.original.content} />
);

const WhoCell = ({ row }: { row: { original: ProcedureRow } }) => (
  <WhoDoesIt content={row.original.content} />
);

const CountCell = ({ getValue }: { getValue: () => number }) => {
  const { language } = useLanguage();
  return formatNumber(getValue(), language);
};

const ActionsCell = ({ row }: { row: { original: ProcedureRow } }) => (
  <div className="flex items-center justify-end gap-1">
    {row.original.content ? <RaiseWork definitionId={row.original.id} /> : null}
    <ProcedureMenu row={row.original} />
  </div>
);

const column = createListColumns<ProcedureRow>();
const procedureColumns = column.columns([
  column.accessor("name", {
    header: listHeader("sop.name"),
    cell: NameCell,
    meta: { className: "min-w-56" },
  }),
  column.display({
    id: "when",
    header: listHeader("sop.col.when"),
    cell: WhenCell,
  }),
  column.accessor((row) => row.content?.assignedRole ?? "", {
    id: "who",
    header: listHeader("sop.assignedRole"),
    cell: WhoCell,
  }),
  column.accessor("version", {
    header: listHeader("sop.col.version"),
    cell: CountCell,
    meta: { align: "end" },
  }),
  column.accessor("steps", {
    header: listHeader("sop.steps"),
    cell: CountCell,
    meta: { align: "end" },
  }),
  column.display({
    id: "actions",
    header: ActionsHeader,
    cell: ActionsCell,
    meta: { align: "end", className: "w-64" },
  }),
]);

/** A procedure on a phone: its name and when it comes up, who does it, and the work to raise now beneath. */
const ProcedureCard = ({ row }: { row: ProcedureRow }) => {
  const { t, language } = useLanguage();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-medium">{row.name}</span>
          <div className="text-sm">
            <WhenItComesUp content={row.content} />
          </div>
          <span className="text-muted-foreground text-xs">
            {row.content ? t(`role.${row.content.assignedRole}`) : "—"} ·{" "}
            {t("sop.version", { number: row.version })} ·{" "}
            {formatNumber(row.steps, language)} {t("sop.steps")}
          </span>
        </div>
        <ProcedureMenu row={row} />
      </div>
      {row.content ? <RaiseWork definitionId={row.id} /> : null}
    </div>
  );
};

const procedureCard = (row: ProcedureRow) => <ProcedureCard row={row} />;

/** Whether a procedure answers to what was typed, in either of its names. */
const matches = (row: ProcedureRow, typed: string): boolean => {
  const wanted = typed.trim().toLocaleLowerCase();
  return (
    wanted === "" ||
    row.name.toLocaleLowerCase().includes(wanted) ||
    row.english.toLocaleLowerCase().includes(wanted)
  );
};

/**
 * The Playbook, a row per procedure: when its work comes up, who does it and who signs it off, and the Version in
 * force. Raising its work now is the one act on the row; its card, and changing it, are in the row's menu.
 */
export const ProceduresTab = ({
  sops,
  isOwner,
  onEdit,
}: {
  sops: Sop[];
  isOwner: boolean;
  onEdit: (definitionId: string, content: SopContent) => void;
}) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [typed, setTyped] = useState("");
  const actions: ProcedureActions = {
    isOwner,
    handleEdit: onEdit,
    handleCard: (definitionId) =>
      navigate({ to: "/cards/$definitionId", params: { definitionId } }),
  };
  const rows = sops
    .map((sop) => toRow(sop, actions))
    .filter((row) => matches(row, typed));
  const table = useListTable({
    columns: procedureColumns,
    data: rows,
    getRowId: (row) => row.id,
  });
  if (sops.length === 0) {
    return <EmptyState icon={BookOpen} title={t("sop.none")} />;
  }
  return (
    <div className="bg-card flex flex-col gap-4 rounded-xl border p-4 md:p-5">
      <FilterBar>
        <div className="relative sm:w-72">
          <Search
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <Input
            aria-label={t("sop.search")}
            className="pl-9"
            onChange={(event) => setTyped(event.target.value)}
            placeholder={t("sop.search")}
            type="search"
            value={typed}
          />
        </div>
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyState bare icon={Search} title={t("sop.noMatch")} />
      ) : (
        <DataTable card={procedureCard} minWidth="60rem" table={table} />
      )}
    </div>
  );
};
