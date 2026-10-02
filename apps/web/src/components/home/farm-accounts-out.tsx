import { Link } from "@tanstack/react-router";
import { Landmark } from "lucide-react";

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
  ReturnType<typeof orpc.home.owner.call>
>["needsYou"]["farmAccountsOut"];

/**
 * The Farm's bKash numbers and bank accounts with a month their statement did not agree with, or one the farm has
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
            to="/admin/farm"
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
        <Link className={MORE_LINK} hash="farm-accounts" to="/admin/farm">
          {t("home.openList")}
        </Link>
      }
      rows={rows}
      tone="warning"
    />
  );
};
