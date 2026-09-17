import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Link } from "@tanstack/react-router";
import type { Table as TableInstance } from "@tanstack/react-table";

import type { ListFeatures } from "@/components/data-table";
import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { useLanguage } from "@/i18n/language-provider";
import type { orpc } from "@/utils/orpc";

/**
 * An animal's histories as tables, where there is room to read one across: her weigh-ins, her doses, her moves, her
 * services, her pregnancy checks and her calvings. Her page keeps its own lines for a phone; these stand beside
 * them from a tablet up, each sortable, newest first as the farm gave them.
 */

type AnimalDetail = NonNullable<
  Awaited<ReturnType<typeof orpc.animals.byTag.call>>
>;

/** One of her records of a kind, as her page's answer holds it. A table asks only for the parts it reads, so a part
 *  of her page that holds less than the whole answer can hand its own records over. */
type RecordOf<K extends "weighIns" | "heats" | "pregnancyChecks" | "calvings"> =
  AnimalDetail[K][number];

/** A moment as a row holds it: a number, so a column of them sorts, whatever shape the answer brought it in. */
const momentOf = (at: Date | string): number => new Date(at).getTime();

/** Something every row has: when it happened. */
interface Dated {
  id: string;
  at: number;
}

const DayCell = ({ row }: { row: { original: Dated } }) => {
  const { language } = useLanguage();
  return formatDate(new Date(row.original.at), language, "date");
};

const MomentCell = ({ row }: { row: { original: Dated } }) => {
  const { language } = useLanguage();
  return formatDate(new Date(row.original.at), language, "dateTime");
};

/** A date and a time kept on one line: broken over three, a column of them cannot be read down. */
const ONE_LINE = { className: "whitespace-nowrap" };

/** A name somebody may not have left, as a dash when they did not. */
const orDash = (value: string | null): string => value ?? "—";

/** A history as a table from a tablet up, and nothing on a phone, where the page's own lines stand. On a card, it runs
 *  to the card's edges; without one, it brings a card of its own. */
const HistoryTable = <Row extends object>({
  table,
  minWidth,
  onCard,
}: {
  table: TableInstance<ListFeatures, Row>;
  minWidth: string;
  onCard: boolean;
}) =>
  onCard ? (
    <DataTable className="hidden md:block" minWidth={minWidth} table={table} />
  ) : (
    <div className="bg-card hidden rounded-xl border md:block">
      <DataTable bare minWidth={minWidth} table={table} />
    </div>
  );

// Weigh-ins

interface WeighInRow extends Dated {
  weightKg: number;
  weighedByName: string | null;
  flagged: boolean;
  flaggedNote: string | null;
}

const WeightCell = ({ row }: { row: { original: WeighInRow } }) => {
  const { t, language } = useLanguage();
  return (
    <span className="font-medium">
      {t("intake.kg", { kg: formatNumber(row.original.weightKg, language) })}
    </span>
  );
};

/** A reading the farm doubted, said with why — and nothing beside one it did not. */
const QueriedCell = ({ row }: { row: { original: WeighInRow } }) => {
  const { t } = useLanguage();
  if (!row.original.flagged) {
    return null;
  }
  return (
    <span className="text-warning">
      {row.original.flaggedNote ?? t("weighIn.flagged")}
    </span>
  );
};

const weighIn = createListColumns<WeighInRow>();
const weighInColumns = weighIn.columns([
  weighIn.accessor("at", {
    header: listHeader("observations.col.when"),
    cell: DayCell,
    meta: ONE_LINE,
  }),
  weighIn.accessor("weightKg", {
    header: listHeader("weighIn.col.weight"),
    cell: WeightCell,
    meta: { align: "end" },
  }),
  weighIn.accessor((row) => orDash(row.weighedByName), {
    id: "weighedBy",
    header: listHeader("weighIn.col.by"),
  }),
  weighIn.accessor("flagged", {
    header: listHeader("weighIn.flagged"),
    cell: QueriedCell,
  }),
]);

