import { Link } from "@tanstack/react-router";
import { CalendarClock } from "lucide-react";
import { useState } from "react";

import {
  MORE_LINK,
  Opens,
  QueueGroup,
  QueueRow,
} from "@/components/home/queue";
import { categoryName } from "@/components/money";
import type { EnterMoneyStart } from "@/components/money-entry";
import { EnterMoneySheet } from "@/components/money-entry";
import { WageRunSheet } from "@/components/money/wage-run-sheet";
import { useLanguage } from "@/i18n/language-provider";
import { saidMonth } from "@/lib/months";
import { startOfMissingCost, startOfMissingWage } from "@/lib/wage-run";
import type { orpc } from "@/utils/orpc";

/** What of the farm's month has not been entered yet, as the home screens are told it. */
export type MonthlyCostsData = Awaited<
  ReturnType<typeof orpc.home.get.call>
>["queue"]["monthlyCosts"];

/** A row that opens the money entry with what is missing already filled. */
const Missing = ({
  title,
  month,
  onEnter,
}: {
  title: string;
  month: string;
  onEnter: () => void;
}) => {
  const { language } = useLanguage();
  return (
    <QueueRow
      meta={saidMonth(month, language)}
      title={
        <button
          className="text-start after:absolute after:inset-0 hover:underline"
          onClick={onEnter}
          type="button"
        >
          {title}
        </button>
      }
      trailing={<Opens />}
    />
  );
};

/**
 * The rent, the electricity and the wages the month has nothing entered for yet (CONTEXT.md: **Monthly Cost**): a month
 * missing is otherwise read as a cheaper month. Each opens the money entry with the Category — and for a wage the
 * person and the month — already filled, and says the month it is for. A thing to enter, never money owed.
 */
export const MonthlyCostsGroup = ({
  monthlyCosts,
  headless = false,
}: {
  /** Under a tab that already says its name, icon and count. */
  headless?: boolean;
  /** Missing from an answer a phone kept from before there were Monthly Costs. */
  monthlyCosts: MonthlyCostsData | undefined;
}) => {
  const { t, language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [payingWages, setPayingWages] = useState(false);
  const [entering, setEntering] = useState<{
    key: string;
    start: EnterMoneyStart;
  } | null>(null);
  const enter = (key: string, start: EnterMoneyStart) => {
    setEntering({ key, start });
    setOpen(true);
  };
  const rows = [
    ...(monthlyCosts?.costs ?? []).map((row) => {
      const key = `${row.categoryId} ${row.month}`;
      return (
        <Missing
          key={key}
          month={row.month}
          onEnter={() => enter(key, startOfMissingCost(row))}
          title={categoryName(row, language)}
        />
      );
    }),
    ...(monthlyCosts?.wages ?? []).map((row) => {
      // By the person's record, not the name — defaulted for an answer a phone kept from before it carried one.
      const key = `wage ${row.personId ?? row.personName} ${row.month}`;
      return (
        <Missing
          key={key}
          month={row.month}
          onEnter={() => enter(key, startOfMissingWage(row))}
          title={t("home.wageNotEntered", { name: row.personName })}
        />
      );
    }),
  ];
  // A wage named here is one of the month's: all of them are paid from one sheet, opened on that month.
  const wageMonth = (monthlyCosts?.wages ?? [])[0]?.month;
  return (
    <>
      <QueueGroup
        headless={headless}
        icon={CalendarClock}
        label={t("home.monthlyCosts")}
        more={
          <span className="flex items-center gap-3">
            {wageMonth ? (
              <button
                className={MORE_LINK}
                onClick={() => setPayingWages(true)}
                type="button"
              >
                {t("wageRun.open")}
              </button>
            ) : null}
            <Link className={MORE_LINK} to="/money">
              {t("home.openList")}
            </Link>
          </span>
        }
        rows={rows}
        tone="warning"
      />
      {entering ? (
        // Drawn afresh for each row, so it opens with that row's Category and not what the last one left typed.
        <EnterMoneySheet
          key={entering.key}
          onOpenChange={setOpen}
          open={open}
          startWith={entering.start}
        />
      ) : null}
      {wageMonth ? (
        <WageRunSheet
          key={wageMonth}
          month={wageMonth}
          onOpenChange={setPayingWages}
          open={payingWages}
        />
      ) : null}
    </>
  );
};
