import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronDown, CircleCheck, MapPin, Scale } from "lucide-react";
import { useState } from "react";

import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { EmptyState, Section, StatusBadge, TagChip } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

type Flagged = NonNullable<
  Awaited<ReturnType<typeof orpc.milk.flagged.call>>
>[number];

const litresOf = (value: string | null) => (value === null ? 0 : Number(value));

/** Each cow's milking in a session whose tank did not match, so the Manager can see which figure looks wrong. */
const CowsInSession = ({ instanceId }: { instanceId: string }) => {
  const { t, language } = useLanguage();
  const session = useQuery(
    orpc.milk.session.queryOptions({ input: { instanceId } })
  );
  if (!session.data) {
    return <Skeleton className="h-20 rounded-lg" />;
  }
  return (
    <ul className="divide-y rounded-lg border text-sm">
      {session.data.records.map((record) => (
        <li
          className="flex items-center justify-between gap-3 px-3 py-2"
          key={record.id}
        >
          <TagChip>{record.animal.tagNumber}</TagChip>
          <span className="text-muted-foreground">
            {t(`milk.${record.destination}` as "milk.bulk")}
          </span>
          <span className="font-medium tabular-nums">
            {formatNumber(litresOf(record.litres), language)}{" "}
            {t("dispatch.litres")}
          </span>
        </li>
      ))}
    </ul>
  );
};

/** The two ways on from a session that did not match: its cows one by one, or the work where a figure is put right. */
const MismatchActions = ({
  instanceId,
  open,
  onToggle,
}: {
  instanceId: string;
  open: boolean;
  onToggle: () => void;
}) => {
  const { t } = useLanguage();
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        aria-expanded={open}
        onClick={onToggle}
        size="sm"
        variant="outline"
      >
        <ChevronDown aria-hidden className={open ? "rotate-180" : undefined} />
        {t("mismatch.eachCow")}
      </Button>
      <Button
        nativeButton={false}
        render={<Link params={{ instanceId }} to="/work/$instanceId" />}
        size="sm"
        variant="ghost"
      >
        {t("mismatch.openWork")}
      </Button>
    </div>
  );
};

const Mismatch = ({ session }: { session: Flagged }) => {
  const { t, language } = useLanguage();
  const [open, setOpen] = useState(false);
  const litres = (value: string | null) =>
    `${formatNumber(litresOf(value), language)} ${t("dispatch.litres")}`;
  const difference = Math.abs(litresOf(session.differenceLitres));

  return (
    <li className="flex flex-col gap-3 rounded-lg border p-3 md:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="inline-flex items-center gap-1.5 font-medium">
            <MapPin aria-hidden className="text-muted-foreground size-4" />
            {session.pen.shed.name} / {session.pen.name}
          </p>
          <p className="text-muted-foreground text-sm">
            {formatDate(new Date(session.dueAt), language, "dateTime")}
          </p>
        </div>
        <StatusBadge icon={Scale} tone="warning">
          {t("milk.difference", { litres: formatNumber(difference, language) })}
        </StatusBadge>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div className="bg-muted/40 rounded-md px-3 py-2">
          <dt className="text-muted-foreground text-xs">
            {t("mismatch.tank")}
          </dt>
          <dd className="font-semibold tabular-nums">
            {litres(session.bulkLitres)}
          </dd>
        </div>
        <div className="bg-muted/40 rounded-md px-3 py-2">
          <dt className="text-muted-foreground text-xs">
            {t("mismatch.cows")}
          </dt>
          <dd className="font-semibold tabular-nums">
            {litres(session.sumBulkLitres)}
          </dd>
        </div>
      </dl>
      <MismatchActions
        instanceId={session.instanceId}
        onToggle={() => setOpen((shown) => !shown)}
        open={open}
      />
      {open ? <CowsInSession instanceId={session.instanceId} /> : null}
    </li>
  );
};

interface MismatchRow extends Flagged {
  penName: string;
  open: boolean;
  handleToggle: () => void;
}

const WhenCell = ({ row }: { row: { original: MismatchRow } }) => {
  const { language } = useLanguage();
  return (
    <span className="whitespace-nowrap">
      {formatDate(new Date(row.original.dueAt), language, "dateTime")}
    </span>
  );
};

/** A reading in litres, with the word beside it: the column's heading says what was read, not in what. */
const Litres = ({ value }: { value: string | null }) => {
  const { t, language } = useLanguage();
  return (
    <span className="whitespace-nowrap">
      {formatNumber(litresOf(value), language)} {t("dispatch.litres")}
    </span>
  );
};

