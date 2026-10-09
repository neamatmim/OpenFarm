import type { SopChange, SopContent } from "@OpenFarm/domain";
import { describeChanges } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@OpenFarm/ui/components/sheet";
import { Link } from "@tanstack/react-router";
import { Check, Eye, Hourglass, Inbox, X } from "lucide-react";
import { useState } from "react";

import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { SaidDate } from "@/components/list-cells";
import { EmptyState, Notice, SUBHEADING, StatusBadge } from "@/components/page";
import { InsetPanel, RowMenu } from "@/components/page-kit";
import { ChangeLines } from "@/components/work/work-notices";
import { useLanguage } from "@/i18n/language-provider";
import { saidIn } from "@/lib/names-in";

import type { Proposal } from "./playbook-types";
import { whenWords } from "./playbook-types";

/** What the page does with a change waiting: the Owner publishes it or turns it down; anybody may read it first. */
interface ProposalActions {
  isOwner: boolean;
  deciding: boolean;
  handleApprove: (id: string) => void;
  handleReject: (id: string) => void;
  handleRead: (id: string) => void;
}

/** A change waiting, as its row reads it: which procedure, who proposed it and when, why, and what it would say. */
interface ProposalRow {
  id: string;
  name: string;
  proposer: string;
  note: string | null;
  proposedAt: Date;
  /** The Version in force now, the one the change would replace. */
  inForce: number | null;
  /** The Version it was drafted against. */
  draftedOn: number | null;
  /** A newer Version is in force than the one it was drafted against: approving it would undo what came between, so
   *  the farm refuses it, and the Manager drafts it again. */
  outOfDate: boolean;
  /** What it changes in the Version in force, a line each. */
  changes: SopChange[];
  /** The procedure it would change, whose card shows what it says now; none for a procedure not yet written. */
  definitionId: string | null;
  content: SopContent;
  actions: ProposalActions;
}

const toRow = (proposal: Proposal, actions: ProposalActions): ProposalRow => {
  const content = proposal.content as SopContent;
  const inForce = proposal.definition?.currentVersion?.content as
    | SopContent
    | undefined;
  return {
    id: proposal.id,
    name: content.name.bn,
    proposer: proposal.proposer?.name ?? "",
    note: proposal.note,
    proposedAt: new Date(proposal.createdAt),
    inForce: proposal.definition?.currentVersion?.number ?? null,
    draftedOn: proposal.basedOn?.number ?? null,
    outOfDate:
      proposal.basedOnVersionId !==
      (proposal.definition?.currentVersionId ?? null),
    changes: inForce ? describeChanges(inForce, content) : [],
    definitionId: proposal.definition?.id ?? null,
    content,
    actions,
  };
};

/** Where a change waiting stands: drafted against an older Version, the Owner's to approve, or with the Owner. */
const Standing = ({ row }: { row: ProposalRow }) => {
  const { t } = useLanguage();
  const { isOwner, deciding, handleApprove } = row.actions;
  if (row.outOfDate) {
    return (
      <StatusBadge tone="warning">
        {t("sop.outOfDate", { number: row.draftedOn ?? 0 })}
      </StatusBadge>
    );
  }
  if (!isOwner) {
    return (
      <StatusBadge icon={Hourglass} tone="info">
        {t("sop.withTheOwner")}
      </StatusBadge>
    );
  }
  return (
    <Button
      disabled={deciding}
      onClick={() => handleApprove(row.id)}
      size="sm"
      type="button"
    >
      <Check aria-hidden data-icon="inline-start" />
      {t("sop.approve")}
    </Button>
  );
};

/** Approving is the one act on the row, and the Owner's alone; a Manager sees the change is with the Owner. One drafted
 *  against an older Version says so instead, and waits to be turned down or drafted again. */
const Decide = ({ row }: { row: ProposalRow }) => {
  const { t } = useLanguage();
  const { isOwner, deciding, handleReject, handleRead } = row.actions;
  return (
    <div className="flex items-center justify-end gap-1">
      <Standing row={row} />
      <RowMenu
        actions={[
          {
            label: t("sop.readProposal"),
            icon: Eye,
            handleSelect: () => handleRead(row.id),
          },
          ...(isOwner
            ? [
                {
                  label: t("sop.reject"),
                  icon: X,
                  destructive: true,
                  disabled: deciding,
                  handleSelect: () => handleReject(row.id),
                },
              ]
            : []),
        ]}
        label={t("sop.rowActions", { name: row.name })}
      />
    </div>
  );
};

const NameCell = ({ row }: { row: { original: ProposalRow } }) => {
  const { t } = useLanguage();
  const { name, inForce, definitionId } = row.original;
  return (
    <div className="flex flex-col gap-0.5">
      {/* The card of what it would change, to read beside the proposal. */}
      {definitionId && inForce !== null ? (
        <Link
          className="w-fit font-medium hover:underline"
          params={{ definitionId }}
          to="/sops/$definitionId/card"
        >
          {name}
        </Link>
      ) : (
        <span className="font-medium">{name}</span>
      )}
      {inForce === null ? null : (
        <span className="text-muted-foreground text-xs">
          {t("sop.inForce", { number: inForce })}
        </span>
      )}
    </div>
  );
};

const ProposerCell = ({ row }: { row: { original: ProposalRow } }) => (
  <div className="flex flex-col gap-0.5">
    <span>{row.original.proposer}</span>
    <span className="text-muted-foreground text-xs whitespace-nowrap">
      <SaidDate at={row.original.proposedAt} />
    </span>
  </div>
);

const NoteCell = ({ row }: { row: { original: ProposalRow } }) => (
  <span className="text-muted-foreground">{row.original.note ?? "—"}</span>
);

const DecideCell = ({ row }: { row: { original: ProposalRow } }) => (
  <Decide row={row.original} />
);

