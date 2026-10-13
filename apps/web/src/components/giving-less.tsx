import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Stethoscope, TrendingDown } from "lucide-react";
import { createContext, useContext } from "react";

import {
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { Opens, QueueGroup, QueueRow } from "@/components/home/queue";
import { Nothing } from "@/components/list-cells";
import { Section, TagChip } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import {
  keptOnThePhone,
  queueObservation,
  sendOrKeep,
} from "@/lib/record-offline";
import { useRefused } from "@/lib/refused";
import type { SeenTo } from "@/lib/seen-to";
import { seenToSaid } from "@/lib/seen-to";
import { toast } from "@/lib/toast";
import { client } from "@/utils/orpc";
import type { orpc } from "@/utils/orpc";

/** The Observation word that puts a cow giving less in front of the Vet. */
const GIVING_LESS = "giving_less";

/** Whether whoever reads the list may put a cow in front of the Vet: the Manager and the Owner, never the Vet. */
const MayAskTheVet = createContext(false);

/** What has been done about her, from an answer that may have been kept on a phone from before it said. */
const seenOf = (row: { seenTo?: SeenTo | null }) => seenToSaid(row.seenTo);

/** What has been done about a cow giving less, said: the Vet saw her, or the Vet was asked, and when. */
const SeenToWords = ({ row }: { row: { seenTo?: SeenTo | null } }) => {
  const { t, language } = useLanguage();
  const said = seenOf(row);
  if (!said) {
    return null;
  }
  return (
    <span className="text-muted-foreground text-sm">
      {t(said.key, { day: formatDate(said.at, language, "date") })}
    </span>
  );
};

/**
 * Put her in front of the Vet: an Observation, "giving less milk", which reaches the Vet's inbox as any sighting does —
 * sent now when the farm answers, kept on the phone when it does not.
 */
const AskTheVet = ({ tag }: { tag: string }) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const queryClient = useQueryClient();
  const ask = useMutation({
    ...keptOnThePhone,
    mutationFn: () => {
      const input = { tagNumber: tag, saw: GIVING_LESS };
      return sendOrKeep({
        online: navigator.onLine,
        send: () => client.observations.record(input),
        keep: () => queueObservation(input),
      });
    },
    onSuccess: async (how) => {
      toast.success(
        t(how === "sent" ? "givingLess.asked" : "givingLess.queued")
      );
      await queryClient.invalidateQueries();
    },
    onError: refused,
  });
  return (
    <Button
      disabled={ask.isPending}
      onClick={() => ask.mutate()}
      size="sm"
      type="button"
      variant="outline"
    >
      <Stethoscope aria-hidden data-icon="inline-start" />
      {t("givingLess.askVet")}
    </Button>
  );
};

/** A cow giving well under her own week, as the Manager's queue and the Milk page are told it. */
export type GivingLessRows = Awaited<
  ReturnType<typeof orpc.milk.givingLess.call>
>;

/**
 * Cows in milk giving well under their own week, the furthest under first: liters a milking lately and usually, how far
 * under, and how long she has been in milk, each opening her page. A sudden drop is often the first sign of mastitis,
 * milk fever or ketosis — and a heat drops milk too.
 */
export const GivingLessGroup = ({
  rows,
  headless = false,
}: {
  /** Missing from an answer a phone kept from before the list. */
  rows: GivingLessRows | undefined;
  headless?: boolean;
}) => {
  const { t, language } = useLanguage();
  const items = (rows ?? []).map((row) => (
    <QueueRow
      key={row.animalId}
      meta={
        <>
          {t("givingLess.line", {
            lately: formatNumber(row.lately, language),
            usually: formatNumber(row.usually, language),
            drop: row.dropPercent,
            pen: row.penName,
          })}{" "}
          <SeenToWords row={row} />
        </>
      }
      title={
        <Link
          className="after:absolute after:inset-0 hover:underline"
          params={{ tagNumber: row.tag }}
          to="/animals/$tagNumber"
        >
          {row.tag}
        </Link>
      }
      trailing={<Opens />}
    />
  ));
  if (items.length === 0) {
    return null;
  }
  return (
    <QueueGroup
      headless={headless}
      icon={TrendingDown}
      label={t("givingLess.title")}
      rows={items}
      tone="warning"
    />
  );
};