const TankCell = ({ row }: { row: { original: MismatchRow } }) => (
  <Litres value={row.original.bulkLitres} />
);

const CowsCell = ({ row }: { row: { original: MismatchRow } }) => (
  <Litres value={row.original.sumBulkLitres} />
);

const DifferenceCell = ({ row }: { row: { original: MismatchRow } }) => {
  const { t, language } = useLanguage();
  return (
    <StatusBadge icon={Scale} tone="warning">
      {formatNumber(
        Math.abs(litresOf(row.original.differenceLitres)),
        language
      )}{" "}
      {t("dispatch.litres")}
    </StatusBadge>
  );
};

const ActionsCell = ({ row }: { row: { original: MismatchRow } }) => (
  <div className="flex justify-end">
    <MismatchActions
      instanceId={row.original.instanceId}
      onToggle={row.original.handleToggle}
      open={row.original.open}
    />
  </div>
);

const column = createListColumns<MismatchRow>();
const mismatchColumns = column.columns([
  column.accessor("penName", {
    header: listHeader("animals.pen"),
    meta: { className: "whitespace-nowrap" },
  }),
  column.accessor((session) => new Date(session.dueAt).getTime(), {
    id: "dueAt",
    header: listHeader("audit.when"),
    cell: WhenCell,
  }),
  column.accessor((session) => litresOf(session.bulkLitres), {
    id: "tank",
    header: listHeader("mismatch.tank"),
    cell: TankCell,
    meta: { align: "end" },
  }),
  column.accessor((session) => litresOf(session.sumBulkLitres), {
    id: "cows",
    header: listHeader("mismatch.cows"),
    cell: CowsCell,
    meta: { align: "end" },
  }),
  column.accessor((session) => Math.abs(litresOf(session.differenceLitres)), {
    id: "difference",
    header: listHeader("mismatch.col.difference"),
    cell: DifferenceCell,
    meta: { align: "end" },
  }),
  column.display({
    id: "actions",
    header: ActionsHeader,
    cell: ActionsCell,
    meta: { align: "end" },
  }),
]);

/**
 * The same sessions as a table where there is room, the Pen, the time and the three figures side by side. A table
 * row has nowhere to open under itself, so a session's cows open beneath the table, named by Pen and time.
 */
const MismatchTable = ({ sessions }: { sessions: Flagged[] }) => {
  const { language } = useLanguage();
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (id: string) =>
    setOpen((shown) => {
      const next = new Set(shown);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  const table = useListTable({
    columns: mismatchColumns,
    data: sessions.map((session) => ({
      ...session,
      penName: `${session.pen.shed.name} / ${session.pen.name}`,
      open: open.has(session.id),
      handleToggle: () => toggle(session.id),
    })),
    getRowId: (row) => row.id,
  });
  const opened = sessions.filter((session) => open.has(session.id));
  return (
    <div className="hidden flex-col gap-4 md:flex">
      <DataTable minWidth="48rem" table={table} />
      {opened.map((session) => (
        <div className="flex flex-col gap-2" key={session.id}>
          <p className="inline-flex items-center gap-1.5 text-sm font-medium">
            <MapPin aria-hidden className="text-muted-foreground size-4" />
            {session.pen.shed.name} / {session.pen.name}
            <span className="text-muted-foreground font-normal">
              {formatDate(new Date(session.dueAt), language, "dateTime")}
            </span>
          </p>
          <CowsInSession instanceId={session.instanceId} />
        </div>
      ))}
    </div>
  );
};

/**
 * The Manager's queue of milkings whose tank reading did not match what the cows were recorded giving. A figure put
 * right on the work takes the session off this list by itself.
 */
export const MilkMismatches = () => {
  const { t } = useLanguage();
  const flagged = useQuery(orpc.milk.flagged.queryOptions());
  return (
    <Section description={t("mismatch.hint")} title={t("mismatch.title")}>
      {flagged.data ? null : <Skeleton className="h-24 rounded-lg" />}
      {flagged.data?.length === 0 ? (
        <EmptyState bare icon={CircleCheck} title={t("mismatch.none")} />
      ) : null}
      {flagged.data?.length ? (
        <>
          <ul className="grid gap-3 md:hidden">
            {flagged.data.map((session) => (
              <Mismatch key={session.id} session={session} />
            ))}
          </ul>
          <MismatchTable sessions={flagged.data} />
        </>
      ) : null}
    </Section>
  );
};
