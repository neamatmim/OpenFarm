import { farmDayOf, monthRangeOf } from "@OpenFarm/domain";
import { formatDate } from "@OpenFarm/i18n";
import type { MessageKey } from "@OpenFarm/i18n";
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
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { ReactNode } from "react";

import { COLUMN_HEADING } from "@/components/data-table";
import { Nothing } from "@/components/list-cells";
import type { OneMonth } from "@/components/months/one-month";
import { Notice, Section, StatusBadge } from "@/components/page";
import { ReasonDialog } from "@/components/sign-off/reason-dialog";
import { AnimalLink } from "@/components/vet/vet-types";
import { useLanguage } from "@/i18n/language-provider";
import { useMoney } from "@/lib/money";
import { saidMonth } from "@/lib/months";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

type Closing = NonNullable<OneMonth["closing"]>;
type Change = NonNullable<OneMonth["changedAfterClosing"]>[number];

const CHANGE_WORD: Record<Change["change"], MessageKey> = {
  entered: "months.closing.entered",
  corrected: "months.closing.corrected",
  moved: "months.closing.moved",
  voided: "months.closing.voided",
};

/** Why an open month cannot be closed yet, and when it was last reopened. */
const ClosingNotes = ({
  closing,
  isWaiting,
}: {
  closing: Closing;
  isWaiting: boolean;
}) => {
  const { t, language } = useLanguage();
  return (
    <>
      {closing.ended ? null : (
        <Notice title={t("months.closing.notEnded")} tone="info" />
      )}
      {closing.ended && isWaiting ? (
        <Notice
          title={t("months.closing.waiting", { count: closing.waiting })}
          tone="warning"
        />
      ) : null}
      {closing.reopened ? (
        <Notice
          title={t("months.closing.reopenedOn", {
            day: formatDate(closing.reopened.at, language),
            reason: closing.reopened.reason,
          })}
          tone="info"
        />
      ) : null}
    </>
  );
};

/**
 * The Owner's word that a month is done (a **Closed Month**): closed, with the day; open again, with why; or, ended and
 * open, the act of closing it — held back while any of its own money still waits for her, and saying how much. A month
 * still going has nothing to close yet.
 */
export const MonthClosing = ({ closing }: { closing: Closing }) => {
  const { t, language } = useLanguage();
  const refused = useRefused();
  const [reopening, setReopening] = useState(false);
  const close = useMutation(
    orpc.monthlyReport.close.mutationOptions({
      onSuccess: () => toast.success(t("months.closing.closed")),
      onError: refused,
    })
  );
  const reopen = useMutation(
    orpc.monthlyReport.reopen.mutationOptions({
      onSuccess: () => {
        toast.success(t("months.closing.reopened"));
        setReopening(false);
      },
      onError: refused,
    })
  );
  const isWaiting = closing.waiting > 0;
  const closedOn = closing.closedAt
    ? formatDate(closing.closedAt, language)
    : "";
  const action = closing.closed ? (
    <Button onClick={() => setReopening(true)} variant="outline">
      {t("months.closing.reopen")}
    </Button>
  ) : (
    <Button
      disabled={!closing.ended || isWaiting || close.isPending}
      onClick={() => close.mutate({ month: closing.month })}
    >
      {t("months.closing.close")}
    </Button>
  );
  return (
    <Section
      action={action}
      description={t("months.closing.hint")}
      title={
        <span className="flex flex-wrap items-center gap-2">
          {t("months.closing.title")}
          {closing.closed ? (
            <StatusBadge tone="success">
              {t("months.closing.closedOn", { day: closedOn })}
            </StatusBadge>
          ) : null}
        </span>
      }
    >
      {closing.closed ? null : (
        <ClosingNotes closing={closing} isWaiting={isWaiting} />
      )}
      <ReasonDialog
        description={t("months.closing.reopenHint")}
        handleSubmit={(reason) =>
          reopen.mutate({ month: closing.month, reason })
        }
        label={t("months.closing.reason")}
        onOpenChange={setReopening}
        open={reopening}
        pending={reopen.isPending}
        submitLabel={t("months.closing.reopen")}
        title={t("months.closing.reopenTitle")}
      />
    </Section>
  );
};

