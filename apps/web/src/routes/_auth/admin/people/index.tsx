import type { RoleName } from "@OpenFarm/api/roles";
import { ROLES } from "@OpenFarm/api/roles";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Checkbox } from "@OpenFarm/ui/components/checkbox";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { KeyRound, MailCheck, Search } from "lucide-react";
import { useMemo, useState } from "react";
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
  Notice,
  Page,
  PageHeader,
  Section,
  StatusBadge,
} from "@/components/page";
import { RoleChoice, roleKey, toggled } from "@/components/role-choice";
import { useLanguage, useT } from "@/i18n/language-provider";
import { useInFlight } from "@/lib/in-flight";
import { orpc } from "@/utils/orpc";

/** Everybody the farm has a name for, in one list: those who work here, those invited and not yet approved, and
 *  those approved who have not signed up. What each of them is waiting for is said beside their name rather
 *  than by which of three lists they are in. */
type Standing =
  | { kind: "working" }
  | { kind: "visiting"; until: Date }
  | { kind: "gone" }
  | { kind: "waitingForTheOwner"; inviteId: string }
  | { kind: "waitingToSignUp"; inviteId: string };

interface Listed {
  key: string;
  name: string;
  email: string;
  roles: RoleName[];
  /** Their own page, for somebody the farm has: an invitation has none until it is taken up. */
  userId: string | null;
  pens: number;
  standing: Standing;
}

const STANDING_WORD = {
  working: "people.standing.working",
  visiting: "visit.until",
  gone: "people.standing.gone",
  waitingForTheOwner: "people.standing.waitingForTheOwner",
  waitingToSignUp: "people.standing.waitingToSignUp",
} as const;

const TONE = {
  working: "success",
  visiting: "warning",
  gone: "danger",
  waitingForTheOwner: "warning",
  waitingToSignUp: "neutral",
} as const;

/**
 * What the farm is waiting on for somebody who already has an account.
 *
 * Written to survive an answer the farm gave some other week. The phone keeps what it last knew for a
 * fortnight and shows it before it has asked again, so a screen written this morning is handed payloads
 * shaped the way the farm shaped them when that phone was last in signal.
 */
const standingOf = (person: {
  disabledAt?: Date | null;
  visitUntil?: Date | null;
}): Standing => {
  if (person.disabledAt) {
    return { kind: "gone" };
  }
  return person.visitUntil
    ? { kind: "visiting", until: new Date(person.visitUntil) }
    : { kind: "working" };
};

/** Where the person's name is looked for: their name and the email the farm writes to. */
const matching = (rows: Listed[], looking: string) => {
  const needle = looking.trim().toLowerCase();
  if (!needle) {
    return rows;
  }
  return rows.filter(
    (row) =>
      (row.name ?? "").toLowerCase().includes(needle) ||
      (row.email ?? "").toLowerCase().includes(needle)
  );
};

/** The code to hand the invited person, shown once: they sign up with their email and enter it. */
const InviteCode = ({
  name,
  email,
  code,
}: {
  name: string;
  email: string;
  code: string;
}) => {
  const t = useT();
  return (
    <Notice
      icon={KeyRound}
      title={t("people.handOverTitle", { name })}
      tone="info"
    >
      <p>{t("people.handOverHow", { email })}</p>
      <p className="text-foreground mt-2 font-mono text-2xl font-semibold tracking-[0.3em]">
        {code}
      </p>
    </Notice>
  );
};

/** Which Roles an invite gives: the Owner picks; a Manager invites Barn Staff. */
const InviteRoles = ({
  ownerCanPickRoles,
  roles,
  onToggle,
}: {
  ownerCanPickRoles: boolean;
  roles: RoleName[];
  onToggle: (role: RoleName) => void;
}) => {
  const t = useT();
  if (!ownerCanPickRoles) {
    return (
      <p className="text-muted-foreground text-sm sm:col-span-2">
        {t("role.staff")}
      </p>
    );
  }
  return (
    <fieldset className="flex flex-wrap gap-x-5 gap-y-1 sm:col-span-2">
      <legend className="mb-1 text-sm font-medium">{t("people.roles")}</legend>
      {ROLES.map((role) => (
        <RoleChoice
          checked={roles.includes(role)}
          key={role}
          onToggle={() => onToggle(role)}
          role={role}
        />
      ))}
    </fieldset>
  );
};

