import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button, buttonVariants } from "@OpenFarm/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@OpenFarm/ui/components/dialog";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CircleCheck, ClipboardPen, ListOrdered, Scale } from "lucide-react";
import { useState } from "react";

import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { SaidDate } from "@/components/list-cells";
import { EmptyState, Loaded, StatusBadge, TagChip } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

type Flagged = NonNullable<
  Awaited<ReturnType<typeof orpc.milk.flagged.call>>
>[number];

/** How many sessions the queue shows before the next page. */
const QUEUE_PAGE = 20;

const litresOf = (value: string | null) => (value === null ? 0 : Number(value));

const penOf = (session: Flagged) =>
  `${session.pen.shed.name} / ${session.pen.name}`;

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
    <ul className="max-h-[50vh] divide-y overflow-y-auto rounded-lg border text-sm">
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

/** A reading in litres, with the word beside it: the column's heading says what was read, not in what. */
const Litres = ({ value }: { value: string | null }) => {
  const { t, language } = useLanguage();
  return (
    <span className="whitespace-nowrap">
      {formatNumber(litresOf(value), language)} {t("dispatch.litres")}
    </span>
  );
};

/** How far the tank is from its cows, as a word with its colour. */
const Difference = ({ session }: { session: Flagged }) => {
  const { t, language } = useLanguage();
  return (
    <StatusBadge icon={Scale} tone="warning">
      {formatNumber(Math.abs(litresOf(session.differenceLitres)), language)}{" "}
      {t("dispatch.litres")}
    </StatusBadge>
  );
};

/** The way to the work where a figure is put right. */
const OpenWork = ({
  instanceId,
  variant = "ghost",
  size = "sm",
}: {
  instanceId: string;
  variant?: "ghost" | "default";
  size?: "sm" | "default";
}) => {
  const { t } = useLanguage();
  return (
    <Link
      className={buttonVariants({ size, variant })}
      params={{ instanceId }}
      to="/work/$instanceId"
    >
      <ClipboardPen aria-hidden data-icon="inline-start" />
      {t("mismatch.openWork")}
    </Link>
  );
};

/**
 * One session looked at closely, over the page: the tank beside the cows added up, and every cow's figure, with the
 * way to the work where the wrong one is put right.
 */
const SessionDialog = ({
  session,
  onOpenChange,
}: {
  session: Flagged | null;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t, language } = useLanguage();
  return (
    <Dialog onOpenChange={onOpenChange} open={session !== null}>
      <DialogContent className="sm:max-w-lg" closeLabel={t("common.close")}>
        {session ? (
          <div className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">
                {penOf(session)}
              </DialogTitle>
              <DialogDescription>
                {formatDate(new Date(session.dueAt), language, "dateTime")}
              </DialogDescription>
            </DialogHeader>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-muted/50 rounded-md px-3 py-2">
                <dt className="text-muted-foreground text-xs">
                  {t("mismatch.tank")}
                </dt>
                <dd className="font-semibold tabular-nums">
                  <Litres value={session.bulkLitres} />
                </dd>
              </div>
              <div className="bg-muted/50 rounded-md px-3 py-2">
                <dt className="text-muted-foreground text-xs">
                  {t("mismatch.cows")}
                </dt>
                <dd className="font-semibold tabular-nums">
                  <Litres value={session.sumBulkLitres} />
                </dd>
              </div>
            </dl>
            <CowsInSession instanceId={session.instanceId} />
            <DialogFooter>
              <OpenWork instanceId={session.instanceId} variant="default" />
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

interface MismatchRow extends Flagged {
  penName: string;
  handleLook: () => void;
}

/** A session's two ways on: its cows one by one, or the work where a figure is put right. Full size on a phone, where
 *  a thumb presses them. */
const MismatchActions = ({
  row,
  size = "sm",
}: {
  row: MismatchRow;
  size?: "sm" | "default";
}) => {
  const { t } = useLanguage();
  const { handleLook } = row;
  return (
    <div className="flex flex-wrap gap-1 md:justify-end">
      <Button onClick={handleLook} size={size} type="button" variant="outline">
        <ListOrdered aria-hidden data-icon="inline-start" />
        {t("mismatch.eachCow")}
      </Button>
      <OpenWork instanceId={row.instanceId} size={size} />
    </div>
  );
};

const PenCell = ({ row }: { row: { original: MismatchRow } }) => (
  <span className="font-medium whitespace-nowrap">{row.original.penName}</span>
);

const WhenCell = ({ row }: { row: { original: MismatchRow } }) => (
  <span className="whitespace-nowrap">
    <SaidDate at={row.original.dueAt} withTime />
  </span>
);

const TankCell = ({ row }: { row: { original: MismatchRow } }) => (
  <Litres value={row.original.bulkLitres} />
);

const CowsCell = ({ row }: { row: { original: MismatchRow } }) => (
  <Litres value={row.original.sumBulkLitres} />
);

const DifferenceCell = ({ row }: { row: { original: MismatchRow } }) => (
  <Difference session={row.original} />
);

const ActionsCell = ({ row }: { row: { original: MismatchRow } }) => (
  <MismatchActions row={row.original} />
);

const column = createListColumns<MismatchRow>();
const mismatchColumns = column.columns([
  column.accessor("penName", {
    header: listHeader("animals.pen"),
    cell: PenCell,
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

/** A session on a phone: the Pen and how far out it is on top, the tank beside the cows, when, and the two ways on. */
const MismatchCard = ({ row }: { row: MismatchRow }) => {
  const { t, language } = useLanguage();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{row.penName}</span>
        <Difference session={row} />
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div className="flex flex-col">
          <dt className="text-muted-foreground text-xs">
            {t("mismatch.tank")}
          </dt>
          <dd className="font-semibold tabular-nums">
            <Litres value={row.bulkLitres} />
          </dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-muted-foreground text-xs">
            {t("mismatch.cows")}
          </dt>
          <dd className="font-semibold tabular-nums">
            <Litres value={row.sumBulkLitres} />
          </dd>
        </div>
      </dl>
      <span className="text-muted-foreground text-xs">
        {formatDate(new Date(row.dueAt), language, "dateTime")}
      </span>
      <MismatchActions row={row} size="default" />
    </div>
  );
};

const mismatchCard = (row: MismatchRow) => <MismatchCard row={row} />;

/** The queue as a table where there is room and as cards on a phone, a session's cows opened over the page. */
const MismatchList = ({ sessions }: { sessions: Flagged[] }) => {
  const [looking, setLooking] = useState<Flagged | null>(null);
  const table = useListTable({
    columns: mismatchColumns,
    data: sessions.map((session) => ({
      ...session,
      penName: penOf(session),
      handleLook: () => setLooking(session),
    })),
    getRowId: (row) => row.id,
  });
  return (
    <>
      <DataTable
        card={mismatchCard}
        minWidth="56rem"
        pageSize={QUEUE_PAGE}
        table={table}
      />
      <SessionDialog
        onOpenChange={(open) => {
          if (!open) {
            setLooking(null);
          }
        }}
        session={looking}
      />
    </>
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
    <div className="bg-card flex flex-col gap-4 rounded-xl border p-4 md:p-5">
      <p className="text-muted-foreground border-b pb-4 text-sm">
        {t("mismatch.hint")}
      </p>
      <Loaded query={flagged}>
        {flagged.data?.length ? (
          <MismatchList sessions={flagged.data} />
        ) : (
          <EmptyState bare icon={CircleCheck} title={t("mismatch.none")} />
        )}
      </Loaded>
    </div>
  );
};