/**
 * The page a changed record is found on, where one shows it: the cash in hand for a Handover or a Cash Count, the
 * Receivable for a Write-off, the supplier payments for one, and the money book over the month changed for any other
 * money still on the books. A record taken off, or a Bank Check, is named without a way to it.
 */
const ToTheRecord = ({
  change,
  children,
}: {
  change: Change;
  children: ReactNode;
}) => {
  const className = "hover:underline";
  if (change.source === "handover" || change.source === "cash_count") {
    return (
      <Link className={className} to="/money/cash">
        {children}
      </Link>
    );
  }
  if (change.source === "receivable_write_off") {
    return (
      <Link className={className} to="/money/receivables">
        {children}
      </Link>
    );
  }
  if (change.source === "supplier_payment" && change.change !== "voided") {
    return (
      <Link className={className} to="/money/supplier-payments">
        {children}
      </Link>
    );
  }
  if (change.source === "bank_check" || change.change === "voided") {
    return children;
  }
  const { until } = monthRangeOf(change.month);
  return (
    <Link
      className={className}
      search={{
        from: `${change.month}-01`,
        to: farmDayOf(new Date(until.getTime() - 1)),
      }}
      to="/money"
    >
      {children}
    </Link>
  );
};

/** The record a change was made to: what it was and whom it was with, the way to it, and the Animal's tag. */
const RecordCell = ({ change }: { change: Change }) => {
  const { t } = useLanguage();
  return (
    <span className="flex flex-wrap items-center gap-2">
      <ToTheRecord change={change}>
        {[t(change.recordWord), change.about].filter(Boolean).join(" · ")}
      </ToTheRecord>
      {change.tagNumber ? <AnimalLink tagNumber={change.tagNumber} /> : null}
    </span>
  );
};

/**
 * What the Owner changed this month in months already closed — entered, put right, moved or taken off, and what each
 * was — so a paper already handed over is known to have moved. Nothing drawn when nothing was.
 */
export const ChangedAfterClosing = ({
  changes,
}: {
  changes: readonly Change[];
}) => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  if (changes.length === 0) {
    return null;
  }
  const money = (amount: number | null) =>
    amount === null ? <Nothing /> : asMoney(amount);
  return (
    <Section
      description={t("months.closing.changedHint")}
      title={t("months.closing.changedTitle")}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={COLUMN_HEADING}>
              {t("months.closing.col.day")}
            </TableHead>
            <TableHead className={COLUMN_HEADING}>
              {t("months.closing.col.month")}
            </TableHead>
            <TableHead className={COLUMN_HEADING}>
              {t("months.closing.col.what")}
            </TableHead>
            <TableHead className={COLUMN_HEADING}>
              {t("months.closing.col.record")}
            </TableHead>
            <TableHead className={cn(COLUMN_HEADING, "text-right")}>
              {t("months.closing.col.before")}
            </TableHead>
            <TableHead className={cn(COLUMN_HEADING, "text-right")}>
              {t("months.closing.col.after")}
            </TableHead>
            <TableHead className={COLUMN_HEADING}>
              {t("months.closing.col.by")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {changes.map((one) => (
            <TableRow key={one.id}>
              <TableCell>{formatDate(one.changedAt, language)}</TableCell>
              <TableCell>{saidMonth(one.month, language)}</TableCell>
              <TableCell>{t(CHANGE_WORD[one.change])}</TableCell>
              <TableCell>
                <RecordCell change={one} />
              </TableCell>

              <TableCell className="text-right tabular-nums">
                {money(one.beforeMoney)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {money(one.afterMoney)}
              </TableCell>
              <TableCell>{one.by ?? <Nothing />}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Section>
  );
};