const column = createListColumns<ProposalRow>();
const proposalColumns = column.columns([
  column.accessor("name", {
    header: listHeader("sop.name"),
    cell: NameCell,
  }),
  column.accessor("proposer", {
    header: listHeader("sop.col.proposer"),
    cell: ProposerCell,
  }),
  column.accessor((row) => row.note ?? undefined, {
    id: "note",
    header: listHeader("sop.col.note"),
    cell: NoteCell,
    meta: { className: "min-w-64" },
  }),
  column.display({
    id: "decide",
    header: ActionsHeader,
    cell: DecideCell,
    meta: { align: "end" },
  }),
]);

/** A change waiting, on a phone: which procedure and who proposed it, why beneath, and the decision at its foot. */
const ProposalCard = ({ row }: { row: ProposalRow }) => {
  const { t, language } = useLanguage();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">{row.name}</span>
        <span className="text-muted-foreground text-xs">
          {t("sop.proposalBy", { name: row.proposer })} ·{" "}
          {formatDate(row.proposedAt, language)}
        </span>
      </div>
      {row.note ? <p className="text-sm">{row.note}</p> : null}
      <Decide row={row} />
    </div>
  );
};

const proposalCard = (row: ProposalRow) => <ProposalCard row={row} />;

/** What a proposed change would make the procedure say, read before anybody decides on it. */
const ProposalSheet = ({
  row,
  onOpenChange,
}: {
  row: ProposalRow | undefined;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t, language } = useLanguage();
  const content = row?.content;
  const when = content ? whenWords(content, t, language) : [];
  return (
    <Sheet onOpenChange={onOpenChange} open={row !== undefined}>
      <SheetContent
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg"
        closeLabel={t("common.close")}
      >
        <SheetHeader className="border-b">
          <SheetTitle>{row?.name}</SheetTitle>
          <SheetDescription>
            {row ? t("sop.proposalBy", { name: row.proposer }) : null}
            {row?.note ? ` — ${row.note}` : ""}
          </SheetDescription>
        </SheetHeader>
        {content ? (
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4 text-sm">
            {row?.outOfDate ? (
              <Notice
                title={t("sop.outOfDateTitle", {
                  drafted: row.draftedOn ?? 0,
                  number: row.inForce ?? 0,
                })}
                tone="warning"
              >
                {t("sop.outOfDateWhy")}
              </Notice>
            ) : null}
            {row && row.changes.length > 0 ? (
              <section className="flex flex-col gap-1">
                <h3 className={SUBHEADING}>
                  {t("sop.whatItChanges", { number: row.inForce ?? 0 })}
                </h3>
                <ChangeLines changes={row.changes} />
              </section>
            ) : null}
            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-0.5 sm:col-span-2">
                <dt className="text-muted-foreground text-xs">
                  {t("sop.purpose")}
                </dt>
                <dd>{content.purpose.bn || "—"}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground text-xs">
                  {t("sop.col.when")}
                </dt>
                <dd>{when.length > 0 ? when.join(" · ") : t("sop.byHand")}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground text-xs">
                  {t("sop.assignedRole")}
                </dt>
                <dd>
                  {t(`role.${content.assignedRole}`)} ·{" "}
                  {t("sop.checkedBy", {
                    role: content.checkerRole
                      ? t(`role.${content.checkerRole}`)
                      : t("sop.checkerNone"),
                  })}
                </dd>
              </div>
            </dl>
            <section className="flex flex-col gap-2">
              <h3 className={SUBHEADING}>
                {t("sop.steps")} ·{" "}
                {formatNumber(content.steps.length, language)}
              </h3>
              <ol className="flex flex-col gap-2">
                {content.steps.map((step, index) => (
                  <InsetPanel as="li" className="flex gap-3" key={step.id}>
                    <span className="bg-secondary text-secondary-foreground grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums">
                      {formatNumber(index + 1, language)}
                    </span>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span>{saidIn(step.text, language) || "—"}</span>
                      <span className="text-muted-foreground text-xs">
                        {step.evidence
                          .map((item) => t(`sop.evidence.${item.type}`))
                          .join(", ")}
                        {step.repeatPerAnimal
                          ? ` · ${t("sop.repeatPerAnimal")}`
                          : ""}
                      </span>
                    </div>
                  </InsetPanel>
                ))}
              </ol>
            </section>
          </div>
        ) : null}
        <SheetFooter className="flex-row justify-end border-t">
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            {t("common.close")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

/**
 * Changes proposed to the Playbook, waiting for the Owner: which procedure, who proposed it and why. The Owner
 * publishes one from its row, or turns it down from the row's menu, where anybody may read the change first.
 */
export const ProposalsTab = ({
  proposals,
  isOwner,
  deciding,
  onApprove,
  onReject,
}: {
  proposals: Proposal[];
  isOwner: boolean;
  deciding: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) => {
  const { t } = useLanguage();
  const [reading, setReading] = useState<string | null>(null);
  const actions: ProposalActions = {
    isOwner,
    deciding,
    handleApprove: onApprove,
    handleReject: onReject,
    handleRead: setReading,
  };
  const rows = proposals.map((proposal) => toRow(proposal, actions));
  const table = useListTable({
    columns: proposalColumns,
    data: rows,
    getRowId: (row) => row.id,
  });
  if (rows.length === 0) {
    return <EmptyState icon={Inbox} title={t("sop.noProposals")} />;
  }
  return (
    <div className="surface p-4 md:p-5">
      <DataTable card={proposalCard} minWidth="48rem" table={table} />
      <ProposalSheet
        onOpenChange={(open) => {
          if (!open) {
            setReading(null);
          }
        }}
        row={rows.find((row) => row.id === reading)}
      />
    </div>
  );
};
