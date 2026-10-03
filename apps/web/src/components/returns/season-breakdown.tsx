import type { MessageKey } from "@OpenFarm/i18n";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChartColumn } from "lucide-react";
import { useState } from "react";

import {
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import { bandSaid } from "@/components/feed/band-words";
import { EmptyState } from "@/components/page";
import {
  CAME_WORD,
  JOINED_WORD,
  LEFT_WORD,
  ShareSaid,
} from "@/components/returns/return-words";
import { Chip } from "@/components/saw-filter";
import { useLanguage } from "@/i18n/language-provider";
import { wordedRefusal } from "@/lib/correction-refusal";
import { useMoney } from "@/lib/money";
import type { client } from "@/utils/orpc";
import { orpc } from "@/utils/orpc";

type BreakdownBy = Parameters<typeof client.returns.breakdown>[0]["by"];
type BreakdownRow = Awaited<
  ReturnType<typeof client.returns.breakdown>
>[number];
type BreakdownLine = BreakdownRow["line"];

/** Every way a finished Season opens out, and its chip's word: a way the server adds is a type error here until named. */
const BY_WORD = {
  haat: "returns.by.haat",
  trader: "returns.by.trader",
  breed: "returns.by.breed",
  band: "returns.by.band",
  animal: "returns.by.animal",
} as const satisfies Record<BreakdownBy, MessageKey>;

/** The ways, in the order the chips offer them. */
const OPEN_BY = Object.keys(BY_WORD) as (keyof typeof BY_WORD)[];

/** A line with none of it written: what "none" means depends on what it was opened by. An Animal is always herself. */
const NONE_WORD = {
  haat: "returns.none.haat",
  trader: "returns.none.trader",
  breed: "returns.none.breed",
  band: "returns.none.band",
} as const satisfies Record<Exclude<BreakdownBy, "animal">, MessageKey>;

/** What a breakdown line is called in the reader's words. */
const useLineSaid = () => {
  const words = useLanguage();
  const { t, language } = words;
  return (line: BreakdownLine, by: BreakdownBy): string => {
    switch (line.kind) {
      case "named": {
        return language === "en" && line.nameEn ? line.nameEn : line.name;
      }
      case "band": {
        return bandSaid(line, words) ?? t(NONE_WORD.band);
      }
      case "none": {
        return by === "animal" ? "" : t(NONE_WORD[by]);
      }
      case "animal": {
        return line.tagNumber;
      }
      default: {
        return t(JOINED_WORD[line.kind]);
      }
    }
  };
};

/** A breakdown line as the table reads it, with what it is called in the reader's words. */
interface BreakdownListRow extends BreakdownRow {
  said: string;
}

interface BreakdownCell {
  row: { original: BreakdownListRow };
}

/** What the line is — an animal leading to her page — and under it her coming and going, or the head and the dead. */
const LineCell = ({ row }: BreakdownCell) => {
  const { t } = useLanguage();
  const { line, said, head, died, lost } = row.original;
  return (
    <span className="flex flex-col font-medium">
      {line.kind === "animal" ? (
        <Link
          className="underline-offset-4 hover:underline"
          params={{ tagNumber: line.tagNumber }}
          to="/animals/$tagNumber"
        >
          {said}
        </Link>
      ) : (
        said
      )}
      <span className="text-muted-foreground text-xs font-normal">
        {line.kind === "animal"
          ? t("returns.cameLeft", {
              came: t(CAME_WORD[line.came]),
              left: t(LEFT_WORD[line.left]),
            })
          : `${t("returns.head", { count: head })}${
              died > 0 ? ` · ${t("returns.died", { count: died })}` : ""
            }${lost > 0 ? ` · ${t("returns.lostHead", { count: lost })}` : ""}`}
      </span>
    </span>
  );
};

const CostBackCell = ({ row }: BreakdownCell) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  return (
    <span className="text-muted-foreground tabular-nums">
      {t("returns.costBack", {
        cost: asMoney(row.original.costMoney),
        back: asMoney(row.original.backMoney),
      })}
    </span>
  );
};