/** Whether the person invited is a vet called in for a visit, and the last day it lasts. */
const VisitChoice = ({
  visiting,
  onVisiting,
  until,
  onUntil,
}: {
  visiting: boolean;
  onVisiting: (visiting: boolean) => void;
  until: string;
  onUntil: (day: string) => void;
}) => {
  const t = useT();
  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
      <label className="inline-flex items-center gap-2 text-sm font-medium">
        <Checkbox
          checked={visiting}
          onCheckedChange={(checked) => onVisiting(Boolean(checked))}
        />
        {t("visit.invite")}
      </label>
      {visiting ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-visit-until">{t("visit.lastDay")}</Label>
          <Input
            className="w-44"
            id="invite-visit-until"
            onChange={(event) => onUntil(event.target.value)}
            required
            type="date"
            value={until}
          />
          <p className="text-muted-foreground text-xs">
            {t("visit.inviteHint")}
          </p>
        </div>
      ) : null}
    </div>
  );
};

const InviteForm = ({
  ownerCanPickRoles,
  onSent,
}: {
  ownerCanPickRoles: boolean;
  onSent: () => void;
}) => {
  const t = useT();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<RoleName[]>(["staff"]);
  // A vet called in for a visit: invited as a Vet, until a day.
  const [visiting, setVisiting] = useState(false);
  const [visitUntil, setVisitUntil] = useState("");
  const [handOver, setHandOver] = useState<{
    name: string;
    email: string;
    code: string;
  } | null>(null);
  const invite = useMutation(
    orpc.people.invite.mutationOptions({
      onSuccess: ({ code }) => {
        toast.success(t("people.inviteSent"));
        setHandOver({ name, email, code });
        setName("");
        setEmail("");
        onSent();
      },
      onError: () => toast.error(t("common.error")),
    })
  );

  return (
    <Section title={t("people.invite")}>
      {handOver ? <InviteCode {...handOver} /> : null}
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          invite.mutate(
            visiting
              ? { name, email, roles: ["vet"], visitUntil }
              : { name, email, roles }
          );
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="invite-name">{t("people.name")}</Label>
          <Input
            id="invite-name"
            onChange={(e) => setName(e.target.value)}
            required
            value={name}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="invite-email">{t("people.email")}</Label>
          <Input
            id="invite-email"
            onChange={(e) => setEmail(e.target.value)}
            required
            type="email"
            value={email}
          />
        </div>
        <VisitChoice
          onUntil={setVisitUntil}
          onVisiting={setVisiting}
          until={visitUntil}
          visiting={visiting}
        />
        {visiting ? null : (
          <InviteRoles
            onToggle={(role) => setRoles((current) => toggled(current, role))}
            ownerCanPickRoles={ownerCanPickRoles}
            roles={roles}
          />
        )}
        <Button
          className="w-full sm:w-auto sm:justify-self-start"
          disabled={
            invite.isPending || (visiting ? !visitUntil : roles.length === 0)
          }
          type="submit"
        >
          {invite.isPending ? <Spinner /> : null}
          {t("people.inviteSend")}
        </Button>
      </form>
    </Section>
  );
};

/** What somebody's standing is called, in its colour: a visit says the last day it lasts. */
const StandingBadge = ({ standing }: { standing: Standing }) => {
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
  return <StatusBadge tone={TONE[standing.kind]}>{said}</StatusBadge>;
};

/** What the Owner can do for somebody still on their way in: approve the invitation, or hand them a new code. */
interface Waiting {
  onApprove: (inviteId: string) => void;
  onNewCode: (inviteId: string) => void;
  busy: (what: string) => boolean;
}

const WaitingAction = ({
  row,
  onApprove,
  onNewCode,
  busy,
}: Waiting & { row: Listed }) => {
  const t = useT();
  if (row.standing.kind === "waitingForTheOwner") {
    return (
      <Button
        disabled={busy(`approve:${row.standing.inviteId}`)}
        onClick={() => onApprove(row.key)}
        size="sm"
      >
        {t("people.approve")}
      </Button>
    );
  }
  if (row.standing.kind === "waitingToSignUp") {
    return (
      <Button
        disabled={busy(`code:${row.standing.inviteId}`)}
        onClick={() => onNewCode(row.key)}
        size="sm"
        variant="outline"
      >
        {t("people.newCode")}
      </Button>
    );
  }
  return null;
};

