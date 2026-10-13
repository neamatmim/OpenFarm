import { formatNumber } from "@OpenFarm/i18n";
import { Link } from "@tanstack/react-router";
import { CalendarCheck, Landmark } from "lucide-react";

import {
  MORE_LINK,
  Opens,
  QueueGroup,
  QueueRow,
} from "@/components/home/queue";
import { useLanguage } from "@/i18n/language-provider";
import { saidMonth } from "@/lib/months";
import { monthsStillOut } from "@/lib/ventures";
import type { orpc } from "@/utils/orpc";

/** The Farm Accounts with a month out against their statements, as the Owner's home is told them. */
export type FarmAccountsOutData = Awaited<
  ReturnType<typeof orpc.overview.get.call>
>["needsYou"]["farmAccountsOut"];

/**
 * The Farm's mobile money numbers and bank accounts with a month their statement did not agree with, or one the farm has
 * since changed its mind about — named on the Owner's home until she has read it again or said what she found out.
 * Each opens the accounts, where the statement is checked.
 */
export const FarmAccountsOutGroup = ({
  accounts,
  headless = false,
}: {
  /** Missing from an answer a phone kept from before Farm Accounts were checked. */
  accounts: FarmAccountsOutData | undefined;
  headless?: boolean;
}) => {
  const { t, language } = useLanguage();
  const months = (list: string[]) =>
    list.map((one) => saidMonth(one, language)).join(", ");
  const rows = (accounts ?? []).map((one) => {
    const { stale, disagreed } = monthsStillOut({
      ...one,
      lastCheckedMonth: null,
    });
    return (
      <QueueRow
        key={one.id}
        meta={[
          disagreed.length > 0
            ? t("farmAccounts.disagrees", { months: months(disagreed) })
            : "",
          stale.length > 0
            ? t("farmAccounts.stale", { months: months(stale) })
            : "",
        ]
          .filter(Boolean)
          .join(" · ")}
        title={
          <Link
            className="after:absolute after:inset-0 hover:underline"
            hash="farm-accounts"
            to="/farm/money"
          >
            {one.name}
          </Link>
        }
        trailing={<Opens />}
      />
    );
  });
  return (
    <QueueGroup
      headless={headless}
      icon={Landmark}
      label={t("farmAccounts.outOnHome")}
      more={
        <Link className={MORE_LINK} hash="farm-accounts" to="/farm/money">
          {t("home.openList")}
        </Link>
      }
      rows={rows}
      tone="warning"
    />
  );
};

/** Last month, open from the 7th, as the Owner's home is told it. */
export type MonthToCloseData = Awaited<
  ReturnType<typeof orpc.overview.get.call>
>["needsYou"]["monthToClose"];

/**
 * Last month, named from the 7th while it stands open: the Owner's to close (a **Closed Month**), once whatever of it
 * still waits for her word is seen to. Opens the month, where it is closed.
 */
export const MonthToCloseGroup = ({
  month,
}: {
  /** Missing from an answer a phone kept from before months were closed. */
  month: MonthToCloseData | undefined;
}) => {
  const { t, language } = useLanguage();
  if (!month) {
    return null;
  }
  return (
    <QueueGroup
      icon={CalendarCheck}
      label={t("months.closing.title")}
      rows={[
        <QueueRow
          key={month.month}
          meta={
            month.waiting > 0
              ? t("owner.monthToCloseWaiting", { count: month.waiting })
              : undefined
          }
          title={
            <Link
              className="after:absolute after:inset-0 hover:underline"
              params={{ month: month.month }}
              to="/monthly-report/$month"
            >
              {t("owner.monthToClose", {
                month: saidMonth(month.month, language),
              })}
            </Link>
          }
          trailing={<Opens />}
        />,
      ]}
      tone="info"
    />
  );
};

/** The Farm Accounts whose last month's statement nobody has checked, as the Owner's home is told them. */
export type FarmAccountsUnreadData = Awaited<
  ReturnType<typeof orpc.overview.get.call>
>["needsYou"]["farmAccountsUnread"];

/**
 * The Farm's mobile money numbers and bank accounts whose last month's statement nobody has checked yet, from the first
 * of the month: the monthly Bank Check asked for, the way a month's rent not entered is. Each opens the accounts, where
 * the statement is checked.
 */
export const FarmAccountsUnreadGroup = ({
  accounts,
}: {
  /** Missing from an answer a phone kept from before the unchecked statements were named. */
  accounts: FarmAccountsUnreadData | undefined;
}) => {
  const { t, language } = useLanguage();
  const rows = (accounts ?? []).map((one) => (
    <QueueRow
      key={one.id}
      meta={t("farmAccounts.unreadMonth", {
        month: saidMonth(one.oldestMonth, language),
        count: formatNumber(one.months, language),
      })}
      title={
        <Link
          className="after:absolute after:inset-0 hover:underline"
          hash="farm-accounts"
          to="/farm/money"
        >
          {one.name}
        </Link>
      }
      trailing={<Opens />}
    />
  ));
  return (
    <QueueGroup
      icon={Landmark}
      label={t("farmAccounts.unreadOnHome")}
      more={
        <Link className={MORE_LINK} hash="farm-accounts" to="/farm/money">
          {t("home.openList")}
        </Link>
      }
      rows={rows}
      tone="warning"
    />
  );
};
