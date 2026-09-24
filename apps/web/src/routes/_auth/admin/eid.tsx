import { formatDigits, formatNumber } from "@OpenFarm/i18n";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarCheck,
  CalendarClock,
  CalendarX,
  MoonStar,
  Pencil,
} from "lucide-react";
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
  AnnounceDialog,
  EidBasisBadge,
  eidDayWords,
  untilSaid,
} from "@/components/fattening/next-eid";
import {
  EmptyState,
  Page,
  PageHeader,
  Section,
  StatusBadge,
} from "@/components/page";
import { ConfirmDialog, RowMenu } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

type Eid = Awaited<ReturnType<typeof orpc.eid.list.call>>[number];

/** An Eid in the list, with its name and what may be done about it. */
interface EidRow extends Eid {
  name: string;
  handleAnnounce: () => void;
  handleWithdraw: () => void;
  handleBringAlong: () => void;
}

/** Whether it is the one the farm is feeding towards, or over. */
const WhenBadge = ({ row }: { row: EidRow }) => {
  const { t } = useLanguage();
  if (row.next) {
    return (
      <StatusBadge icon={MoonStar} tone="info">
        {t("eid.next")}
      </StatusBadge>
    );
  }
  return row.past ? (
    <StatusBadge tone="neutral">{t("eid.over")}</StatusBadge>
  ) : null;
};

/** What may be done about an Eid still ahead: write in or correct its day, take the day back, bring animals along. */
const EidMenu = ({ row }: { row: EidRow }) => {
  const { t } = useLanguage();
  if (row.past) {
    return null;
  }
  return (
    <RowMenu
      actions={[
        {
          label: t(row.announced ? "eid.correct" : "eid.announce"),
          icon: row.announced ? Pencil : CalendarCheck,
          handleSelect: row.handleAnnounce,
        },
        ...(row.behind.own > 0
          ? [
              {
                label: t("eid.bringAlong"),
                icon: CalendarClock,
                handleSelect: row.handleBringAlong,
              },
            ]
          : []),
        ...(row.announced
          ? [
              {
                label: t("eid.withdraw"),
                icon: CalendarX,
                handleSelect: row.handleWithdraw,
                destructive: true,
              },
            ]
          : []),
      ]}
      label={row.name}
    />
  );
};

const NameCell = ({ row }: { row: { original: EidRow } }) => (
  <div className="flex flex-wrap items-center gap-2">
    <span
      className={row.original.past ? "text-muted-foreground" : "font-medium"}
    >
      {row.original.name}
    </span>
    <WhenBadge row={row.original} />
  </div>
);

const DaysCell = ({ row }: { row: { original: EidRow } }) => {
  const { language } = useLanguage();
  const { window } = row.original;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span>
        {eidDayWords(window.start, language)} –{" "}
        {eidDayWords(window.end, language)}
      </span>
      <EidBasisBadge basis={window.basis} />
    </div>
  );
};

const ExpectedCell = ({ row }: { row: { original: EidRow } }) => {
  const { language } = useLanguage();
  return (
    <span className="text-muted-foreground">
      {eidDayWords(row.original.expectedDay, language)}
    </span>
  );
};

const WhenCell = ({ row }: { row: { original: EidRow } }) => {
  const { t, language } = useLanguage();
  return row.original.past ? (
    <span className="text-muted-foreground">{t("eid.over")}</span>
  ) : (
    <span>{untilSaid(row.original.window, { t, language })}</span>
  );
};

/** How many animals are fed towards it, and how many are still aimed at a day it is no longer on. */
const AnimalsCell = ({ row }: { row: { original: EidRow } }) => {
  const { t, language } = useLanguage();
  const { aimed, behind } = row.original;
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span>{formatNumber(aimed.own + aimed.inVentures, language)}</span>
      {aimed.inVentures > 0 ? (
        <span className="text-muted-foreground text-xs">
          {t("eid.aimedInVentures", {
            count: formatNumber(aimed.inVentures, language),
          })}
        </span>
      ) : null}
      {behind.own > 0 ? (
        <span className="text-warning text-xs">
          {t("eid.behind", { count: behind.own })}
        </span>
      ) : null}
    </div>
  );
};

const MenuCell = ({ row }: { row: { original: EidRow } }) => (
  <div className="flex justify-end">
    <EidMenu row={row.original} />
  </div>
);