/** One name on the list, on a phone: what they are, what they are waiting for — said under the name, where a
 *  long visit has room — and the way to their page. */
const PersonLine = ({ row, ...waiting }: Waiting & { row: Listed }) => {
  const t = useT();
  const what = (
    <span className="flex min-w-0 flex-1 flex-col items-start gap-1 py-1.5">
      <span className="max-w-full min-w-0">
        <span className="font-medium">{row.name}</span>
        <span className="text-muted-foreground block truncate text-sm">
          {row.roles.map((role) => t(roleKey(role))).join(", ") || row.email}
          {row.pens > 0
            ? ` · ${t("people.pensHeld", { count: row.pens })}`
            : ""}
        </span>
      </span>
      <StandingBadge standing={row.standing} />
    </span>
  );
  return (
    <li className="flex items-center gap-3 py-1">
      {row.userId ? (
        <Link
          className="hover:bg-muted/50 flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg px-2"
          params={{ userId: row.userId }}
          to="/admin/people/$userId"
        >
          {what}
        </Link>
      ) : (
        <span className="flex min-h-11 min-w-0 flex-1 items-center gap-3 px-2">
          {what}
        </span>
      )}
      <WaitingAction row={row} {...waiting} />
    </li>
  );
};

/** A name in the table leads to their page, where the farm has one for them. */
interface PersonRow extends Listed, Waiting {}

const NameCell = ({ row }: { row: { original: PersonRow } }) => {
  const { userId, name } = row.original;
  if (!userId) {
    return <span className="font-medium">{name}</span>;
  }
  return (
    <Link
      className="font-medium underline-offset-4 hover:underline"
      params={{ userId }}
      to="/admin/people/$userId"
    >
      {name}
    </Link>
  );
};

const EmailCell = ({ row }: { row: { original: PersonRow } }) => (
  <span className="text-muted-foreground whitespace-nowrap">
    {row.original.email}
  </span>
);

const RolesCell = ({ row }: { row: { original: PersonRow } }) => {
  const t = useT();
  return row.original.roles.map((role) => t(roleKey(role))).join(", ") || "—";
};

/** Pens counted where somebody keeps some; an invitation keeps none until it is taken up. */
const PensCell = ({ row }: { row: { original: PersonRow } }) => {
  const { language } = useLanguage();
  return row.original.pens > 0
    ? formatNumber(row.original.pens, language)
    : "—";
};

const StandingCell = ({ row }: { row: { original: PersonRow } }) => (
  <StandingBadge standing={row.original.standing} />
);

const ActionCell = ({ row }: { row: { original: PersonRow } }) => {
  const { busy, onApprove, onNewCode } = row.original;
  return (
    <WaitingAction
      busy={busy}
      onApprove={onApprove}
      onNewCode={onNewCode}
      row={row.original}
    />
  );
};

/** Sorted by standing, whoever the farm is waiting on comes first, and those no longer here last. */
const STANDING_ORDER = {
  waitingForTheOwner: 0,
  waitingToSignUp: 1,
  visiting: 2,
  working: 3,
  gone: 4,
} as const;

const column = createListColumns<PersonRow>();
const personColumns = column.columns([
  column.accessor("name", {
    header: listHeader("people.name"),
    cell: NameCell,
    meta: { className: "min-w-40" },
  }),
  column.accessor("email", {
    header: listHeader("people.email"),
    cell: EmailCell,
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
    meta: { align: "end" },
  }),
]);

/** Everybody as a table where there is room: name, email, Roles, Pens and standing side by side, sortable. */
const PeopleTable = ({ rows, ...waiting }: Waiting & { rows: Listed[] }) => {
  const table = useListTable({
    columns: personColumns,
    data: rows.map((row) => ({ ...row, ...waiting })),
    getRowId: (row) => row.key,
  });
  return (
    <div className="hidden md:block">
      <DataTable minWidth="44rem" table={table} />
    </div>
  );
};

