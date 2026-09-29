import { startOfFarmDay } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Link } from "@tanstack/react-router";
import { HandCoins } from "lucide-react";

import {
  MORE_LINK,
  Opens,
  QueueGroup,
  QueueRow,
} from "@/components/home/queue";
import { phoneLink } from "@/components/investors/phone-link";
import { useLanguage } from "@/i18n/language-provider";
import type { orpc } from "@/utils/orpc";

/** A buyer whose Baki has gone past its day, as the home screens are told it. */
export type OverdueBuyers = Awaited<
  ReturnType<typeof orpc.home.manager.call>
>["queue"]["bakiOverdue"];

/**
 * Buyers whose Baki has gone past the day they promised, or the farm's days for it: the longest late first, each with
 * what is overdue, since when, and a number to ring. The Owner is also told of one sold to on Baki again while late —
 * the farm lending more to somebody who has not paid what is due. Never refused and never sent to the buyer.
 */
export const BakiOverdueGroup = ({
  buyers,
  forTheOwner = false,
  headless = false,
}: {
  /** Missing from an answer a phone kept from before Baki was written down. */
  buyers: OverdueBuyers | undefined;
  forTheOwner?: boolean;
  headless?: boolean;
}) => {
  const { t, language } = useLanguage();
  const rows = (buyers ?? []).map((buyer) => (
    <QueueRow
      key={buyer.counterpartyId}
      meta={
        <>
          <span className="text-warning tabular-nums">
            {t("home.bakiOverdueSince", {
              taka: formatNumber(buyer.overdueBdt, language),
              day: formatDate(
                startOfFarmDay(buyer.overdueSince),
                language,
                "date"
              ),
            })}
          </span>
          {phoneLink(buyer.phone)}
          {forTheOwner && buyer.soldAgainWhileOverdue ? (
            <span className="text-danger">{t("home.bakiSoldAgain")}</span>
          ) : null}
        </>
      }
      title={
        <Link
          className="after:absolute after:inset-0 hover:underline"
          search={{ tab: "baki" }}
          to="/money"
        >
          {buyer.name}
        </Link>
      }
      trailing={<Opens />}
    />
  ));
  if (rows.length === 0) {
    return null;
  }
  return (
    <QueueGroup
      headless={headless}
      icon={HandCoins}
      label={t("home.bakiOverdue")}
      more={
        <Link className={MORE_LINK} search={{ tab: "baki" }} to="/money">
          {t("alerts.seeWhoOwes")}
        </Link>
      }
      rows={rows}
      tone="warning"
    />
  );
};