/** Every time she has been on the scale: the day, the figure, who read it, and whether the farm doubted it. */
export const WeighInTable = ({
  readings,
}: {
  readings: Pick<
    RecordOf<"weighIns">,
    | "id"
    | "weighedAt"
    | "weightKg"
    | "weighedByName"
    | "flagged"
    | "flaggedNote"
  >[];
}) => {
  const table = useListTable({
    columns: weighInColumns,
    data: readings.map((reading) => ({
      id: reading.id,
      at: momentOf(reading.weighedAt),
      weightKg: reading.weightKg,
      weighedByName: reading.weighedByName,
      flagged: reading.flagged,
      flaggedNote: reading.flaggedNote,
    })),
    getRowId: (row) => row.id,
  });
  return <HistoryTable minWidth="32rem" onCard table={table} />;
};

// What she has been given

interface DoseRow extends Dated {
  given: boolean;
  productNameBn: string;
  productNameEn: string | null;
  fromPrescription: boolean;
  givenByName: string | null;
}

const GivenAtCell = ({ row }: { row: { original: DoseRow } }) => {
  const { language } = useLanguage();
  return row.original.given
    ? formatDate(new Date(row.original.at), language, "dateTime")
    : "—";
};

/** The product in the reader's language — the label is in Bangla, so that is what is kept. */
const ProductCell = ({ row }: { row: { original: DoseRow } }) => {
  const { language } = useLanguage();
  return language === "en" && row.original.productNameEn
    ? row.original.productNameEn
    : row.original.productNameBn;
};

/** Whether a course the Vet wrote gave it, or a Campaign over her Pen. */
const SourceCell = ({ row }: { row: { original: DoseRow } }) => {
  const { t } = useLanguage();
  return row.original.fromPrescription
    ? t("prescribe.course")
    : t("animals.fromCampaign");
};

const dose = createListColumns<DoseRow>();
const doseColumns = dose.columns([
  dose.accessor("at", {
    header: listHeader("observations.col.when"),
    cell: GivenAtCell,
    meta: ONE_LINE,
  }),
  dose.accessor("productNameBn", {
    header: listHeader("prescribe.product"),
    cell: ProductCell,
  }),
  dose.accessor("fromPrescription", {
    header: listHeader("observations.col.from"),
    cell: SourceCell,
  }),
  dose.accessor((row) => orDash(row.givenByName), {
    id: "givenBy",
    header: listHeader("animals.col.givenBy"),
  }),
]);

/** What she has been given, a course's doses and a Campaign's alike: when, what, from which, and by whom. */
export const DoseTable = ({ doses }: { doses: AnimalDetail["treatments"] }) => {
  const table = useListTable({
    columns: doseColumns,
    data: doses.map((one) => ({
      id: one.id,
      given: one.givenAt !== null,
      at: one.givenAt ? momentOf(one.givenAt) : 0,
      productNameBn: one.productNameBn,
      productNameEn: one.productNameEn,
      fromPrescription: one.fromPrescription,
      givenByName: one.givenByName,
    })),
    getRowId: (row) => row.id,
  });
  return <HistoryTable minWidth="36rem" onCard={false} table={table} />;
};

// Moves

interface MoveRow extends Dated {
  fromPenName: string | null;
  toPenName: string;
  reason: string | null;
  instanceId: string | null;
}

/** The work a Move was part of, where it was part of one. */
const MoveWorkCell = ({ row }: { row: { original: MoveRow } }) => {
  const { t } = useLanguage();
  const { instanceId } = row.original;
  if (!instanceId) {
    return null;
  }
  return (
    <Link className="underline" params={{ instanceId }} to="/work/$instanceId">
      {t("animals.moveFromWork")}
    </Link>
  );
};

