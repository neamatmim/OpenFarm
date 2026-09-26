import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { cn } from "@OpenFarm/ui/lib/utils";
import { CalendarClock, CalendarX, CircleCheck, Scale } from "lucide-react";
import { useState } from "react";

import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import {
  PriceCell,
  PriceLine,
  useIsOwner,
} from "@/components/fattening/animal-prices";
import { GainFigures, WeightAgainstTarget } from "@/components/gain";
import { EmptyState, SegmentedControl, StatusBadge } from "@/components/page";
import { FilterBar, NativeSelect } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";

import type { Suggestion } from "./fattening-types";
import { RatesLine, TagLink } from "./fattening-words";

/** How many suggestions show before the next page: at Eid a whole shed can come due in one week. */
const SUGGESTION_PAGE = 20;

/** The Manager's two answers to a suggestion, and which one the farm is busy with. Neither answer is the default. */
export interface Answering {
  /** The animal being confirmed as this is drawn, if any. */
  confirmingTag: string | null;
  handleConfirm: (row: Suggestion) => void;
  handleKeepLonger: (row: Suggestion) => void;
}

/** Why the farm suggests her, as badges: her target weight reached, her Target Window open — or, once her Eid has
 *  gone by, passed. */
const Grounds = ({ row }: { row: Suggestion }) => {
  const { t } = useLanguage();
  return (
    <span className="flex flex-wrap gap-1">
      {row.grounds.includes("weight") ? (
        <StatusBadge icon={Scale} tone="success">
          {t("ready.because.weight")}
        </StatusBadge>
      ) : null}
      {row.grounds.includes("window") && row.windowClosed ? (
        <StatusBadge icon={CalendarX} tone="warning">
          {t("ready.windowClosed")}
        </StatusBadge>
      ) : null}
      {row.grounds.includes("window") && !row.windowClosed ? (
        <StatusBadge icon={CalendarClock} tone="info">
          {t("ready.because.window")}
        </StatusBadge>
      ) : null}
    </span>
  );
};

/** The two answers side by side: keep her longer, or yes, she is ready. */
const Answers = ({
  row,
  answering,
  className,
}: {
  row: Suggestion;
  answering: Answering;
  className?: string;
}) => {
  const { t } = useLanguage();
  const { handleConfirm, handleKeepLonger, confirmingTag } = answering;
  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      <Button
        onClick={() => handleKeepLonger(row)}
        type="button"
        variant="outline"
      >
        {t("ready.setAside")}
      </Button>
      <Button
        disabled={confirmingTag !== null}
        onClick={() => handleConfirm(row)}
        type="button"
      >
        {confirmingTag === row.tagNumber ? (
          <Spinner />
        ) : (
          <CircleCheck aria-hidden data-icon="inline-start" />
        )}
        {t("ready.confirm")}
      </Button>
    </div>
  );
};

interface SuggestionRow extends Suggestion {
  answering: Answering;
}

interface SuggestionCell {
  row: { original: SuggestionRow };
}

const TagCell = ({ row }: SuggestionCell) => (
  <TagLink tagNumber={row.original.tagNumber} />
);

const WhyCell = ({ row }: SuggestionCell) => <Grounds row={row.original} />;

const WeightCell = ({ row }: SuggestionCell) => (
  <WeightAgainstTarget
    bar
    latestKg={row.original.latestKg}
    targetWeightKg={row.original.targetWeightKg}
  />
);

const SinceIntakeCell = ({ row }: SuggestionCell) => (
  <GainFigures basis={row.original.sinceIntake} />
);

const RecentCell = ({ row }: SuggestionCell) => (
  <GainFigures basis={row.original.recent} />
);

const AnswerCell = ({ row }: SuggestionCell) => (
  <Answers
    answering={row.original.answering}
    className="flex justify-end whitespace-nowrap"
    row={row.original}
  />
);

const column = createListColumns<SuggestionRow>();

const PriceOfCell = ({ row }: SuggestionCell) => (
  <PriceCell tagNumber={row.original.tagNumber} />
);

