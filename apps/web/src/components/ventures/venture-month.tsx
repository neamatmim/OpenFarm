import type { PaperDocument } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
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
import {
  Beef,
  FileSpreadsheet,
  Printer,
  Receipt,
  ReceiptText,
  ScrollText,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { COLUMN_HEADING } from "@/components/data-table";
import { Nothing } from "@/components/list-cells";
import { EmptyState, Section } from "@/components/page";
import { PaperDialog } from "@/components/ventures/paper-dialog";
import { KIND_WORD } from "@/components/ventures/venture-money";
import { useLanguage } from "@/i18n/language-provider";
import { CHARGE_WORD } from "@/lib/charge-words";
import { useMoney } from "@/lib/money";
import { saidMonth } from "@/lib/months";
import { useRefused } from "@/lib/refused";
import { saveCsv } from "@/lib/save-csv";
import type { client } from "@/utils/orpc";
import { orpc } from "@/utils/orpc";

/** One month of one Venture as the farm answers it. */
export type VentureMonth = Awaited<ReturnType<typeof client.ventures.month>>;

/** One month of one Venture, the Owner's alone. */
export const useVentureMonth = (
  ventureId: string,
  /** The month asked for; none for its latest. */
  month?: string,
  asked = true
) =>
  useQuery({
    ...orpc.ventures.month.queryOptions({
      input: month === undefined ? { ventureId } : { ventureId, month },
    }),
    enabled: asked,
  });

/** One line of a part: what it is, and its figure — or two, the month's and the run's to its end. */
interface Line {
  label: string;
  figures: readonly ReactNode[];
  /** A total, drawn heavier than the lines it adds. */
  total?: boolean;
}

/** A figure in a column, lined up with the ones above it; the dash where there is none. */
const Figure = ({ children }: { children: ReactNode }) =>
  children === null ? (
    <Nothing />
  ) : (
    <span className="tabular-nums">{children}</span>
  );

/** A part of the month as a table: each line beside its figures, under the headings given. */
const Part = ({
  headings,
  lines,
}: {
  headings: readonly string[];
  lines: readonly Line[];
}) => {
  const { t } = useLanguage();
  return (
    <Table className="max-w-3xl table-fixed">
      <colgroup>
        <col />
        {headings.map((heading) => (
          <col className="w-28 sm:w-44" key={heading} />
        ))}
      </colgroup>
      <TableHeader>
        <TableRow>
          <TableHead className={COLUMN_HEADING}>
            {t("months.one.line")}
          </TableHead>
          {headings.map((heading) => (
            <TableHead
              className={cn(COLUMN_HEADING, "text-right")}
              key={heading}
            >
              {heading}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((line) => (
          <TableRow key={line.label}>
            <TableCell className={cn(line.total && "font-medium")}>
              {line.label}
            </TableCell>
            {line.figures.map((figure, column) => (
              <TableCell
                className={cn("text-right", line.total && "font-medium")}
                // The columns are the headings', in their order, and never move.
                // oxlint-disable-next-line react/no-array-index-key
                key={column}
              >
                <Figure>{figure}</Figure>
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

/** Its animals as they stood: the heads at its start and end and what moved them, their weight and their gain. */
const TheHerd = ({ herd }: { herd: VentureMonth["herd"] }) => {
  const { t, language } = useLanguage();
  const count = (value: number) => formatNumber(value, language);
  const none =
    herd.atStart === 0 &&
    herd.atEnd === 0 &&
    herd.came.bought + herd.came.boughtAcross === 0;
  if (none) {
    return (
      <Section
        description={t("ventures.month.herdHint")}
        title={t("ventures.month.herd")}
      >
        <EmptyState bare icon={Beef} title={t("ventures.month.noAnimals")} />
      </Section>
    );
  }
  return (
    <Section
      description={t("ventures.month.herdHint")}
      title={t("ventures.month.herd")}
    >
      <Part
        headings={[t("ventures.month.heads")]}
        lines={[
          {
            label: t("ventures.month.atStart"),
            figures: [count(herd.atStart)],
          },
          {
            label: t("ventures.month.bought"),
            figures: [count(herd.came.bought)],
          },
          {
            label: t("ventures.month.boughtAcross"),
            figures: [count(herd.came.boughtAcross)],
          },
          { label: t("ventures.month.sold"), figures: [count(herd.went.sold)] },
          {
            label: t("ventures.month.soldAcross"),
            figures: [count(herd.went.soldAcross)],
          },
          { label: t("ventures.month.died"), figures: [count(herd.went.died)] },
          { label: t("ventures.month.lost"), figures: [count(herd.went.lost)] },
          {
            label: t("ventures.month.atEnd"),
            figures: [count(herd.atEnd)],
            total: true,
          },
        ]}
      />
      <ul className="text-muted-foreground flex flex-col gap-1 text-sm">
        {/* Said only of a herd still standing at the end: of none, there is nothing to weigh. */}
        {herd.atEnd > 0 ? (
          <li>
            {herd.atEndKg
              ? t("ventures.month.atEndKg", {
                  kg: formatNumber(herd.atEndKg.averageKg, language),
                  animals: herd.atEndKg.animals,
                })
              : t("ventures.month.noWeight")}
          </li>
        ) : null}
        <li>
          {herd.gainKgPerDay === null
            ? t("ventures.month.noGain")
            : t("ventures.month.gain", {
                kg: formatNumber(herd.gainKgPerDay, language),
                animals: herd.weighed,
              })}
        </li>
        {herd.notWeighed.length > 0 ? (
          <li>
            {t("ventures.month.notWeighed", {
              tags: herd.notWeighed.join(", "),
            })}
          </li>
        ) : null}
      </ul>
    </Section>
  );
};

/** Its charges by the Settlement's own lines: the month's, and the run's to its end. */
const TheCharges = ({
  charges,
  month,
}: {
  charges: VentureMonth["charges"];
  month: string;
}) => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  if (charges.every((one) => one.monthMoney === 0 && one.toEndMoney === 0)) {
    return (
      <Section
        description={t("ventures.month.chargesHint")}
        title={t("ventures.month.charges")}
      >
        <EmptyState bare icon={Receipt} title={t("ventures.month.noCharges")} />
      </Section>
    );
  }
  return (
    <Section
      description={t("ventures.month.chargesHint")}
      title={t("ventures.month.charges")}
    >
      <Part
        headings={[saidMonth(month, language), t("ventures.month.toEnd")]}
        lines={[
          ...charges.map((one) => ({
            label: t(CHARGE_WORD[one.line]),
            figures: [asMoney(one.monthMoney), asMoney(one.toEndMoney)],
          })),
          {
            label: t("ventures.month.total"),
            figures: [
              asMoney(charges.reduce((sum, one) => sum + one.monthMoney, 0)),
              asMoney(charges.reduce((sum, one) => sum + one.toEndMoney, 0)),
            ],
            total: true,
          },
        ]}
      />
    </Section>
  );
};

/** Its account from the month before's end to its own, each kind of movement in it, beside the month's Bank Check. */
const TheAccount = ({ account }: { account: VentureMonth["account"] }) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  const check = account.bankCheck;
  let said = t("ventures.month.bankNotRead");
  if (check?.stale) {
    said = t("ventures.month.bankStale", { read: asMoney(check.readMoney) });
  } else if (check?.matched) {
    said = t("ventures.month.bankMatched", { read: asMoney(check.readMoney) });
  } else if (check) {
    said = t("ventures.month.bankDiffers", {
      read: asMoney(check.readMoney),
      expected: asMoney(check.expectedMoney),
    });
  }
  return (
    <Section
      description={t("ventures.month.accountHint")}
      title={t("ventures.month.account")}
    >
      <Part
        headings={[t("ventures.month.money")]}
        lines={[
          {
            label: t("ventures.month.opening"),
            figures: [asMoney(account.openingMoney)],
          },
          ...account.moved.map((one) => ({
            label: `${one.direction === "in" ? "+" : "−"} ${t(KIND_WORD[one.kind])}`,
            figures: [asMoney(one.amountMoney)],
          })),
          {
            label: t("ventures.month.closing"),
            figures: [asMoney(account.closingMoney)],
            total: true,
          },
        ]}
      />
      {account.moved.length === 0 ? (
        <EmptyState
          compact
          icon={ScrollText}
          title={t("ventures.month.noMovements")}
        />
      ) : null}
      <p className="text-muted-foreground text-sm">{said}</p>
    </Section>
  );
};

/** What the month owes the Farm for what its animals ate and were dosed with, as the books stand. */
const TheReimbursement = ({
  owed,
}: {
  owed: VentureMonth["reimbursement"];
}) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  if (!owed) {
    return null;
  }
  return (
    <Section
      description={t("ventures.month.reimbursementHint")}
      title={t("ventures.month.reimbursement")}
    >
      <Part
        headings={[t("ventures.month.money")]}
        lines={[
          {
            label: t("ventures.month.comesTo"),
            figures: [asMoney(owed.comesToMoney)],
          },
          {
            label: t("ventures.month.paid"),
            figures: [asMoney(owed.paidMoney)],
          },
          {
            label: t("ventures.month.stillOwed"),
            figures: [asMoney(owed.stillOwedMoney)],
            total: true,
          },
        ]}
      />
    </Section>
  );
};

/** Each animal sold in it while the Venture's, against what she cost it: her price less her cost, never a Margin. */
const TheSold = ({ sold }: { sold: VentureMonth["sold"] }) => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  return (
    <Section
      description={t("ventures.month.soldHint")}
      title={t("ventures.month.soldTitle")}
    >
      {sold.length === 0 ? (
        <EmptyState
          bare
          icon={ReceiptText}
          title={t("ventures.month.noneSold")}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={COLUMN_HEADING}>
                {t("ventures.month.tag")}
              </TableHead>
              <TableHead className={COLUMN_HEADING}>
                {t("ventures.month.day")}
              </TableHead>
              <TableHead className={cn(COLUMN_HEADING, "text-right")}>
                {t("ventures.month.price")}
              </TableHead>
              <TableHead className={cn(COLUMN_HEADING, "text-right")}>
                {t("ventures.month.cost")}
              </TableHead>
              <TableHead className={cn(COLUMN_HEADING, "text-right")}>
                {t("ventures.month.lessCost")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sold.map((one) => (
              <TableRow key={`${one.tagNumber}-${String(one.soldAt)}`}>
                <TableCell>{one.tagNumber}</TableCell>
                <TableCell>
                  {formatDate(new Date(one.soldAt), language)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {asMoney(one.priceMoney)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {one.costMoney === null ? (
                    <Nothing />
                  ) : (
                    asMoney(one.costMoney)
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {one.lessCostMoney === null ? (
                    <Nothing />
                  ) : (
                    asMoney(one.lessCostMoney)
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Section>
  );
};

/** Against its plan to the month's end, where it has one. */
const ThePlan = ({ plan }: { plan: VentureMonth["againstPlan"] }) => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  if (!plan) {
    return null;
  }
  const kg = (value: number | null) =>
    value === null
      ? null
      : t("ventures.month.kg", { kg: formatNumber(value, language) });
  return (
    <Section
      description={t("ventures.month.planHint")}
      title={t("ventures.month.plan")}
    >
      <Part
        headings={[t("ventures.month.planned"), t("ventures.month.actual")]}
        lines={[
          {
            label: t("ventures.month.heads"),
            figures: [
              formatNumber(plan.plannedHeads, language),
              formatNumber(plan.boughtHeads, language),
            ],
          },
          {
            label: t("ventures.month.cattleMoney"),
            figures: [
              asMoney(plan.plannedCattleMoney),
              asMoney(plan.boughtMoney),
            ],
          },
          {
            label: t("ventures.month.runningMoney"),
            figures: [
              asMoney(plan.plannedRunningMoney),
              asMoney(plan.runningSpentMoney),
            ],
          },
          {
            label: t("ventures.month.weight"),
            figures: [kg(plan.plannedKg), kg(plan.reachedKg)],
          },
        ]}
      />
    </Section>
  );
};

/** Paid by the month: what its Agreements had due, had paid and had missed to the month's end. */
const TheSums = ({ sums }: { sums: VentureMonth["sums"] }) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  if (!sums) {
    return null;
  }
  return (
    <Section
      description={t("ventures.month.sumsHint")}
      title={t("ventures.month.sums")}
    >
      <Part
        headings={[t("ventures.month.money")]}
        lines={[
          { label: t("ventures.month.due"), figures: [asMoney(sums.dueMoney)] },
          {
            label: t("ventures.month.paid"),
            figures: [asMoney(sums.paidMoney)],
          },
          {
            label: t("ventures.month.missed"),
            figures: [asMoney(sums.missedMoney)],
            total: true,
          },
        ]}
      />
    </Section>
  );
};

/**
 * One month of one Venture, its parts in the spec's order: its animals, its charges, its account, the Reimbursement,
 * each animal sold, its plan and its Monthly Sums — then what a month cannot tell.
 */
export const TheVentureMonth = ({ one }: { one: VentureMonth }) => {
  const { t } = useLanguage();
  return (
    <>
      <TheHerd herd={one.herd} />
      <TheCharges charges={one.charges} month={one.month} />
      <TheAccount account={one.account} />
      <TheReimbursement owed={one.reimbursement} />
      <TheSold sold={one.sold} />
      <ThePlan plan={one.againstPlan} />
      <TheSums sums={one.sums} />
      <p className="text-muted-foreground text-sm">
        {t("ventures.month.leftOut")}
      </p>
    </>
  );
};

/** Why the farm would not lay a Venture's month out on paper, in the Owner's words. */
const PAPER_REFUSALS = {
  farm_identity_incomplete: "statements.farmNotRegistered",
  month_not_begun: "months.one.notBegun",
  venture_not_running: "ventures.month.notRunning",
} as const;

/**
 * A Venture's month on paper, to print or save as a PDF: laid out by the farm on its letterhead and recorded as an
 * Export, then shown to read in Bangla or English before it is printed.
 */
export const PrintTheVentureMonth = ({
  ventureId,
  month,
  title,
}: {
  ventureId: string;
  month: string;
  /** The paper's name on the dialog, as the page's own title says it. */
  title: string;
}) => {
  const { t } = useLanguage();
  const refused = useRefused(PAPER_REFUSALS);
  const [paper, setPaper] = useState<PaperDocument | null>(null);
  const laying = useMutation(
    orpc.ventures.monthPaper.mutationOptions({
      onError: refused,
      onSuccess: ({ document }) => setPaper(document),
    })
  );
  return (
    <>
      <Button
        disabled={laying.isPending}
        onClick={() => laying.mutate({ ventureId, month })}
        type="button"
        variant="outline"
      >
        <Printer aria-hidden data-icon="inline-start" />
        {t("common.print")}
      </Button>
      <PaperDialog
        onClose={() => setPaper(null)}
        paper={paper}
        title={title}
        wording={null}
      />
    </>
  );
};

/** A Venture's month as a CSV, saved to this computer under the name the farm stamped it with; an Export as the paper
 *  is. */
export const TheVentureMonthAsCsv = ({
  ventureId,
  month,
}: {
  ventureId: string;
  month: string;
}) => {
  const { t } = useLanguage();
  const refused = useRefused(PAPER_REFUSALS);
  const saving = useMutation(
    orpc.ventures.monthCsv.mutationOptions({
      onError: refused,
      onSuccess: ({ csv, fileName }) => saveCsv(fileName, csv),
    })
  );
  return (
    <Button
      disabled={saving.isPending}
      onClick={() => saving.mutate({ ventureId, month })}
      type="button"
      variant="outline"
    >
      <FileSpreadsheet aria-hidden data-icon="inline-start" />
      {t("exports.csv")}
    </Button>
  );
};
