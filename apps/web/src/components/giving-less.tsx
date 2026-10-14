import { GIVING_LESS } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Stethoscope, TrendingDown } from "lucide-react";
import type { ReactNode } from "react";
import { createContext, useContext, useMemo, useState } from "react";

import {
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { Opens, QueueGroup, QueueRow } from "@/components/home/queue";
import { Nothing } from "@/components/list-cells";
import { Section, TagChip } from "@/components/page";
import { useRecordObservation } from "@/components/record-observation";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import type { SeenTo } from "@/lib/seen-to";
import { seenToSaid } from "@/lib/seen-to";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

/** A cow giving well under her own week, as the Manager's queue, the Milk page and the Vet's are told it. */
export type GivingLessRows = Awaited<
  ReturnType<typeof orpc.milk.givingLess.call>
>;

type GivingLessRow = GivingLessRows[number];

/** Who may put a cow in front of the Vet here, and which cows this phone has asked about on this visit. */
interface Asking {
  mayAsk: boolean;
  askedHere: ReadonlySet<string>;
  markAsked: (tag: string) => void;
}

const AskingTheVet = createContext<Asking>({
  mayAsk: false,
  askedHere: new Set(),
  markAsked: () => null,
});

/**
 * The Manager's and the Owner's lists may put a cow in front of the Vet; the Vet's own may not. A request kept on the
 * phone with no signal is not on the farm's list until the phone is back in range, so the cows asked about on this
 * visit are remembered here and their button goes — a second tap must not keep a second request.
 */
const AskingTheVetHere = ({
  mayAsk,
  children,
}: {
  mayAsk: boolean;
  children: ReactNode;
}) => {
  const [askedHere, setAskedHere] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const asking = useMemo(
    () => ({
      mayAsk,
      askedHere,
      markAsked: (tag: string) =>
        setAskedHere((before) => new Set([...before, tag])),
    }),
    [mayAsk, askedHere]
  );
  return (
    <AskingTheVet.Provider value={asking}>{children}</AskingTheVet.Provider>
  );
};

/** What has been done about her: the farm's answer, else asked from this phone on this visit, else nothing. */
const useSeenTo = (row: { tag: string; seenTo?: SeenTo | null }) => {
  const { askedHere } = useContext(AskingTheVet);
  const said = seenToSaid(row.seenTo);
  if (said) {
    return said;
  }
  return askedHere.has(row.tag)
    ? { key: "givingLess.vetAsked" as const, at: new Date() }
    : null;
};

/** What has been done about a cow giving less, said: the Vet saw her, or the Vet was asked, and when. */
const SeenToWords = ({
  row,
}: {
  row: { tag: string; seenTo?: SeenTo | null };
}) => {
  const { t, language } = useLanguage();
  const said = useSeenTo(row);
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
 * Put her in front of the Vet: an Observation, "giving less milk", which reaches the Vet's inbox as any Observation does
 * — sent now when the farm answers, kept on the phone when it does not.
 */
const AskTheVet = ({ tag }: { tag: string }) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const queryClient = useQueryClient();
  const { markAsked } = useContext(AskingTheVet);
  const ask = useRecordObservation({
    onSuccess: async (how) => {
      markAsked(tag);
      toast.success(
        t(how === "sent" ? "givingLess.asked" : "givingLess.queued")
      );
      // What says she has been asked about: the list itself, on the Milk page, the Vet's page and the Manager's day,
      // and the Observations.
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: orpc.milk.givingLess.key(),
        }),
        queryClient.invalidateQueries({ queryKey: orpc.home.key() }),
        queryClient.invalidateQueries({ queryKey: orpc.observations.key() }),
      ]);
    },
    onError: refused,
  });
  return (
    <Button
      disabled={ask.isPending}
      onClick={() => ask.mutate({ tagNumber: tag, saw: GIVING_LESS })}
      size="sm"
      type="button"
      variant="outline"
    >
      <Stethoscope aria-hidden data-icon="inline-start" />
      {t("givingLess.askVet")}
    </Button>
  );
};

/** At the end of her line on a phone: the button to put her in front of the Vet, for whoever may and while nobody has;
 *  otherwise the sign that the line opens her page. Above the line's link, so a tap is the button's. */
const RowEnd = ({ row }: { row: GivingLessRow }) => {
  const { mayAsk } = useContext(AskingTheVet);
  const said = useSeenTo(row);
  return mayAsk && !said ? (
    <div className="relative z-10">
      <AskTheVet tag={row.tag} />
    </div>
  ) : (
    <Opens />
  );
};

/** One cow's line in the queue. */
const GivingLessLine = ({ row }: { row: GivingLessRow }) => {
  const { t, language } = useLanguage();
  return (
    <QueueRow
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
      trailing={<RowEnd row={row} />}
    />
  );
};

/**
 * Cows in milk giving well under their own week, the furthest under first: liters a milking lately and usually, how far
 * under, what has been done about her, and how long she has been in milk, each opening her page. A sudden drop is often
 * the first sign of mastitis, milk fever or ketosis — and a heat drops milk too.
 */
export const GivingLessGroup = ({
  rows,
  headless = false,
  mayAskTheVet = false,
}: {
  /** Missing from an answer a phone kept from before the list. */
  rows: GivingLessRows | undefined;
  headless?: boolean;
  /** The Manager's and the Owner's list may put a cow in front of the Vet; the Vet's own may not. */
  mayAskTheVet?: boolean;
}) => {
  const { t } = useLanguage();
  const items = (rows ?? []).map((row) => (
    <GivingLessLine key={row.animalId} row={row} />
  ));
  if (items.length === 0) {
    return null;
  }
  return (
    <AskingTheVetHere mayAsk={mayAskTheVet}>
      <QueueGroup
        headless={headless}
        icon={TrendingDown}
        label={t("givingLess.title")}
        rows={items}
        tone="warning"
      />
    </AskingTheVetHere>
  );
};

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
  const { mayAsk } = useContext(AskingTheVet);
  const said = useSeenTo(row.original);
  if (said) {
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
  <>
    <div className="md:hidden">
      <GivingLessGroup headless mayAskTheVet={mayAskTheVet} rows={rows} />
    </div>
    <AskingTheVetHere mayAsk={mayAskTheVet}>
      <Section className="hidden md:flex">
        <GivingLessTable rows={rows} />
      </Section>
    </AskingTheVetHere>
  </>
);
