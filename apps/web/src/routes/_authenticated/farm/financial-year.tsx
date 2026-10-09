import { monthsEndingIn, startOfFarmDay } from "@OpenFarm/domain";
import { formatDate, formatDigits } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@OpenFarm/ui/components/table";
import { Textarea } from "@OpenFarm/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarRange, Undo2 } from "lucide-react";
import { useState } from "react";

import { COLUMN_HEADING } from "@/components/data-table";
import { useIsOwner } from "@/components/money";
import {
  EmptyState,
  Loaded,
  Page,
  PageHeader,
  Section,
  StatusBadge,
  TableSkeleton,
} from "@/components/page";
import {
  FormDialog,
  FormField,
  FormSheet,
  NativeSelect,
} from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";
import { financialYearName, saidMonth } from "@/lib/months";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

type Years = Awaited<ReturnType<typeof orpc.financialYears.list.call>>;
type Year = Years["current"];
type Change = Years["changes"][number];

/** The refusals a change or its withdrawal meets, in the farm's words. */
const REFUSALS = {
  year_change_not_a_year: "years.refused.notAYear",
  year_change_changes_nothing: "years.refused.changesNothing",
  year_change_too_long: "years.refused.tooLong",
  year_change_reaches_an_ended_year: "years.refused.endedYear",
  year_change_not_the_last: "years.refused.notTheLast",
} as const;

const MONTHS_A_YEAR = 12;

/** How many months run from one "YYYY-MM" month up to, not including, another. */
const monthsBetween = (from: string, until: string): number =>
  (Number(until.slice(0, 4)) - Number(from.slice(0, 4))) * MONTHS_A_YEAR +
  Number(until.slice(5, 7)) -
  Number(from.slice(5, 7));

/** The month before a "YYYY-MM" month. */
const monthBefore = (month: string): string =>
  monthsEndingIn(`${month}-01`, 2)[0] ?? month;

/** The year a change makes of the year it changes: from its first month to the month before the new years begin. */
const transitionOf = (change: { changingFrom: string; newFrom: string }) => ({
  start: change.changingFrom,
  last: monthBefore(change.newFrom),
  months: monthsBetween(change.changingFrom, change.newFrom),
});

/** Whether a year is last year, this year, or a Transition Year, as badges beside its name. */
const YearBadges = ({ year, years }: { year: Year; years: Years }) => {
  const { t } = useLanguage();
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {year.start === years.current.start ? (
        <StatusBadge tone="info">{t("years.thisYear")}</StatusBadge>
      ) : null}
      {year.start === years.previous.start ? (
        <StatusBadge tone="neutral">{t("years.lastYear")}</StatusBadge>
      ) : null}
      {year.months === MONTHS_A_YEAR ? null : (
        <StatusBadge tone="warning">{t("years.transition")}</StatusBadge>
      )}
    </span>
  );
};

