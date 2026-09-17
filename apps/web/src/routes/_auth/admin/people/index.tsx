import type { RoleName } from "@OpenFarm/api/roles";
import { ROLES } from "@OpenFarm/api/roles";
import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarClock,
  Hourglass,
  MailCheck,
  Search,
  UserPlus,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState, Loaded, Page, PageHeader } from "@/components/page";
import type { Figure } from "@/components/page-kit";
import { FilterBar, NativeSelect, SummaryFigures } from "@/components/page-kit";
import type { HandOver } from "@/components/people/invite-sheet";
import { InviteSheet } from "@/components/people/invite-sheet";
import { OneTimeCode } from "@/components/people/one-time-code";
import { PeopleTable } from "@/components/people/people-table";
import type {
  Listed,
  PeopleFilter,
  StandingKind,
} from "@/components/people/people-types";
import {
  STANDING_ORDER,
  STANDING_WORD,
  listedFrom,
  matching,
} from "@/components/people/people-types";
import { roleKey } from "@/components/role-choice";
import { useLanguage } from "@/i18n/language-provider";
import { useInFlight } from "@/lib/in-flight";
import { orpc } from "@/utils/orpc";

/** How many on the list stand one way. */
const countOf = (rows: Listed[], kind: StandingKind) =>
  rows.filter((row) => row.standing.kind === kind).length;

/** The four figures the list is read by: who works here, whose invitation waits for the Owner, who has still to sign
 *  up, and the vets here on a visit. */
const usePeopleFigures = (rows: Listed[]): Figure[] => {
  const { t, language } = useLanguage();
  const waiting = countOf(rows, "waitingForTheOwner");
  return [
    {
      label: t("people.standing.working"),
      value: formatNumber(countOf(rows, "working"), language),
      icon: Users,
    },
    {
      label: t("people.kpi.toApprove"),
      value: formatNumber(waiting, language),
      icon: UserRoundCheck,
      tone: waiting > 0 ? "warning" : "neutral",
    },
    {
      label: t("people.standing.waitingToSignUp"),
      value: formatNumber(countOf(rows, "waitingToSignUp"), language),
      icon: Hourglass,
    },
    {
      label: t("role.visitingVet"),
      value: formatNumber(countOf(rows, "visiting"), language),
      icon: CalendarClock,
    },
  ];
};

/** A standing as the filter names it: a visit has no day to name here. */
const standingChoice = (kind: StandingKind) =>
  kind === "visiting" ? "role.visitingVet" : STANDING_WORD[kind];

const STANDINGS = Object.keys(STANDING_ORDER) as StandingKind[];

/** The search, and the Role and standing the list is narrowed to. */
const PeopleFilters = ({
  filter,
  onChange,
}: {
  filter: PeopleFilter;
  onChange: (filter: PeopleFilter) => void;
}) => {
  const { t } = useLanguage();
  return (
    <FilterBar>
      <div className="relative sm:min-w-64 sm:flex-1">
        <Search
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
        />
        <Input
          aria-label={t("people.search")}
          className="ps-9"
          onChange={(event) =>
            onChange({ ...filter, looking: event.target.value })
          }
          placeholder={t("people.search")}
          type="search"
          value={filter.looking}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:flex">
        <NativeSelect
          aria-label={t("people.roles")}
          className="sm:w-44"
          onChange={(event) =>
            onChange({ ...filter, role: event.target.value as RoleName | "" })
          }
          value={filter.role}
        >
          <option value="">{t("people.filter.anyRole")}</option>
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {t(roleKey(role))}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label={t("people.status")}
          className="sm:w-56"
          onChange={(event) =>
            onChange({
              ...filter,
              standing: event.target.value as StandingKind | "",
            })
          }
          value={filter.standing}
        >
          <option value="">{t("people.filter.anyStatus")}</option>
          {STANDINGS.map((kind) => (
            <option key={kind} value={kind}>
              {t(standingChoice(kind), { date: "" })}
            </option>
          ))}
        </NativeSelect>
      </div>
    </FilterBar>
  );
};

const NOBODY_FILTERED: PeopleFilter = { looking: "", role: "", standing: "" };

/**
 * Everybody the farm has a name for, by what somebody came to do: find a person and open their page, approve an
 * invitation that waits for the Owner, hand a new code to somebody who has still to sign up — or invite somebody new,
 * one button away. A code the farm gives out is shown once, in a dialog that stays until it has been handed over.
 */
const PeoplePage = () => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const me = useQuery(orpc.people.me.queryOptions());
  const list = useQuery(orpc.people.list.queryOptions());
  const isOwner = me.data?.roles.includes("owner") ?? false;
  const [filter, setFilter] = useState(NOBODY_FILTERED);
  const [inviting, setInviting] = useState(false);
  const [handOver, setHandOver] = useState<HandOver | null>(null);
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
        setHandOver({
          name: waiting?.name ?? "",
          email: waiting?.email ?? "",
          code,
        });
      },
      onError,
    })
  );

  const rows = useMemo(() => listedFrom(list.data), [list.data]);
  const shown = matching(rows, filter);
  const figures = usePeopleFigures(rows);
  const filtered =
    filter.looking.trim() !== "" ||
    filter.role !== "" ||
    filter.standing !== "";

  return (
    <Page width="default">
      <PageHeader
        actions={
          <Button onClick={() => setInviting(true)} type="button">
            <UserPlus aria-hidden data-icon="inline-start" />
            {t("people.invite")}
          </Button>
        }
        description={t("people.subtitle")}
        title={t("people.title")}
      />

      <Loaded query={list}>
        <SummaryFigures figures={figures} />
      </Loaded>

      <div className="bg-card flex flex-col gap-4 rounded-xl border p-4 md:p-5">
        <PeopleFilters filter={filter} onChange={setFilter} />
        <Loaded query={list}>
          {shown.length === 0 ? (
            <EmptyState
              action={
                filtered ? (
                  <Button
                    onClick={() => setFilter(NOBODY_FILTERED)}
                    type="button"
                    variant="outline"
                  >
                    {t("people.filter.clear")}
                  </Button>
                ) : null
              }
              bare
              icon={filtered ? Search : MailCheck}
              title={filtered ? t("people.noneFound") : t("people.noPending")}
            />
          ) : (
            <PeopleTable
              actions={{
                busy: inFlight.has,
                handleApprove: (id) => approve.mutate({ id }),
                handleNewCode: (id) => reissue.mutate({ id }),
                mayApprove: isOwner,
              }}
              rows={shown}
            />
          )}
        </Loaded>
      </div>

      <InviteSheet
        onOpenChange={setInviting}
        onSent={(given) => {
          setHandOver(given);
          void refresh();
        }}
        open={inviting}
        ownerCanPickRoles={isOwner}
      />
      <OneTimeCode
        code={handOver?.code ?? null}
        description={
          handOver ? t("people.handOverHow", { email: handOver.email }) : null
        }
        onDone={() => setHandOver(null)}
        title={
          handOver ? t("people.handOverTitle", { name: handOver.name }) : ""
        }
      />
    </Page>
  );
};

export const Route = createFileRoute("/_auth/admin/people/")({
  component: PeoplePage,
});
