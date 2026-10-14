import { startOfFarmDay } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Link } from "@tanstack/react-router";
import { Landmark, Phone } from "lucide-react";
import { useState } from "react";

import { Section, StatusBadge } from "@/components/page";
import { TakeCapitalSheet } from "@/components/ventures/take-capital-sheet";
import { useLanguage } from "@/i18n/language-provider";
import { useMoney } from "@/lib/money";
import { SUMS_SAID } from "@/lib/sums-to-ring";
import type { orpc } from "@/utils/orpc";

/** This month's Monthly Sums, as the Owner rings about them. */
export type SumsToRing = Awaited<
  ReturnType<typeof orpc.investors.monthlySums.call>
>;
type Row = SumsToRing["rows"][number];

/** One Investor to ring: who, on which Venture, what to ask for and since when — and the phone, and the money in. */
const RowToRing = ({
  row,
  onCapitalIn,
}: {
  row: Row;
  onCapitalIn: (row: Row) => void;
}) => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  const day = (on: string) => formatDate(startOfFarmDay(on), language, "date");
  const when =
    row.daysBehind === null
      ? t("investors.sumsDueOn", { day: day(row.dueOn) })
      : t("investors.sumsBehindFor", {
          days: formatNumber(row.daysBehind, language),
          day: day(row.behindSince ?? row.dueOn),
        });
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2">
          <Link
            className="font-medium underline-offset-4 hover:underline"
            params={{ investorId: row.investorId }}
            to="/investors/$investorId"
          >
            {row.investor}
          </Link>
          <StatusBadge tone={SUMS_SAID[row.standing].tone}>
            {t(SUMS_SAID[row.standing].word)}
          </StatusBadge>
        </span>
        <span className="text-muted-foreground text-sm">
          <Link
            className="underline-offset-4 hover:underline"
            params={{ ventureId: row.ventureId }}
            to="/ventures/$ventureId/investors"
          >
            {row.venture}
          </Link>
          {` · ${when}`}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium tabular-nums">
          {asMoney(row.dueMoney)}
        </span>
        <a
          className="text-primary inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline"
          href={`tel:${row.phone}`}
        >
          <Phone aria-hidden className="size-4" />
          {row.phone}
        </a>
        <Button
          onClick={() => onCapitalIn(row)}
          size="sm"
          type="button"
          variant="outline"
        >
          <Landmark aria-hidden data-icon="inline-start" />
          {t("ventures.takeCapital")}
        </Button>
      </div>
    </li>
  );
};

/**
 * Whom to ring this month about their Monthly Sums, across every Venture paid by the month: missed first, then late,
 * then due — the list the Owner calls from, since the farm sends the Investor nothing (the Owner's decision,
 * 2026-10-02). On the Investors page because it is a list of people and their phones. Nothing at all when nobody is
 * owed for: a farm with no Venture paid by the month never sees it.
 */
export const SumsToRingSection = ({
  sums,
}: {
  sums: SumsToRing | undefined;
}) => {
  const { t } = useLanguage();
  const [taking, setTaking] = useState<Row | null>(null);
  const rows = sums?.rows ?? [];
  if (rows.length === 0) {
    return null;
  }
  return (
    <Section
      description={t("investors.sumsHint")}
      title={t("investors.sumsTitle")}
    >
      <ul className="divide-border divide-y">
        {rows.map((row) => (
          <RowToRing key={row.agreementId} onCapitalIn={setTaking} row={row} />
        ))}
      </ul>
      <TakeCapitalSheet
        agreementId={taking?.agreementId ?? null}
        onOpenChange={(open) => {
          if (!open) {
            setTaking(null);
          }
        }}
        open={taking !== null}
        venture={taking ? { id: taking.ventureId, name: taking.venture } : null}
      />
    </Section>
  );
};