/** Last year, this year and the next few: each named, the months it runs, and how many. */
const YearsTable = ({ years }: { years: Years }) => {
  const { t, language } = useLanguage();
  const rows = [years.previous, ...years.ahead];
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className={COLUMN_HEADING}>
            {t("years.col.year")}
          </TableHead>
          <TableHead className={COLUMN_HEADING}>
            {t("years.col.runs")}
          </TableHead>
          <TableHead className={`${COLUMN_HEADING} text-right`}>
            {t("years.col.months")}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {/* Each cell from its top, as the app's lists read: the first cell runs to a second line. */}
        {rows.map((year) => (
          <TableRow className="[&>td]:align-top" key={year.start}>
            <TableCell className="whitespace-normal">
              <span className="flex flex-col gap-1">
                <span className="font-medium">
                  {financialYearName(year, t, language)}
                </span>
                <YearBadges year={year} years={years} />
              </span>
            </TableCell>
            <TableCell>
              {t("years.runs", {
                from: saidMonth(year.start, language),
                to: saidMonth(year.last, language),
              })}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatDigits(year.months, language)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

/** One change: what it makes of the year, why, who recorded it, and whether it stands or was withdrawn. */
const ChangeItem = ({
  change,
  onWithdraw,
}: {
  change: Change;
  onWithdraw: (() => void) | null;
}) => {
  const { t, language } = useLanguage();
  const year = transitionOf(change);
  const { withdrawn } = change;
  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          {withdrawn ? (
            <StatusBadge tone="neutral">
              {t("years.withdrawnBadge")}
            </StatusBadge>
          ) : (
            <StatusBadge tone="success">{t("years.inForce")}</StatusBadge>
          )}
        </span>
        <span className={withdrawn ? "text-muted-foreground" : "font-medium"}>
          {t("years.changeSaid", {
            name: financialYearName(year, t, language),
            from: saidMonth(year.start, language),
            to: saidMonth(year.last, language),
            newFrom: saidMonth(change.newFrom, language),
          })}
        </span>
        <span className="text-sm">{change.reason}</span>
        <span className="text-muted-foreground text-xs">
          {t("years.recordedBy", {
            name: change.recordedBy ?? "—",
            date: formatDate(change.recordedAt, language, "date"),
          })}
        </span>
        {withdrawn ? (
          <span className="text-muted-foreground text-xs">
            {t("years.withdrawnBy", {
              name: withdrawn.by ?? "—",
              date: formatDate(withdrawn.at, language, "date"),
              reason: withdrawn.reason ?? "",
            })}
          </span>
        ) : null}
      </div>
      {onWithdraw ? (
        <Button
          className="shrink-0"
          onClick={onWithdraw}
          type="button"
          variant="outline"
        >
          <Undo2 aria-hidden data-icon="inline-start" />
          {t("years.withdraw")}
        </Button>
      ) : null}
    </li>
  );
};

/**
 * Recording a change: the year that changes, picked from this one and the next few; the month the next year begins
 * in; and why. What the changed year will run is said as it is picked, so a nine-month year is seen before it is
 * recorded.
 */
const RecordSheet = ({
  years,
  open,
  onOpenChange,
}: {
  years: Years;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t, language } = useLanguage();
  const refused = useRefused(REFUSALS);
  const [changingFrom, setChangingFrom] = useState("");
  const [newFrom, setNewFrom] = useState("");
  const [reason, setReason] = useState("");
  const reset = () => {
    setChangingFrom("");
    setNewFrom("");
    setReason("");
  };
  const record = useMutation(
    orpc.financialYears.recordChange.mutationOptions({
      onSuccess: () => {
        toast.success(t("years.recorded"));
        reset();
        onOpenChange(false);
      },
      onError: refused,
    })
  );
  const both = changingFrom !== "" && newFrom !== "";
  const year = both ? transitionOf({ changingFrom, newFrom }) : null;
  const sensible = year !== null && year.months > 0;
  return (
    <FormSheet
      description={t("years.recordWhy")}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        record.mutate({ changingFrom, newFrom, reason: reason.trim() })
      }
      open={open}
      pending={record.isPending}
      ready={both && reason.trim() !== ""}
      submitLabel={t("years.save")}
      title={t("years.record")}
    >
      <FormField id="year-changing" label={t("years.changingFrom")}>
        <NativeSelect
          id="year-changing"
          onChange={(event) => setChangingFrom(event.target.value)}
          required
          value={changingFrom}
        >
          <option value="">—</option>
          {years.ahead.map((one) => (
            <option key={one.start} value={one.start}>
              {`${financialYearName(one, t, language)} · ${t("years.runs", {
                from: saidMonth(one.start, language),
                to: saidMonth(one.last, language),
              })}`}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField id="year-new" label={t("years.newFrom")}>
        <Input
          id="year-new"
          onChange={(event) => setNewFrom(event.target.value)}
          required
          type="month"
          value={newFrom}
        />
      </FormField>
      {year && sensible ? (
        <p className="text-sm font-medium">
          {t("years.preview", {
            name: financialYearName(year, t, language),
            from: saidMonth(year.start, language),
            to: saidMonth(year.last, language),
          })}
        </p>
      ) : null}
      <FormField
        hint={t("years.reasonHint")}
        id="year-reason"
        label={t("years.reason")}
      >
        <Textarea
          id="year-reason"
          onChange={(event) => setReason(event.target.value)}
          required
          value={reason}
        />
      </FormField>
    </FormSheet>
  );
};

/** Withdrawing the latest change, with why. */
const WithdrawDialog = ({
  change,
  onOpenChange,
}: {
  change: Change | null;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const refused = useRefused(REFUSALS);
  const [reason, setReason] = useState("");
  const withdraw = useMutation(
    orpc.financialYears.withdrawChange.mutationOptions({
      onSuccess: () => {
        toast.success(t("years.withdrawn"));
        setReason("");
        onOpenChange(false);
      },
      onError: refused,
    })
  );
  return (
    <FormDialog
      description={t("years.withdrawWhy")}
      onOpenChange={onOpenChange}
      onSubmit={() => {
        if (change) {
          withdraw.mutate({ changeId: change.id, reason: reason.trim() });
        }
      }}
      open={change !== null}
      pending={withdraw.isPending}
      ready={reason.trim() !== ""}
      submitLabel={t("years.withdraw")}
      title={t("years.withdrawTitle")}
    >
      <FormField id="year-withdraw-reason" label={t("years.reason")}>
        <Textarea
          id="year-withdraw-reason"
          onChange={(event) => setReason(event.target.value)}
          required
          value={reason}
        />
      </FormField>
    </FormDialog>
  );
};

/**
 * The farm's Financial Year (ADR 0016, 0017): the years its books are kept by — last year, this one and the next few,
 * each with its months — and every change of them, with why. The Owner records a change when the law moves the year,
 * as Bangladesh's July–June moves to April–March with a nine-month 2027–28, and withdraws the latest while its years
 * have not ended. Managers read it.
 */
const FinancialYearPage = () => {
  const { t, language } = useLanguage();
  const owner = useIsOwner();
  const years = useQuery(orpc.financialYears.list.queryOptions());
  const [recording, setRecording] = useState(false);
  const [withdrawing, setWithdrawing] = useState<Change | null>(null);
  const data = years.data ?? null;
  const firstMonth = data
    ? formatDate(
        startOfFarmDay(`2000-${String(data.firstStarts).padStart(2, "0")}-01`),
        language,
        "month"
      )
    : "";
  return (
    <Page>
      <PageHeader
        actions={
          owner && data ? (
            <Button onClick={() => setRecording(true)} type="button">
              <CalendarRange aria-hidden data-icon="inline-start" />
              {t("years.record")}
            </Button>
          ) : null
        }
        description={t("years.pageWhy")}
        eyebrow={t("nav.identity")}
        title={t("settings.section.years")}
      />
      <Section description={t("years.yearsHint")} title={t("years.yearsTitle")}>
        <Loaded query={years} skeleton={<TableSkeleton />}>
          {data ? (
            <div className="flex flex-col gap-3">
              <YearsTable years={data} />
              <p className="text-muted-foreground text-xs">
                {t("years.firstStarts", { month: firstMonth })}
              </p>
            </div>
          ) : null}
        </Loaded>
      </Section>
      <Section
        description={t("years.changesHint")}
        title={t("years.changesTitle")}
      >
        <Loaded query={years}>
          {data?.changes.length === 0 ? (
            <EmptyState
              bare
              icon={CalendarRange}
              title={t("years.noChanges")}
            />
          ) : (
            <ul className="divide-y">
              {data?.changes.map((change) => (
                <ChangeItem
                  change={change}
                  key={change.id}
                  onWithdraw={
                    owner && change.withdrawable
                      ? () => setWithdrawing(change)
                      : null
                  }
                />
              ))}
            </ul>
          )}
        </Loaded>
      </Section>
      {data ? (
        <RecordSheet
          onOpenChange={setRecording}
          open={recording}
          years={data}
        />
      ) : null}
      <WithdrawDialog
        change={withdrawing}
        onOpenChange={(open) => {
          if (!open) {
            setWithdrawing(null);
          }
        }}
      />
    </Page>
  );
};

export const Route = createFileRoute("/_authenticated/farm/financial-year")({
  /** For those who run the farm: the Owner and the Farm Managers. The changes are the Owner's to record. */
  beforeLoad: onlyFor("runsTheFarm"),
  component: FinancialYearPage,
});