const move = createListColumns<MoveRow>();
const moveColumns = move.columns([
  move.accessor("at", {
    header: listHeader("observations.col.when"),
    cell: MomentCell,
    meta: ONE_LINE,
  }),
  move.accessor((row) => orDash(row.fromPenName), {
    id: "fromPen",
    header: listHeader("animals.col.fromPen"),
  }),
  move.accessor("toPenName", { header: listHeader("animals.col.toPen") }),
  move.accessor((row) => orDash(row.reason), {
    id: "reason",
    header: listHeader("animals.reason"),
  }),
  move.display({
    header: ActionsHeader,
    id: "work",
    cell: MoveWorkCell,
    meta: { align: "end" },
  }),
]);

/** Every Pen she has been in and when she went, with the work that moved her at the end of the row. */
export const MoveTable = ({ moves }: { moves: AnimalDetail["moves"] }) => {
  const table = useListTable({
    columns: moveColumns,
    data: moves.map((one) => ({
      id: one.id,
      at: momentOf(one.movedAt),
      fromPenName: one.fromPenName,
      toPenName: one.toPenName,
      reason: one.reason,
      instanceId: one.instanceId,
    })),
    getRowId: (row) => row.id,
  });
  return <HistoryTable minWidth="36rem" onCard={false} table={table} />;
};

// Services

interface ServiceRow extends Dated {
  method: "ai" | "natural";
  sire: string;
  servedBy: string | null;
  /** When the heat it answered was seen; nothing for a service that answered none. */
  heatSeenAt: number | null;
}

const MethodCell = ({ row }: { row: { original: ServiceRow } }) => {
  const { t } = useLanguage();
  return t(row.original.method === "ai" ? "service.ai" : "service.natural");
};

const HeatCell = ({ row }: { row: { original: ServiceRow } }) => {
  const { language } = useLanguage();
  const { heatSeenAt } = row.original;
  return heatSeenAt === null
    ? "—"
    : formatDate(new Date(heatSeenAt), language, "dateTime");
};

const service = createListColumns<ServiceRow>();
const serviceColumns = service.columns([
  service.accessor("at", {
    header: listHeader("observations.col.when"),
    cell: MomentCell,
    meta: ONE_LINE,
  }),
  service.accessor("method", {
    header: listHeader("service.col.method"),
    cell: MethodCell,
  }),
  service.accessor("sire", { header: listHeader("service.sire") }),
  service.accessor((row) => orDash(row.servedBy), {
    id: "servedBy",
    header: listHeader("service.col.servedBy"),
  }),
  service.accessor((row) => row.heatSeenAt ?? 0, {
    id: "heat",
    header: listHeader("heat.seen"),
    cell: HeatCell,
    meta: ONE_LINE,
  }),
]);

/** Every time she has been served, beside the heat each one answered. */
export const ServiceTable = ({
  services,
  heats,
}: {
  services: AnimalDetail["services"];
  heats: Pick<RecordOf<"heats">, "id" | "seenAt">[];
}) => {
  const heatSeen = new Map(heats.map((heat) => [heat.id, heat.seenAt]));
  const table = useListTable({
    columns: serviceColumns,
    data: services.map((one) => {
      const answered = one.heatId ? heatSeen.get(one.heatId) : undefined;
      return {
        id: one.id,
        at: momentOf(one.servedAt),
        method: one.method,
        sire: one.sireTagNumber ?? one.sireStraw ?? "—",
        servedBy: one.servedBy,
        heatSeenAt: answered ? momentOf(answered) : null,
      };
    }),
    getRowId: (row) => row.id,
  });
  return <HistoryTable minWidth="36rem" onCard table={table} />;
};

// Pregnancy checks

interface CheckRow extends Dated {
  positive: boolean;
  firstServedAt: number;
}

const ResultCell = ({ row }: { row: { original: CheckRow } }) => {
  const { t } = useLanguage();
  return t(row.original.positive ? "pregnancy.positive" : "pregnancy.negative");
};

const ServedOnCell = ({ row }: { row: { original: CheckRow } }) => {
  const { language } = useLanguage();
  return formatDate(new Date(row.original.firstServedAt), language, "dateTime");
};