const ShareCell = ({ row }: BreakdownCell) =>
  row.original.per100 === null ? null : (
    <ShareSaid on="onCost" per100={row.original.per100} />
  );

const breakdownColumn = createListColumns<BreakdownListRow>();
/** The columns, the first headed by the way the Season was opened out. */
const breakdownColumnsFor = (by: BreakdownBy) =>
  breakdownColumn.columns([
    breakdownColumn.accessor("said", {
      id: "line",
      header: listHeader(BY_WORD[by]),
      cell: LineCell,
    }),
    breakdownColumn.accessor("costMoney", {
      id: "costBack",
      header: listHeader("returns.col.costBack"),
      cell: CostBackCell,
    }),
    breakdownColumn.accessor((row) => row.per100 ?? undefined, {
      id: "share",
      header: listHeader("returns.col.share"),
      cell: ShareCell,
    }),
  ]);
const BREAKDOWN_COLUMNS = {
  haat: breakdownColumnsFor("haat"),
  trader: breakdownColumnsFor("trader"),
  breed: breakdownColumnsFor("breed"),
  band: breakdownColumnsFor("band"),
  animal: breakdownColumnsFor("animal"),
} as const satisfies Record<
  BreakdownBy,
  ReturnType<typeof breakdownColumnsFor>
>;

/** A breakdown line on a phone: what it is, then its cost to back and its share. */
const BreakdownCard = ({ row }: { row: BreakdownListRow }) => (
  <div className="flex flex-col gap-1 text-sm">
    <LineCell row={{ original: row }} />
    <CostBackCell row={{ original: row }} />
    <ShareCell row={{ original: row }} />
  </div>
);

const breakdownCard = (row: BreakdownListRow) => <BreakdownCard row={row} />;

/** The lines of one breakdown: each the Season's own sum for its animals — head, the dead, cost to back, share. */
const BreakdownTable = ({
  rows,
  by,
}: {
  rows: BreakdownRow[];
  by: BreakdownBy;
}) => {
  const said = useLineSaid();
  const table = useListTable({
    columns: BREAKDOWN_COLUMNS[by],
    data: rows.map((row) => ({ ...row, said: said(row.line, by) })),
    getRowId: (row) => JSON.stringify(row.line),
  });
  return <DataTable bare card={breakdownCard} minWidth="32rem" table={table} />;
};

/**
 * A finished Season opened out by haat, trader, breed, buying weight or each animal — asked for only when the Owner
 * picks a way, so a page of Seasons is not a page of breakdowns. A share on every line, never a rate a year.
 */
export const SeasonBreakdown = ({ seasonKey }: { seasonKey: string }) => {
  const { t } = useLanguage();
  const [by, setBy] = useState<BreakdownBy | null>(null);
  const opened = useQuery({
    ...orpc.returns.breakdown.queryOptions({
      input: { seasonKey, by: by ?? "haat" },
    }),
    enabled: by !== null,
  });
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-sm">{t("returns.openBy")}</p>
      <div className="flex flex-wrap gap-2">
        {OPEN_BY.map((one) => (
          <Chip
            chosen={by === one}
            key={one}
            label={t(BY_WORD[one])}
            onChoose={() => setBy(by === one ? null : one)}
          />
        ))}
      </div>
      {by !== null && opened.error ? (
        <p className="text-danger text-sm">
          {wordedRefusal(opened.error, t) ?? t("returns.breakdownFailed")}
        </p>
      ) : null}
      {by !== null && opened.data ? (
        <>
          {opened.data.length === 0 ? (
            <EmptyState
              bare
              icon={ChartColumn}
              title={t("returns.breakdownNone")}
            />
          ) : (
            <BreakdownTable by={by} rows={opened.data} />
          )}
          <p className="text-muted-foreground max-w-prose text-xs">
            {t("returns.breakdownNote")}
          </p>
        </>
      ) : null}
    </div>
  );
};