type GivingLessRow = GivingLessRows[number];

interface Cell {
  row: { original: GivingLessRow };
}

const TagCell = ({ row }: Cell) => (
  <Link params={{ tagNumber: row.original.tag }} to="/animals/$tagNumber">
    <TagChip>{row.original.tag}</TagChip>
  </Link>
);
const Liters = ({ liters }: { liters: number }) => {
  const { language } = useLanguage();
  return <span>{formatNumber(liters, language)}</span>;
};
const LatelyCell = ({ row }: Cell) => <Liters liters={row.original.lately} />;
const UsuallyCell = ({ row }: Cell) => <Liters liters={row.original.usually} />;
const DropCell = ({ row }: Cell) => {
  const { language } = useLanguage();
  return (
    <span className="text-warning font-medium">
      {`${formatNumber(row.original.dropPercent, language)}%`}
    </span>
  );
};
/** What has been done about her, or — for whoever may — the button to put her in front of the Vet. */
const SeenToCell = ({ row }: Cell) => {
  const { t } = useLanguage();
  const mayAsk = useContext(MayAskTheVet);
  if (seenOf(row.original)) {
    return <SeenToWords row={row.original} />;
  }
  return mayAsk ? (
    <AskTheVet tag={row.original.tag} />
  ) : (
    <span className="text-muted-foreground text-sm">
      {t("givingLess.notYet")}
    </span>
  );
};
const DaysInMilkCell = ({ row }: Cell) => {
  const { language } = useLanguage();
  const days = row.original.daysInMilk;
  return days === null ? (
    <Nothing />
  ) : (
    <span>{formatNumber(days, language)}</span>
  );
};

const column = createListColumns<GivingLessRow>();
const givingLessColumns = column.columns([
  column.accessor("tag", {
    header: listHeader("animals.col.tag"),
    cell: TagCell,
  }),
  column.accessor("penName", { header: listHeader("herd.col.pen") }),
  column.accessor((row) => row.daysInMilk ?? undefined, {
    id: "daysInMilk",
    header: listHeader("givingLess.col.daysInMilk"),
    cell: DaysInMilkCell,
    meta: { align: "end" },
  }),
  column.accessor("usually", {
    header: listHeader("givingLess.col.usually"),
    cell: UsuallyCell,
    meta: { align: "end" },
  }),
  column.accessor("lately", {
    header: listHeader("givingLess.col.lately"),
    cell: LatelyCell,
    meta: { align: "end" },
  }),
  column.accessor("dropPercent", {
    header: listHeader("givingLess.col.drop"),
    cell: DropCell,
    meta: { align: "end" },
  }),
  column.display({
    id: "seenTo",
    header: listHeader("givingLess.col.seenTo"),
    cell: SeenToCell,
  }),
]);

const GivingLessTable = ({ rows }: { rows: GivingLessRows }) => {
  const table = useListTable({
    columns: givingLessColumns,
    data: rows,
    getRowId: (row) => row.animalId,
  });
  return <DataTable table={table} />;
};

/**
 * The list of cows giving less, on the Milk page and the Vet's. A phone keeps the queue's lines; a desk reads them as a
 * table — Tag Number, Pen, days in milk, liters a milking usually, lately and how far under, and what has been done
 * about her — sortable, the furthest under first (Polaris's index table).
 */
export const GivingLessList = ({
  rows,
  mayAskTheVet = false,
}: {
  rows: GivingLessRows;
  /** The Manager's and the Owner's list may put a cow in front of the Vet; the Vet's own may not. */
  mayAskTheVet?: boolean;
}) => (
  <MayAskTheVet.Provider value={mayAskTheVet}>
    <div className="md:hidden">
      <GivingLessGroup headless rows={rows} />
    </div>
    <Section className="hidden md:flex">
      <GivingLessTable rows={rows} />
    </Section>
  </MayAskTheVet.Provider>
);