const column = createListColumns<EidRow>();
const eidColumns = column.columns([
  column.accessor("expectedDay", {
    header: listHeader("eid.col.eid"),
    cell: NameCell,
  }),
  column.accessor((row) => row.window.start, {
    id: "days",
    header: listHeader("eid.col.days"),
    cell: DaysCell,
  }),
  column.accessor("expectedDay", {
    id: "expected",
    header: listHeader("eid.col.expected"),
    cell: ExpectedCell,
  }),
  column.display({
    id: "when",
    header: listHeader("eid.col.when"),
    cell: WhenCell,
  }),
  column.accessor((row) => row.aimed.own + row.aimed.inVentures, {
    id: "animals",
    header: listHeader("herd.col.animals"),
    cell: AnimalsCell,
    meta: { align: "end" },
  }),
  column.display({
    id: "menu",
    header: ActionsHeader,
    cell: MenuCell,
    meta: { align: "end" },
  }),
]);

/** An Eid on a phone: its name and days, how sure the farm is of them, how long to go, and its menu. */
const EidCard = ({ row }: { row: EidRow }) => (
  <div className="flex items-start justify-between gap-3">
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <NameCell row={{ original: row }} />
      <DaysCell row={{ original: row }} />
      <span className="text-muted-foreground text-sm">
        <WhenCell row={{ original: row }} />
      </span>
    </div>
    <EidMenu row={row} />
  </div>
);

const eidCard = (row: EidRow) => <EidCard row={row} />;

/**
 * Every Eid-ul-Adha the fattening side sells into, as the farm has it: the table's expected days, the day written in
 * for each once the moon sighting committee announces it, and past the table the calendar's guess. The Owner or the
 * Manager writes a day in, corrects it, or takes it back; the farm's own animals still aimed at an earlier day are
 * brought along as their own act. A Venture's animals move only by an Amendment.
 */
const EidPage = () => {
  const { t, language } = useLanguage();
  const refused = useRefused();
  const eids = useQuery(orpc.eid.list.queryOptions());
  const [announcing, setAnnouncing] = useState<Eid | null>(null);
  const [withdrawing, setWithdrawing] = useState<{
    expectedDay: string;
    name: string;
  } | null>(null);
  const withdraw = useMutation(
    orpc.eid.withdraw.mutationOptions({
      onSuccess: () => {
        toast.success(t("eid.withdrawn"));
        setWithdrawing(null);
      },
      onError: refused,
    })
  );
  const bringAlong = useMutation(
    orpc.eid.bringAlong.mutationOptions({
      onSuccess: (done) => {
        toast.success(
          t("eid.broughtAlong", { count: formatNumber(done.moved, language) })
        );
      },
      onError: refused,
    })
  );
  const table = useListTable({
    columns: eidColumns,
    data: (eids.data ?? []).map((one) => {
      const name = t("eid.of", {
        year: formatDigits(Number(one.window.start.slice(0, 4)), language),
      });
      return {
        ...one,
        name,
        handleAnnounce: () => setAnnouncing(one),
        handleWithdraw: () =>
          setWithdrawing({ expectedDay: one.expectedDay, name }),
        handleBringAlong: () =>
          bringAlong.mutate({ expectedDay: one.expectedDay }),
      };
    }),
    getRowId: (row) => row.expectedDay,
  });

  return (
    <Page>
      <PageHeader description={t("eid.listSubtitle")} title={t("nav.eid")} />

      <Section>
        {eids.data === undefined ? (
          <Skeleton className="h-40 rounded-lg" />
        ) : null}
        {eids.data?.length === 0 ? (
          <EmptyState bare icon={MoonStar} title={t("eid.none")} />
        ) : null}
        {eids.data?.length ? (
          <DataTable card={eidCard} minWidth="52rem" table={table} />
        ) : null}
      </Section>

      {announcing ? (
        <AnnounceDialog
          key={announcing.expectedDay}
          onOpenChange={(open) => {
            if (!open) {
              setAnnouncing(null);
            }
          }}
          open
          startFrom={announcing.window.start}
        />
      ) : null}
      <ConfirmDialog
        confirmLabel={t("eid.withdraw")}
        description={t("eid.withdrawWhy")}
        onConfirm={() => {
          if (withdrawing) {
            withdraw.mutate({ expectedDay: withdrawing.expectedDay });
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setWithdrawing(null);
          }
        }}
        open={withdrawing !== null}
        pending={withdraw.isPending}
        title={t("eid.withdrawTitle", { eid: withdrawing?.name ?? "" })}
      />
    </Page>
  );
};

export const Route = createFileRoute("/_auth/admin/eid")({
  component: EidPage,
});