const check = createListColumns<CheckRow>();
const checkColumns = check.columns([
  check.accessor("at", {
    header: listHeader("observations.col.when"),
    cell: DayCell,
    meta: ONE_LINE,
  }),
  check.accessor("positive", {
    header: listHeader("pregnancy.col.result"),
    cell: ResultCell,
  }),
  check.accessor("firstServedAt", {
    header: listHeader("pregnancy.col.servedOn"),
    cell: ServedOnCell,
    meta: ONE_LINE,
  }),
]);

/** What the Vet found each time, and which service it was the answer to. */
export const PregnancyCheckTable = ({
  checks,
}: {
  checks: Pick<
    RecordOf<"pregnancyChecks">,
    "id" | "checkedAt" | "result" | "firstServedAt"
  >[];
}) => {
  const table = useListTable({
    columns: checkColumns,
    data: checks.map((one) => ({
      id: one.id,
      at: momentOf(one.checkedAt),
      positive: one.result === "positive",
      firstServedAt: momentOf(one.firstServedAt),
    })),
    getRowId: (row) => row.id,
  });
  return <HistoryTable minWidth="28rem" onCard table={table} />;
};

// Calvings

type Calving = RecordOf<"calvings">;

/** A calf as her mother's row names her. */
type Calf = Pick<
  Calving["calves"][number],
  "tagNumber" | "sex" | "calfOutcome"
>;

interface CalvingRow extends Dated {
  ease: Calving["ease"];
  lactationNumber: number;
  calves: Calf[];
}

const EaseCell = ({ row }: { row: { original: CalvingRow } }) => {
  const { t } = useLanguage();
  return t(`calving.ease.${row.original.ease}`);
};

const LactationCell = ({ row }: { row: { original: CalvingRow } }) => {
  const { language } = useLanguage();
  return formatNumber(row.original.lactationNumber, language);
};

/** Each calf by her own number, a stillborn one included. */
const CalvesCell = ({ row }: { row: { original: CalvingRow } }) => {
  const { t } = useLanguage();
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1">
      {row.original.calves.map((calf) => (
        <li key={calf.tagNumber}>
          <Link
            className="font-mono underline"
            params={{ tagNumber: calf.tagNumber }}
            to="/animals/$tagNumber"
          >
            {calf.tagNumber}
          </Link>{" "}
          <span className="text-muted-foreground">
            {t(`animals.sex.${calf.sex}`)}
            {calf.calfOutcome === "stillborn"
              ? ` · ${t("calving.stillborn")}`
              : ""}
          </span>
        </li>
      ))}
    </ul>
  );
};

const calving = createListColumns<CalvingRow>();
const calvingColumns = calving.columns([
  calving.accessor("at", {
    header: listHeader("observations.col.when"),
    cell: MomentCell,
    meta: ONE_LINE,
  }),
  calving.accessor("ease", {
    header: listHeader("calving.col.ease"),
    cell: EaseCell,
  }),
  calving.accessor("lactationNumber", {
    header: listHeader("calving.col.lactation"),
    cell: LactationCell,
    meta: { align: "end" },
  }),
  calving.display({
    id: "calves",
    header: listHeader("milk.calves"),
    cell: CalvesCell,
  }),
]);

/** Every time she has calved: when, how it went, which Lactation it began, and what was born. */
export const CalvingTable = ({
  calvings,
}: {
  calvings: (Pick<Calving, "id" | "calvedAt" | "ease" | "lactationNumber"> & {
    calves: Calf[];
  })[];
}) => {
  const table = useListTable({
    columns: calvingColumns,
    data: calvings.map((one) => ({
      id: one.id,
      at: momentOf(one.calvedAt),
      ease: one.ease,
      lactationNumber: one.lactationNumber,
      calves: one.calves,
    })),
    getRowId: (row) => row.id,
  });
  return <HistoryTable minWidth="36rem" onCard table={table} />;
};
