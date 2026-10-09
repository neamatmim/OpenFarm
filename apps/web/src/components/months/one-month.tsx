import type { PaperDocument } from "@OpenFarm/domain";
import { RECEIVABLE_AGES } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@OpenFarm/ui/components/table";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Briefcase, FileSpreadsheet, Printer, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { COLUMN_HEADING } from "@/components/data-table";
import { Nothing } from "@/components/list-cells";
import { EmptyState } from "@/components/page";
import { NativeSelect } from "@/components/page-kit";
import { PaperDialog } from "@/components/ventures/paper-dialog";
import { useLanguage } from "@/i18n/language-provider";
import { usePerHeadPerDay, useMoney, useMoneyRate } from "@/lib/money";
import { saidMonth } from "@/lib/months";
import { useRefused } from "@/lib/refused";
import { saveCsv } from "@/lib/save-csv";
import type { client } from "@/utils/orpc";
import { orpc } from "@/utils/orpc";

export type OneMonth = Awaited<ReturnType<typeof client.monthlyReport.month>>;
type Figures = OneMonth["figures"];
/** A month's figures as the phone may hold them: an answer kept from before the management figures (ADR 0023) has
 *  neither what each Side came to nor where the Farm stood at the month's end. */
export type KeptFigures = Omit<
  Figures,
  "results" | "atEnd" | "cashFlow" | "monthsReturn"
> &
  Partial<Pick<Figures, "results" | "atEnd" | "cashFlow" | "monthsReturn">>;

/** One month of the farm, the Owner's alone, beside the month before. */
export const useOneMonth = (month: string, asked = true) =>
  useQuery({
    ...orpc.monthlyReport.month.queryOptions({ input: { month } }),
    enabled: asked,
  });

/** One line of a part: what it is, and its figure this month and the month before — either may be nothing. */
interface Line {
  label: string;
  now: ReactNode;
  before: ReactNode;
  /** A total, drawn heavier than the lines it adds. */
  total?: boolean;
  /** From the month before to this one, where the part says it: the dash where either is nothing. */
  change?: ReactNode;
}

/** A figure in a column, lined up with the ones above it; the dash where there is none. */
const Figure = ({ children }: { children: ReactNode }) =>
  children === null ? (
    <Nothing />
  ) : (
    <span className="tabular-nums">{children}</span>
  );

