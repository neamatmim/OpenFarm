import type { SopContent } from "@OpenFarm/domain";
import { mayRaiseByHand } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";
import { Input } from "@OpenFarm/ui/components/input";
import { cn } from "@OpenFarm/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import {
  Archive,
  ArchiveRestore,
  BookOpen,
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
import { Nothing } from "@/components/list-cells";
import { EmptyState, SegmentedControl, StatusBadge } from "@/components/page";
import { FilterBar, RowMenu } from "@/components/page-kit";
import { RaiseWork } from "@/components/raise-work";
import { useLanguage } from "@/i18n/language-provider";

import type { Sop } from "./playbook-types";
import { contentOf, whenWords } from "./playbook-types";

/** What the page does when a procedure's menu is used: change it — the Owner by editing, the Manager by proposing —
 *  and, the Owner's alone, retire it or bring it back. */
interface ProcedureActions {
  isOwner: boolean;
  handleEdit: (definitionId: string, content: SopContent) => void;
  handleRetire: (definitionId: string, name: string) => void;
  handleRestore: (definitionId: string) => void;
}

type Translate = ReturnType<typeof useLanguage>["t"];

/** A procedure as its row reads it: its names in both languages, the Version in force and what it says. */
interface ProcedureRow {
  id: string;
  name: string;
  english: string;
  purpose: string;
  version: number;
  steps: number;
  content: SopContent | undefined;
  /** Out of force: its work is raised no more, and it is kept for what was done under it. */
  retired: boolean;
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
    retired: sop.retiredAt !== null,
    actions,
  };
};

/** When its work comes up, a line each — or that it is raised when the farm needs it. */
const WhenItComesUp = ({ content }: { content: SopContent | undefined }) => {
  const { t, language } = useLanguage();
  if (!content) {
    return <Nothing />;
  }
  const words = whenWords(content, t, language);
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
    return <Nothing />;
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

/** The acts on a procedure in force: the Owner edits or retires it, anybody else proposes a change. */
const inForceActions = (
  row: ProcedureRow,
  content: SopContent,
  t: Translate
) => {
  const { handleEdit, handleRetire, isOwner } = row.actions;
  const change = {
    label: isOwner ? t("sop.edit") : t("sop.propose"),
    icon: isOwner ? Pencil : GitPullRequestArrow,
    handleSelect: () => handleEdit(row.id, content),
  };
  if (!isOwner) {
    return [change];
  }
  return [
    change,
    {
      label: t("sop.retire"),
      icon: Archive,
      handleSelect: () => handleRetire(row.id, row.name),
      destructive: true,
    },
  ];
};

/** The way to change a procedure, at the end of its row. A retired one is changed by nobody; the Owner may bring it
 *  back. Its card is its name. */
const ProcedureMenu = ({ row }: { row: ProcedureRow }) => {
  const { t } = useLanguage();
  const { content } = row;
  const { handleRestore, isOwner } = row.actions;
  if (!content || (row.retired && !isOwner)) {
    return null;
  }
  return (
    <RowMenu
      actions={
        row.retired
          ? [
              {
                label: t("sop.restore"),
                icon: ArchiveRestore,
                handleSelect: () => handleRestore(row.id),
              },
            ]
          : inForceActions(row, content, t)
      }
      label={t("sop.rowActions", { name: row.name })}
    />
  );
};

/** That a procedure is out of force, beside its name. */
const RetiredBadge = ({ row }: { row: ProcedureRow }) => {
  const { t } = useLanguage();
  if (!row.retired) {
    return null;
  }
  return (
    <StatusBadge icon={Archive} tone="neutral">
      {t("sop.retired")}
    </StatusBadge>
  );
};

/** A procedure's name, as the way to its card — the one-page sheet the farm reads and trains from. */
const ProcedureName = ({ row }: { row: ProcedureRow }) =>
  row.content ? (
    <Link
      className={cn(
        "w-fit rounded-md font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2",
        row.retired && "text-muted-foreground"
      )}
      params={{ definitionId: row.id }}
      to="/cards/$definitionId"
    >
      {row.name}
    </Link>
  ) : (
    <span className="font-medium">{row.name}</span>
  );

const NameCell = ({ row }: { row: { original: ProcedureRow } }) => (
  <div className="flex min-w-0 flex-col gap-0.5">
    <div className="flex flex-wrap items-center gap-2">
      <ProcedureName row={row.original} />
      <RetiredBadge row={row.original} />
    </div>
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

/** Whether its work may be raised now, from its row: only a procedure in force, and one that is raised by hand. */
const raisable = (row: ProcedureRow): boolean =>
  !row.retired && row.content !== undefined && mayRaiseByHand(row.content);

const ActionsCell = ({ row }: { row: { original: ProcedureRow } }) => (
  <div className="flex items-center justify-end gap-1">
    {raisable(row.original) ? (
      <RaiseWork definitionId={row.original.id} />
    ) : null}
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
  column.accessor((row) => row.content?.assignedRole ?? undefined, {
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
          <div className="flex flex-wrap items-center gap-2">
            <ProcedureName row={row} />
            <RetiredBadge row={row} />
          </div>
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
      {raisable(row) ? <RaiseWork definitionId={row.id} /> : null}
    </div>
  );
};

const procedureCard = (row: ProcedureRow) => <ProcedureCard row={row} />;

/** Which of the Playbook the list shows: what the farm works to now, or what it has retired. */
type Standing = "in_force" | "retired";

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
 * force. Its name opens its card; raising its work now, and changing it, are the acts on the row.
 */
export const ProceduresTab = ({
  sops,
  isOwner,
  onEdit,
  onRetire,
  onRestore,
}: {
  sops: Sop[];
  isOwner: boolean;
  onEdit: (definitionId: string, content: SopContent) => void;
  onRetire: (definitionId: string, name: string) => void;
  onRestore: (definitionId: string) => void;
}) => {
  const { t, language } = useLanguage();
  const [typed, setTyped] = useState("");
  const [showing, setShowing] = useState<Standing>("in_force");
  const actions: ProcedureActions = {
    isOwner,
    handleEdit: onEdit,
    handleRetire: onRetire,
    handleRestore: onRestore,
  };
  const all = sops.map((sop) => toRow(sop, actions));
  const retiredCount = all.filter((row) => row.retired).length;
  // Back to those in force once the last retired one is brought back, so the list is never left showing nothing.
  const shown = retiredCount === 0 ? "in_force" : showing;
  const rows = all.filter(
    (row) => row.retired === (shown === "retired") && matches(row, typed)
  );
  const table = useListTable({
    columns: procedureColumns,
    data: rows,
    getRowId: (row) => row.id,
  });
  if (sops.length === 0) {
    return <EmptyState icon={BookOpen} title={t("sop.none")} />;
  }
  return (
    <div className="surface flex flex-col gap-4 p-4 md:p-5">
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
        {retiredCount > 0 ? (
          <SegmentedControl
            label={t("sop.showing")}
            name="sop-standing"
            onChange={setShowing}
            options={[
              {
                value: "in_force",
                label: `${t("sop.inForceNow")} · ${formatNumber(all.length - retiredCount, language)}`,
              },
              {
                value: "retired",
                label: `${t("sop.retired")} · ${formatNumber(retiredCount, language)}`,
              },
            ]}
            value={shown}
          />
        ) : null}
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyState bare icon={Search} title={t("sop.noMatch")} />
      ) : (
        <DataTable card={procedureCard} minWidth="60rem" table={table} />
      )}
    </div>
  );
};