const answerColumn = column.display({
  id: "answer",
  header: ActionsHeader,
  cell: AnswerCell,
  meta: { align: "end" },
});
const suggestionColumns = column.columns([
  column.accessor("tagNumber", {
    header: listHeader("animals.col.tag"),
    cell: TagCell,
  }),
  column.accessor("penName", {
    header: listHeader("animals.pen"),
    meta: { className: "whitespace-nowrap" },
  }),
  column.accessor((row) => row.grounds.length, {
    id: "why",
    header: listHeader("ready.col.why"),
    cell: WhyCell,
  }),
  column.accessor((row) => row.latestKg ?? undefined, {
    id: "latestKg",
    header: listHeader("gain.now"),
    cell: WeightCell,
    sortUndefined: "last",
    meta: { align: "end" },
  }),
  column.accessor((row) => row.sinceIntake?.dailyGainKg, {
    id: "sinceIntake",
    header: listHeader("gain.sinceIntake"),
    cell: SinceIntakeCell,
    sortUndefined: "last",
    meta: { align: "end" },
  }),
  column.accessor((row) => row.recent?.dailyGainKg, {
    id: "recent",
    header: listHeader("gain.recent"),
    cell: RecentCell,
    sortUndefined: "last",
    meta: { align: "end" },
  }),
  answerColumn,
]);

/** The same, with each animal's price against her cost before the answers: the Owner's list. */
const suggestionColumnsPriced = column.columns([
  ...suggestionColumns.slice(0, -1),
  column.display({
    id: "price",
    header: listHeader("price.col"),
    cell: PriceOfCell,
    meta: { align: "end" },
  }),
  answerColumn,
]);

/** A suggestion on a phone: her tag, her pen and why on top, her weight against her target large, her rates beneath,
 *  and the two answers across the foot where a thumb reaches them. */
const SuggestionCard = ({ row }: { row: SuggestionRow }) => {
  const { t, language } = useLanguage();
  const kg = (value: number) =>
    t("intake.kg", { kg: formatNumber(value, language) });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <TagLink tagNumber={row.tagNumber} />
        <span className="text-muted-foreground text-sm">{row.penName}</span>
      </div>
      <Grounds row={row} />
      <p className="tabular-nums">
        <span className="text-lg font-semibold">
          {row.latestKg === null ? t("gain.noneYet") : kg(row.latestKg)}
        </span>
        {row.targetWeightKg === null ? null : (
          <span className="text-muted-foreground text-sm">
            {" / "}
            {kg(row.targetWeightKg)}
          </span>
        )}
      </p>
      <RatesLine recent={row.recent} sinceIntake={row.sinceIntake} />
      <PriceLine tagNumber={row.tagNumber} />
      <Answers answering={row.answering} className="mt-1" row={row} />
    </div>
  );
};

const suggestionCard = (row: SuggestionRow) => <SuggestionCard row={row} />;

type GroundFilter = "" | "weight" | "window";

/** Every Pen a suggestion stands in, once each, by name. */
const pensOf = (rows: Suggestion[]) =>
  [...new Set(rows.map((row) => row.penName))].toSorted((a, b) =>
    a.localeCompare(b)
  );

/**
 * What the farm suggests may be sold, filtered by why and by Pen, a page at a time: the reasons and figures in
 * columns, the two answers at the end of each row — or, on a phone, a card each with the answers at its foot.
 */
export const ReadySuggestions = ({
  suggestions,
  answering,
}: {
  suggestions: Suggestion[];
  answering: Answering;
}) => {
  const { t } = useLanguage();
  const [ground, setGround] = useState<GroundFilter>("");
  const [pen, setPen] = useState("");
  const pens = pensOf(suggestions);
  const shown = suggestions.filter(
    (row) =>
      (ground === "" || row.grounds.includes(ground)) &&
      (pen === "" || row.penName === pen)
  );
  const owner = useIsOwner();
  const table = useListTable({
    columns: owner ? suggestionColumnsPriced : suggestionColumns,
    data: shown.map((row) => ({ ...row, answering })),
    getRowId: (row) => row.id,
  });
  return (
    <div className="surface flex flex-col gap-4 p-4 md:p-5">
      <FilterBar className="border-b pb-4 sm:justify-between">
        <SegmentedControl
          label={t("ready.col.why")}
          name="ready-ground"
          onChange={setGround}
          options={[
            { value: "", label: t("gain.all") },
            { value: "weight", label: t("ready.filter.weight") },
            { value: "window", label: t("ready.filter.window") },
          ]}
          value={ground}
        />
        {pens.length > 1 ? (
          <NativeSelect
            aria-label={t("gain.filterPen")}
            className="sm:w-48"
            onChange={(event) => setPen(event.target.value)}
            value={pen}
          >
            <option value="">{t("gain.allPens")}</option>
            {pens.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </NativeSelect>
        ) : null}
      </FilterBar>
      {shown.length === 0 ? (
        <EmptyState bare title={t("gain.noneInFilter")} />
      ) : (
        <DataTable
          card={suggestionCard}
          key={`${ground}:${pen}`}
          minWidth="60rem"
          pageSize={SUGGESTION_PAGE}
          table={table}
        />
      )}
    </div>
  );
};
