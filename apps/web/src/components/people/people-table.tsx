import type { RoleName } from "@OpenFarm/api/roles";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Badge } from "@OpenFarm/ui/components/badge";
import { Button } from "@OpenFarm/ui/components/button";
import { cn } from "@OpenFarm/ui/lib/utils";
import { Link, useNavigate } from "@tanstack/react-router";
import { KeyRound, UserRound, UserRoundCheck } from "lucide-react";

import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { StatusBadge } from "@/components/page";
import { RowMenu } from "@/components/page-kit";
import { roleKey } from "@/components/role-choice";
import { useLanguage, useT } from "@/i18n/language-provider";

import type { Listed, Standing } from "./people-types";
import { STANDING_ORDER, STANDING_TONE, STANDING_WORD } from "./people-types";

/** What the page does from a row: approve an invitation, or hand somebody still to sign up a new code. */
export interface PeopleActions {
  handleApprove: (inviteId: string) => void;
  handleNewCode: (inviteId: string) => void;
  busy: (what: string) => boolean;
  /** Approving an invitation is the Owner's alone; a Manager sees it waiting and no button. */
  mayApprove: boolean;
}

interface PersonRow extends Listed {
  actions: PeopleActions;
}

/** What somebody's standing is called, in its colour: a visit says the last day it lasts. */
export const StandingBadge = ({ standing }: { standing: Standing }) => {
  const { t, language } = useLanguage();
  const said = t(STANDING_WORD[standing.kind], {
    date:
      standing.kind === "visiting"
        ? formatDate(
            new Date(standing.until.getTime() - 60_000),
            language,
            "date"
          )
        : "",
  });
  return <StatusBadge tone={STANDING_TONE[standing.kind]}>{said}</StatusBadge>;
};

/** The Roles somebody holds, each a quiet badge of its own. */
export const RoleBadges = ({ roles }: { roles: RoleName[] }) => {
  const t = useT();
  if (roles.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {roles.map((role) => (
        <Badge key={role} variant="outline">
          {t(roleKey(role))}
        </Badge>
      ))}
    </span>
  );
};

/** The one act a row shows as a button: approving an invitation that waits for the Owner. */
const ApproveButton = ({ row }: { row: PersonRow }) => {
  const t = useT();
  const { standing, actions } = row;
  if (standing.kind !== "waitingForTheOwner" || !actions.mayApprove) {
    return null;
  }
  const { handleApprove } = actions;
  return (
    <Button
      disabled={actions.busy(`approve:${standing.inviteId}`)}
      onClick={() => handleApprove(standing.inviteId)}
      size="sm"
    >
      <UserRoundCheck aria-hidden data-icon="inline-start" />
      {t("people.approve")}
    </Button>
  );
};

/** Everything else a row can do: open their page, or give somebody still to sign up a new code. */
const PersonRowMenu = ({ row }: { row: PersonRow }) => {
  const t = useT();
  const navigate = useNavigate();
  const { standing, actions, userId } = row;
  const { handleNewCode } = actions;
  return (
    <RowMenu
      actions={[
        ...(userId
          ? [
              {
                label: t("people.open"),
                icon: UserRound,
                handleSelect: () => {
                  void navigate({
                    to: "/admin/people/$userId",
                    params: { userId },
                  });
                },
              },
            ]
          : []),
        ...(standing.kind === "waitingToSignUp"
          ? [
              {
                label: t("people.newCode"),
                icon: KeyRound,
                disabled: actions.busy(`code:${standing.inviteId}`),
                handleSelect: () => handleNewCode(standing.inviteId),
              },
            ]
          : []),
      ]}
      label={t("people.rowActions", { name: row.name })}
    />
  );
};

/** A name leads to their page, where the farm has one for them. */
const PersonName = ({
  row,
  className,
}: {
  row: Listed;
  className?: string;
}) => {
  const { userId, name } = row;
  if (!userId) {
    return <span className={cn("font-medium", className)}>{name}</span>;
  }
  return (
    <Link
      className={cn(
        "font-medium underline-offset-4 hover:underline",
        className
      )}
      params={{ userId }}
      to="/admin/people/$userId"
    >
      {name}
    </Link>
  );
};

const NameCell = ({ row }: { row: { original: PersonRow } }) => (
  <span className="flex min-w-0 flex-col gap-0.5">
    <PersonName row={row.original} />
    <span className="text-muted-foreground text-sm break-all">
      {row.original.email}
    </span>
  </span>
);

const RolesCell = ({ row }: { row: { original: PersonRow } }) => (
  <RoleBadges roles={row.original.roles} />
);

/** Pens counted where somebody keeps some; an invitation keeps none until it is taken up. */
const PensCell = ({ row }: { row: { original: PersonRow } }) => {
  const { language } = useLanguage();
  const { pens } = row.original;
  if (pens === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return formatNumber(pens, language);
};

const StandingCell = ({ row }: { row: { original: PersonRow } }) => (
  <StandingBadge standing={row.original.standing} />
);

const ActionCell = ({ row }: { row: { original: PersonRow } }) => (
  <div className="flex items-center justify-end gap-1">
    <ApproveButton row={row.original} />
    <PersonRowMenu row={row.original} />
  </div>
);

const column = createListColumns<PersonRow>();
const personColumns = column.columns([
  column.accessor("name", {
    header: listHeader("people.name"),
    cell: NameCell,
    meta: { className: "min-w-56" },
  }),
  column.accessor((person) => person.roles.join(","), {
    id: "roles",
    header: listHeader("people.roles"),
    cell: RolesCell,
  }),
  column.accessor("pens", {
    header: listHeader("people.col.pens"),
    cell: PensCell,
    meta: { align: "end" },
  }),
  column.accessor((person) => STANDING_ORDER[person.standing.kind], {
    id: "standing",
    header: listHeader("people.status"),
    cell: StandingCell,
  }),
  column.display({
    id: "action",
    header: ActionsHeader,
    cell: ActionCell,
    meta: { align: "end", className: "w-40" },
  }),
]);

/** One name on the list, on a phone: who, how they stand, what they are and hold beneath, and what can be done. */
const PersonCard = ({ row }: { row: PersonRow }) => {
  const t = useT();
  const roles = row.roles.map((role) => t(roleKey(role))).join(", ");
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <PersonName className="-my-2 w-fit py-2" row={row} />
        <StandingBadge standing={row.standing} />
        <span className="text-muted-foreground text-xs break-all">
          {[
            roles,
            row.pens > 0 ? t("people.pensHeld", { count: row.pens }) : "",
            row.email,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <ApproveButton row={row} />
        <PersonRowMenu row={row} />
      </div>
    </div>
  );
};

const personCard = (row: PersonRow) => <PersonCard row={row} />;

/** Everybody as a table where there is room — name and email, Roles, Pens and standing, sortable — and as cards on a
 *  phone. */
export const PeopleTable = ({
  rows,
  actions,
}: {
  rows: Listed[];
  actions: PeopleActions;
}) => {
  const table = useListTable({
    columns: personColumns,
    data: rows.map((row) => ({ ...row, actions })),
    getRowId: (row) => row.key,
  });
  return (
    <DataTable card={personCard} minWidth="48rem" pageSize={20} table={table} />
  );
};