/** One part of the month as a table: its lines, the month and the month before side by side. */
export const MonthPart = ({
  lines,
  month,
  before,
  firstHeading,
}: {
  lines: readonly Line[];
  month: string;
  before: string;
  /** What the first column names: a line, a Category, a Side. */
  firstHeading?: string;
}) => {
  const { t, language } = useLanguage();
  const changes = lines.some((line) => line.change !== undefined);
  // The same columns in every part, so the month's figures line up from one part to the next.
  return (
    <Table className="max-w-3xl table-fixed">
      <colgroup>
        <col />
        <col className="w-28 sm:w-44" />
        <col className="w-28 sm:w-44" />
        {changes ? <col className="w-28 sm:w-44" /> : null}
      </colgroup>
      <TableHeader>
        <TableRow>
          <TableHead className={COLUMN_HEADING}>
            {firstHeading ?? t("months.one.line")}
          </TableHead>
          <TableHead className={cn(COLUMN_HEADING, "text-right")}>
            {saidMonth(month, language)}
          </TableHead>
          <TableHead className={cn(COLUMN_HEADING, "text-right")}>
            {saidMonth(before, language)}
          </TableHead>
          {changes ? (
            <TableHead className={cn(COLUMN_HEADING, "text-right")}>
              {t("months.one.change")}
            </TableHead>
          ) : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((line) => (
          <TableRow key={line.label}>
            <TableCell className={cn(line.total && "font-medium")}>
              {line.label}
            </TableCell>
            <TableCell
              className={cn("text-right", line.total && "font-medium")}
            >
              <Figure>{line.now}</Figure>
            </TableCell>
            <TableCell className="text-muted-foreground text-right">
              <Figure>{line.before}</Figure>
            </TableCell>
            {changes ? (
              <TableCell className="text-muted-foreground text-right">
                <Figure>{line.change ?? null}</Figure>
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

/** Each part's lines, worded and formatted for the reader, from the month's figures and the month before's. */
export const useMonthLines = (now: KeptFigures, before: KeptFigures) => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  const perLiter = useMoneyRate();
  const perHead = usePerHeadPerDay();
  const liters = (amount: number | null | undefined) =>
    amount === null || amount === undefined
      ? null
      : t("owner.liters", { liters: formatNumber(amount, language) });
  const both = (
    label: string,
    say: (figures: KeptFigures) => ReactNode,
    total = false
  ): Line => ({ label, now: say(now), before: say(before), total });
  /** A sum this month and the month before, and the change between them, a rise with its sign. */
  const compared = (
    label: string,
    of: (figures: KeptFigures) => number | null | undefined,
    total = false
  ): Line => {
    const [is, was] = [of(now) ?? null, of(before) ?? null];
    const change =
      is === null || was === null ? null : Math.round(is) - Math.round(was);
    let said: ReactNode = null;
    if (change !== null) {
      said = change > 0 ? `+${asMoney(change)}` : asMoney(change);
    }
    return {
      label,
      now: is === null ? null : asMoney(is),
      before: was === null ? null : asMoney(was),
      change: said,
      total,
    };
  };
  return {
    glance: [
      compared(
        t("months.one.broughtIn"),
        (one) => one.results?.farm.broughtInMoney
      ),
      compared(
        t("months.one.beforeOverheads"),
        (one) => one.results?.farm.beforeOverheadsMoney
      ),
      compared(t("months.one.overheads"), (one) => one.overheads.amount),
      compared(
        t("months.one.afterOverheads"),
        (one) => one.results?.farm.afterOverheadsMoney,
        true
      ),
      {
        ...both(t("months.one.marginAfter"), (one) => {
          const margin = one.results?.farm.marginAfterPercent ?? null;
          return margin === null ? null : `${formatNumber(margin, language)}%`;
        }),
        change: null,
      },
      compared(
        t("months.one.dairyAfter"),
        (one) => one.results?.dairy.afterOverheadsMoney
      ),
      compared(
        t("months.one.fatteningAfter"),
        (one) => one.results?.fattening.afterOverheadsMoney
      ),
      compared(
        t("months.one.owedByBuyers"),
        (one) => one.atEnd?.receivables.owingMoney
      ),
      compared(t("months.one.theStore"), (one) => one.atEnd?.store.totalMoney),
      compared(
        t("months.one.farmsOwnMoney"),
        (one) => one.atEnd?.cash.farmsOwnMoney
      ),
    ],
    money: [
      both(t("money.totalIn"), (one) => asMoney(one.money.inMoney)),
      both(t("money.totalOut"), (one) => asMoney(one.money.outMoney)),
      both(t("money.net"), (one) => asMoney(one.money.netMoney), true),
    ],
    dairy: [
      both(t("months.col.milk"), (one) => asMoney(one.dairy.milkSoldMoney)),
      both(t("months.one.litersSold"), (one) => liters(one.dairy.litersSold)),
      both(t("months.one.fetchedPerLiter"), (one) =>
        one.dairy.fetchedPerLiterMoney === null
          ? null
          : perLiter(one.dairy.fetchedPerLiterMoney)
      ),
      both(t("months.col.dairyCost"), (one) => asMoney(one.dairy.chargedMoney)),
      both(t("months.one.litersToBulk"), (one) =>
        liters(one.dairy.litersToBulk)
      ),
      both(t("months.col.perCow"), (one) =>
        liters(one.dairy.litersPerCowMilked)
      ),
      both(t("months.one.costPerLiter"), (one) =>
        one.dairy.costPerLiterMoney === null
          ? null
          : perLiter(one.dairy.costPerLiterMoney)
      ),
    ],
    fattening: [
      both(t("months.col.fatteningCost"), (one) =>
        asMoney(one.fattening.chargedMoney)
      ),
      both(t("months.one.sold"), (one) =>
        formatNumber(one.fattening.sold, language)
      ),
      both(t("months.one.margins"), (one) =>
        one.fattening.marginMoney === null
          ? null
          : asMoney(one.fattening.marginMoney)
      ),
    ],
    receivables: [
      ...RECEIVABLE_AGES.map(({ age }) =>
        both(t(`months.one.age.${age}`), (one) =>
          one.atEnd
            ? asMoney(
                one.atEnd.receivables.ages.find((each) => each.age === age)
                  ?.owingMoney ?? 0
              )
            : null
        )
      ),
      both(
        t("months.one.owedInAll"),
        (one) => (one.atEnd ? asMoney(one.atEnd.receivables.owingMoney) : null),
        true
      ),
      both(t("months.one.ofItOverdue"), (one) =>
        one.atEnd ? asMoney(one.atEnd.receivables.overdueMoney) : null
      ),
    ],
    cashFlow: [
      both(t("months.one.began"), (one) =>
        one.cashFlow ? asMoney(one.cashFlow.openingMoney) : null
      ),
      both(t("money.totalIn"), (one) =>
        one.cashFlow ? asMoney(one.cashFlow.inMoney) : null
      ),
      both(t("money.totalOut"), (one) =>
        one.cashFlow ? asMoney(one.cashFlow.outMoney) : null
      ),
      both(t("months.one.movedBesides"), (one) =>
        one.cashFlow ? asMoney(one.cashFlow.differenceMoney) : null
      ),
      both(
        t("months.one.ended"),
        (one) => (one.cashFlow ? asMoney(one.cashFlow.closingMoney) : null),
        true
      ),
    ],
    cash: [
      both(t("months.one.inHands"), (one) =>
        one.atEnd ? asMoney(one.atEnd.cash.inHandsMoney) : null
      ),
      both(t("months.one.venturesInHands"), (one) =>
        one.atEnd ? asMoney(one.atEnd.cash.venturesInHandsMoney) : null
      ),
      both(t("months.one.farmsInHands"), (one) =>
        one.atEnd ? asMoney(one.atEnd.cash.farmsInHandsMoney) : null
      ),
      both(t("months.one.inAccounts"), (one) =>
        one.atEnd ? asMoney(one.atEnd.cash.inAccountsMoney) : null
      ),
      both(
        t("months.one.farmsOwn"),
        (one) => (one.atEnd ? asMoney(one.atEnd.cash.farmsOwnMoney) : null),
        true
      ),
    ],
    capital: [
      ...(
        [
          ["months.one.dairyHerd", "dairyMoney"],
          ["months.one.fatteningAnimals", "fatteningMoney"],
          ["months.one.inVentures", "venturesMoney"],
          ["months.one.theStore", "storeMoney"],
          ["months.one.owedByBuyers", "receivablesMoney"],
        ] as const
      ).map(([label, key]) =>
        both(t(label), (one) =>
          one.atEnd ? asMoney(one.atEnd.capital[key]) : null
        )
      ),
      both(
        t("months.one.capitalInAll"),
        (one) => (one.atEnd ? asMoney(one.atEnd.capital.totalMoney) : null),
        true
      ),
    ],
    monthsReturn: (
      [
        ["animals.side.dairy", "dairyPer100"],
        ["animals.side.fattening", "fatteningPer100"],
        ["months.one.farmVenturesApart", "farmPer100"],
      ] as const
    ).map(([label, key]) =>
      both(t(label), (one) => {
        const made = one.monthsReturn?.[key] ?? null;
        return made === null ? null : t("months.one.per100", { amount: made });
      })
    ),
    store: [
      both(t("months.one.feed"), (one) =>
        one.atEnd ? asMoney(one.atEnd.store.feedMoney) : null
      ),
      both(t("months.one.medicine"), (one) =>
        one.atEnd ? asMoney(one.atEnd.store.medicineMoney) : null
      ),
      both(
        t("months.one.storeInAll"),
        (one) => (one.atEnd ? asMoney(one.atEnd.store.totalMoney) : null),
        true
      ),
    ],
    overheads: [
      both(t("months.one.overheadsAmount"), (one) =>
        asMoney(one.overheads.amount)
      ),
      both(t("months.one.perHeadPerDay"), (one) =>
        perHead(one.overheads.perHeadPerDayMoney)
      ),
    ],
  };
};

/** The month's money in and out, by Category or by Side: this month only, as the accountant's summary adds it. */
export const MoneyBy = ({
  rows,
  heading,
}: {
  rows: readonly {
    key: string;
    name: string;
    inMoney: number;
    outMoney: number;
  }[];
  heading: string;
}) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  if (rows.length === 0) {
    return <EmptyState compact icon={Wallet} title={t("months.one.noMoney")} />;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className={COLUMN_HEADING}>{heading}</TableHead>
          <TableHead className={cn(COLUMN_HEADING, "text-right")}>
            {t("money.totalIn")}
          </TableHead>
          <TableHead className={cn(COLUMN_HEADING, "text-right")}>
            {t("money.totalOut")}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key}>
            <TableCell>{row.name}</TableCell>
            <TableCell className="text-right tabular-nums">
              {row.inMoney === 0 ? <Nothing /> : asMoney(row.inMoney)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {row.outMoney === 0 ? <Nothing /> : asMoney(row.outMoney)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

type SideResult = Figures["results"]["farm"];

/** What each Side came to this month, before and after its share of the overheads, the farm's as the total (ADR 0023). */
export const SideResults = ({ results }: { results: Figures["results"] }) => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  const percent = (amount: number | null) =>
    amount === null ? null : `${formatNumber(amount, language)}%`;
  const cells = (result: SideResult) => [
    asMoney(result.broughtInMoney),
    asMoney(result.beforeOverheadsMoney),
    percent(result.marginBeforePercent),
    asMoney(result.overheadsMoney),
    asMoney(result.afterOverheadsMoney),
    percent(result.marginAfterPercent),
  ];
  const rows: {
    key: string;
    name: string;
    cells: ReactNode[];
    total?: boolean;
  }[] = [
    {
      key: "dairy",
      name: t("animals.side.dairy"),
      cells: cells(results.dairy),
    },
    {
      key: "fattening",
      name: t("animals.side.fattening"),
      cells: cells(results.fattening),
    },
    {
      key: "ventures",
      name: t("months.one.venturesDays"),
      cells: [
        null,
        null,
        null,
        asMoney(results.restOfOverheadsMoney),
        null,
        null,
      ],
    },
    {
      key: "farm",
      name: t("months.one.wholeFarm"),
      cells: cells(results.farm),
      total: true,
    },
  ];
  const headings = [
    t("months.one.broughtIn"),
    t("months.one.beforeOverheads"),
    t("months.one.margin"),
    t("months.one.overheadsShare"),
    t("months.one.afterOverheads"),
    t("months.one.margin"),
  ];
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className={COLUMN_HEADING}>
            {t("months.one.bySide")}
          </TableHead>
          {headings.map((heading, index) => (
            <TableHead
              className={cn(COLUMN_HEADING, "text-right")}
              // The two margins share a heading; their place tells them apart.
              // oxlint-disable-next-line no-array-index-key -- fixed columns, never reordered
              key={index}
            >
              {heading}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key}>
            <TableCell className={cn(row.total && "font-medium")}>
              {row.name}
            </TableCell>
            {row.cells.map((cell, index) => (
              <TableCell
                className={cn("text-right", row.total && "font-medium")}
                // oxlint-disable-next-line no-array-index-key -- fixed columns, never reordered
                key={index}
              >
                <Figure>{cell}</Figure>
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

/** The months there are to read, newest first, the one shown among them. */
export const MonthPicker = ({
  months,
  chosen,
  onChoose,
}: {
  months: readonly string[];
  chosen: string;
  onChoose: (month: string) => void;
}) => {
  const { t, language } = useLanguage();
  const listed = months.includes(chosen);
  return (
    <NativeSelect
      aria-label={t("months.one.whichMonth")}
      className="sm:w-56"
      onChange={(event) => onChoose(event.target.value)}
      value={chosen}
    >
      {listed ? null : (
        <option value={chosen}>{saidMonth(chosen, language)}</option>
      )}
      {months.map((month) => (
        <option key={month} value={month}>
          {saidMonth(month, language)}
        </option>
      ))}
    </NativeSelect>
  );
};

/** What the month's figures leave out, and the money still waiting, in the words the monthly report says them with. */
export const LeftOut = ({ figures }: { figures: KeptFigures }) => {
  const { t } = useLanguage();
  const unpricedKg = figures.dairy.unpricedKg + figures.fattening.unpricedKg;
  const uncostedDoses =
    figures.dairy.uncostedDoses + figures.fattening.uncostedDoses;
  const unpricedInStore = figures.atEnd?.store.unpriced ?? 0;
  const accountsNotRead = figures.atEnd?.cash.accountsNotRead ?? 0;
  const unpricedDairy = figures.atEnd?.capital.unpricedDairy ?? 0;
  const said = [
    figures.money.awaitingCount > 0 ? t("months.awaiting") : null,
    unpricedKg > 0 ? t("costs.unpricedNote", { amount: unpricedKg }) : null,
    uncostedDoses > 0
      ? t("costs.uncostedNote", { amount: uncostedDoses })
      : null,
    unpricedInStore > 0
      ? t("months.one.storeUnpriced", { amount: unpricedInStore })
      : null,
    accountsNotRead > 0
      ? t("months.one.accountsNotRead", { amount: accountsNotRead })
      : null,
    unpricedDairy > 0
      ? t("months.one.unpricedDairy", { amount: unpricedDairy })
      : null,
  ].filter((line) => line !== null);
  if (said.length === 0) {
    return null;
  }
  return (
    <ul className="text-muted-foreground flex list-disc flex-col gap-1 ps-5 text-sm">
      {said.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
};

/** That each Venture keeps its own accounts, said whether or not any ran; and the ones that ran in the month, each a
 *  link to its own month. */
export const VenturesThatRan = ({
  ventures,
  month,
}: {
  ventures: OneMonth["ventures"];
  /** The month they ran in, which each link opens. */
  month: string;
}) => {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-muted-foreground">{t("months.one.ventures")}</p>
      {ventures.length === 0 ? (
        <EmptyState
          compact
          icon={Briefcase}
          title={t("months.one.noVentures")}
        />
      ) : (
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {ventures.map((venture) => (
            <li key={venture.id}>
              <Link
                className="underline-offset-4 hover:underline"
                params={{ ventureId: venture.id, month }}
                to="/ventures/$ventureId/months/$month"
              >
                {venture.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/** Why the farm would not lay the month out on paper, in the Owner's words. */
const PAPER_REFUSALS = {
  farm_identity_incomplete: "statements.farmNotRegistered",
  month_not_begun: "months.one.notBegun",
} as const;

/**
 * The month on paper, to print or save as a PDF, and to hand the accountant: laid out by the farm on its letterhead and
 * recorded as an Export, then shown to read in Bangla or English before it is printed.
 */
export const PrintTheMonth = ({ month }: { month: string }) => {
  const { t, language } = useLanguage();
  const refused = useRefused(PAPER_REFUSALS);
  const [paper, setPaper] = useState<PaperDocument | null>(null);
  const laying = useMutation(
    orpc.monthlyReport.monthPaper.mutationOptions({
      onError: refused,
      onSuccess: ({ document }) => setPaper(document),
    })
  );
  return (
    <>
      <Button
        disabled={laying.isPending}
        onClick={() => laying.mutate({ month })}
        type="button"
        variant="outline"
      >
        <Printer aria-hidden data-icon="inline-start" />
        {t("common.print")}
      </Button>
      <PaperDialog
        onClose={() => setPaper(null)}
        paper={paper}
        title={t("months.one.title", { month: saidMonth(month, language) })}
        wording={null}
      />
    </>
  );
};

/** The month as a CSV for the accountant, saved to this computer under the name the farm stamped it with; an Export as
 *  the paper is. */
export const TheMonthAsCsv = ({ month }: { month: string }) => {
  const { t } = useLanguage();
  const refused = useRefused(PAPER_REFUSALS);
  const saving = useMutation(
    orpc.monthlyReport.monthCsv.mutationOptions({
      onError: refused,
      onSuccess: ({ csv, fileName }) => saveCsv(fileName, csv),
    })
  );
  return (
    <Button
      disabled={saving.isPending}
      onClick={() => saving.mutate({ month })}
      type="button"
      variant="outline"
    >
      <FileSpreadsheet aria-hidden data-icon="inline-start" />
      {t("exports.csv")}
    </Button>
  );
};
