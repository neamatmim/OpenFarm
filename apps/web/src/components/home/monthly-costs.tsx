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
import { useLanguage } from "@/i18n/language-provider";
import { saidMonth } from "@/lib/months";
import type { orpc } from "@/utils/orpc";

/** What of the farm's month has not been entered yet, as the home screens are told it. */
export type MonthlyCostsData = Awaited<
  ReturnType<typeof orpc.home.manager.call>
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
          onEnter={() => enter(key, { categoryId: row.categoryId })}
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
          onEnter={() =>
            enter(key, {
              categoryId: row.categoryId ?? undefined,
              counterparty: row.personName,
              wageMonth: row.month,
            })
          }
          title={t("home.wageNotEntered", { name: row.personName })}
        />
      );
    }),
  ];
  return (
    <>
      <QueueGroup
        headless={headless}
        icon={CalendarClock}
        label={t("home.monthlyCosts")}
        more={
          <Link className={MORE_LINK} to="/money">
            {t("home.openList")}
          </Link>
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
    </>
  );
};
