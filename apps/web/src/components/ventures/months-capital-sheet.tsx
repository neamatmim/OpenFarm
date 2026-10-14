import { farmDayOf } from "@OpenFarm/domain";
import { Checkbox } from "@OpenFarm/ui/components/checkbox";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { useInvestorNames } from "@/components/investors/investor-names";
import { EmptyState } from "@/components/page";
import { FormSheet, InsetPanel } from "@/components/page-kit";
import { ReceiptAllocationPreview } from "@/components/ventures/take-capital-sheet";
import { useLanguage } from "@/i18n/language-provider";
import { useFreshFor } from "@/lib/fresh-for";
import { useMoney } from "@/lib/money";
import type { GridLine } from "@/lib/month-grid";
import {
  gridIsReady,
  linesOfTheMonth,
  proposedAllocation,
  receiptsOf,
  refusedLineOf,
} from "@/lib/month-grid";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

/** One line of the grid: whose paper, whether the statement shows it, and what came, on which day, under which reference. */
const Line = ({
  line,
  name,
  refused,
  onChange,
}: {
  line: GridLine;
  name: string;
  refused: boolean;
  onChange: (line: GridLine) => void;
}) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  const id = `month-line-${line.agreementId}`;
  const proposed = line.came
    ? proposedAllocation(
        line.allocation,
        Number(line.amountMoney),
        line.movedOn
      )
    : null;
  return (
    <fieldset
      aria-invalid={refused || undefined}
      className="aria-invalid:border-destructive flex flex-col gap-3 rounded-lg border p-3"
    >
      <div className="flex items-center justify-between gap-3">
        <label
          className="flex items-center gap-2 font-medium"
          htmlFor={`${id}-came`}
        >
          <Checkbox
            checked={line.came}
            id={`${id}-came`}
            onCheckedChange={(came) =>
              onChange({ ...line, came: came === true })
            }
          />
          {name}
        </label>
        <span className="text-muted-foreground text-xs">
          {line.came ? t("ventures.monthGridCame") : asMoney(line.roomMoney)}
        </span>
      </div>
      {refused ? (
        <p className="text-destructive text-sm">{t("ventures.lineRefused")}</p>
      ) : null}
      {line.came ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            aria-label={t("ventures.amount")}
            inputMode="numeric"
            max={line.roomMoney}
            min={0.01}
            onChange={(event) =>
              onChange({ ...line, amountMoney: event.target.value })
            }
            step="0.01"
            type="number"
            value={line.amountMoney}
          />
          <Input
            aria-label={t("ventures.movedOn")}
            onChange={(event) =>
              onChange({ ...line, movedOn: event.target.value })
            }
            type="date"
            value={line.movedOn}
          />
          <Input
            aria-label={t("ventures.reference")}
            autoComplete="off"
            onChange={(event) =>
              onChange({ ...line, reference: event.target.value })
            }
            placeholder={t("ventures.reference")}
            value={line.reference}
          />
        </div>
      ) : null}
      {proposed ? (
        <ReceiptAllocationPreview
          allocation={line.allocation}
          proposed={proposed}
        />
      ) : null}
    </fieldset>
  );
};

/**
 * A month's capital for a Venture paid by the month, from the Venture Account's statement: one line a paper, filled
 * with what it is asked for by the month's end, the Owner ticking the lines the statement shows and writing each one's
 * day and reference. Written together or not at all; a line the farm refuses is marked, the rest kept as typed.
 */
export const MonthsCapitalSheet = ({
  venture,
  open,
  onOpenChange,
}: {
  venture: { id: string; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const nameOf = useInvestorNames();
  const agreements = useQuery({
    ...orpc.ventures.agreements.list.queryOptions({
      input: { ventureId: venture?.id ?? "" },
    }),
    enabled: venture !== null,
  });
  // The Investors' waiting Pay-in Notes: a line is filled from its note, and answers it when written.
  const notes = useQuery({
    ...orpc.ventures.payInNotes.list.queryOptions({
      input: { ventureId: venture?.id ?? "" },
    }),
    enabled: venture !== null,
  });
  const [lines, setLines] = useState<GridLine[]>([]);
  const [refusedAt, setRefusedAt] = useState<string | null>(null);
  const today = farmDayOf(new Date());
  const papers = agreements.data;
  // Filled again for another Venture, and whenever what its papers may still take has moved — a month written, a
  // receipt taken from a row — so a line never offers money the paper has had since. Left as typed otherwise.
  const waiting = (notes.data ?? []).filter((one) => one.state === "waiting");
  useFreshFor(
    venture && papers && notes.data
      ? `${venture.id}:${papers.map((one) => `${one.id}=${one.capitalLeftMoney}`).join(",")}:${waiting.map((one) => one.id).join(",")}`
      : undefined,
    () => {
      setLines(linesOfTheMonth(papers ?? [], today, notes.data ?? []));
      setRefusedAt(null);
    }
  );
  const taking = useMutation(
    orpc.ventures.takeMonthsCapital.mutationOptions({
      onError: (error) => {
        const sent = lines.filter((one) => one.came);
        const at = refusedLineOf(error);
        setRefusedAt(at === null ? null : (sent[at]?.agreementId ?? null));
        refused(error);
      },
      onSuccess: ({ received }) => {
        onOpenChange(false);
        toast.success(t("ventures.monthGridTaken", { count: received.length }));
      },
    })
  );
  const ticked = lines.filter((one) => one.came).length;
  const farmsOwn = (papers ?? []).some((one) => one.isFarm);
  return (
    <FormSheet
      description={t("ventures.monthGridHint")}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        venture &&
        taking.mutate({ ventureId: venture.id, receipts: receiptsOf(lines) })
      }
      open={open}
      pending={taking.isPending}
      ready={gridIsReady(lines)}
      submitLabel={t("ventures.monthGridSave", { count: ticked })}
      title={`${t("ventures.monthGrid")} · ${venture?.name ?? ""}`}
      wide
    >
      {lines.length === 0 ? (
        <EmptyState bare title={t("ventures.monthGridEmpty")} />
      ) : (
        lines.map((line) => (
          <Line
            key={line.agreementId}
            line={line}
            name={nameOf(line.investorId)}
            onChange={(changed) => {
              setRefusedAt(null);
              setLines(
                lines.map((one) =>
                  one.agreementId === changed.agreementId ? changed : one
                )
              );
            }}
            refused={refusedAt === line.agreementId}
          />
        ))
      )}
      {farmsOwn ? (
        <InsetPanel as="p" className="text-sm">
          {t("ventures.monthGridFarm", { act: t("ventures.takeCapital") })}
        </InsetPanel>
      ) : null}
    </FormSheet>
  );
};