const PeoplePage = () => {
  const t = useT();
  const queryClient = useQueryClient();
  const me = useQuery(orpc.people.me.queryOptions());
  const list = useQuery(orpc.people.list.queryOptions());
  const isOwner = me.data?.roles.includes("owner") ?? false;
  const [looking, setLooking] = useState("");
  const [reissued, setReissued] = useState<{
    name: string;
    email: string;
    code: string;
  } | null>(null);
  const inFlight = useInFlight();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.people.list.key() });
  const onError = () => toast.error(t("common.error"));

  const approve = useMutation(
    orpc.people.approveInvite.mutationOptions({
      onMutate: ({ id }) => inFlight.start(`approve:${id}`),
      onSettled: (_data, _error, { id }) => inFlight.end(`approve:${id}`),
      onSuccess: async () => {
        toast.success(t("people.approved"));
        await refresh();
      },
      onError,
    })
  );
  const reissue = useMutation(
    orpc.people.reissueInviteCode.mutationOptions({
      onMutate: ({ id }) => inFlight.start(`code:${id}`),
      onSettled: (_data, _error, { id }) => inFlight.end(`code:${id}`),
      onSuccess: ({ code }, { id }) => {
        const waiting = list.data?.awaitingSignup.find((one) => one.id === id);
        setReissued({
          name: waiting?.name ?? "",
          email: waiting?.email ?? "",
          code,
        });
      },
      onError,
    })
  );

  const rows = useMemo((): Listed[] => {
    const people = (list.data?.people ?? []).map((person): Listed => ({
      key: person.id,
      userId: person.id,
      name: person.name,
      email: person.email,
      // A phone's own copy of an older answer may be missing either of these.
      roles: person.roles ?? [],
      pens: person.penIds?.length ?? 0,
      standing: standingOf(person),
    }));
    const pending = (list.data?.pendingInvites ?? []).map((one): Listed => ({
      key: one.id,
      userId: null,
      name: one.name,
      email: one.email,
      roles: one.roles ?? [],
      pens: 0,
      standing: { kind: "waitingForTheOwner", inviteId: one.id },
    }));
    const waiting = (list.data?.awaitingSignup ?? []).map((one): Listed => ({
      key: one.id,
      userId: null,
      name: one.name,
      email: one.email,
      roles: one.roles ?? [],
      pens: 0,
      standing: { kind: "waitingToSignUp", inviteId: one.id },
    }));
    // Whoever the farm is waiting on first: an invitation nobody has approved is somebody not working yet.
    return [...pending, ...waiting, ...people];
  }, [list.data]);

  const shown = matching(rows, looking);
  const handleApprove = (id: string) => approve.mutate({ id });
  const handleNewCode = (id: string) => reissue.mutate({ id });

  return (
    <Page width="default">
      <PageHeader title={t("people.title")} />
      {reissued ? <InviteCode {...reissued} /> : null}

      <Section title={t("people.everybody")}>
        <div className="relative mb-2">
          <Search
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
          />
          <Input
            aria-label={t("people.search")}
            className="ps-9"
            onChange={(event) => setLooking(event.target.value)}
            placeholder={t("people.search")}
            value={looking}
          />
        </div>
        <Loaded query={list}>
          {shown.length === 0 ? (
            <EmptyState
              bare
              icon={looking ? Search : MailCheck}
              title={looking ? t("people.noneFound") : t("people.noPending")}
            />
          ) : (
            <>
              <ul className="divide-border flex flex-col divide-y md:hidden">
                {shown.map((row) => (
                  <PersonLine
                    busy={inFlight.has}
                    key={row.key}
                    onApprove={handleApprove}
                    onNewCode={handleNewCode}
                    row={row}
                  />
                ))}
              </ul>
              <PeopleTable
                busy={inFlight.has}
                onApprove={handleApprove}
                onNewCode={handleNewCode}
                rows={shown}
              />
            </>
          )}
        </Loaded>
      </Section>

      <InviteForm onSent={refresh} ownerCanPickRoles={isOwner} />
    </Page>
  );
};

export const Route = createFileRoute("/_auth/admin/people/")({
  component: PeoplePage,
});
