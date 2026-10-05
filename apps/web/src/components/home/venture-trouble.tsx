import { startOfFarmDay } from "@OpenFarm/domain";
import type { MessageKey, MessageParams, Language } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Link } from "@tanstack/react-router";
import { Handshake } from "lucide-react";

import {
  MORE_LINK,
  Opens,
  QueueGroup,
  QueueRow,
  ROW_LINK,
} from "@/components/home/queue";
import { PAY_IN_ANCHOR } from "@/components/ventures/venture-pay-in-notes";
import { useLanguage } from "@/i18n/language-provider";
import { saidMonth } from "@/lib/months";
import type { VentureNeedingHer, VentureTrouble } from "@/lib/ventures";

/**
 * What each kind of trouble is called where she reads it, and the figure that makes it worth reading.
 *
 * One table rather than a name table and a second cascade for the parts: the word decides both, so
 * deciding them in two places is how a line comes to be worded for one trouble and numbered for
 * another. Bound to the words `troubleWith` can give, so a new one fails to compile here rather than
 * leaving a blank line on the page she opens first thing in the morning.
 */
const SAYS: {
  [W in VentureTrouble["word"]]: {
    key: MessageKey;
    parts: (
      trouble: Extract<VentureTrouble, { word: W }>,
      language: Language
    ) => MessageParams;
  };
} = {
  decision_due: {
    key: "ventureTrouble.decisionDue",
    parts: (trouble, language) => ({
      day: formatDate(startOfFarmDay(trouble.decideBy), language),
      short: formatNumber(trouble.shortMoney, language),
    }),
  },
  pay_in_notes: {
    key: "ventureTrouble.payInNotes",
    parts: (trouble) => ({ count: trouble.count }),
  },
  running_budget_low: {
    key: "ventureTrouble.runningBudgetLow",
    parts: (trouble, language) => ({
      left: formatNumber(trouble.leftMoney, language),
    }),
  },
  past_wind_up: {
    key: "ventureTrouble.pastWindUp",
    parts: (trouble, language) => ({
      standing: formatNumber(trouble.standing, language),
    }),
  },
  bank_stale: {
    key: "ventureTrouble.bankStale",
    parts: (trouble, language) => ({
      months: trouble.months.map((one) => saidMonth(one, language)).join(", "),
    }),
  },
  bank_disagrees: {
    key: "ventureTrouble.bankDisagrees",
    parts: (trouble, language) => ({
      months: trouble.months.map((one) => saidMonth(one, language)).join(", "),
    }),
  },
};

/** One thing wrong with one Venture, in the reader's own language and numerals — Pay-in Notes leading straight to
 *  where they are checked. */
const TroubleLine = ({
  trouble,
  ventureId,
}: {
  trouble: VentureTrouble;
  ventureId: string;
}) => {
  const { t, language } = useLanguage();
  const says = SAYS[trouble.word];
  // Narrowed by the word it was looked up by; the table's own types keep the two in step.
  const parts = (
    says.parts as (one: VentureTrouble, language: Language) => MessageParams
  )(trouble, language);
  if (trouble.word === "pay_in_notes") {
    return (
      // Above the row's own link, which is stretched over the whole row: otherwise a tap here opens the Venture's page.
      <Link
        className="relative z-10 underline-offset-4 hover:underline"
        hash={PAY_IN_ANCHOR}
        params={{ ventureId }}
        to="/ventures/$ventureId/investors"
      >
        {t(says.key, parts)}
      </Link>
    );
  }
  return <>{t(says.key, parts)}</>;
};

/**
 * The Ventures that want the Owner, on the page she opens rather than on one she has to remember to go
 * to.
 *
 * Nothing at all when none of them does, and nothing at all on a farm with no Venture: `QueueGroup`
 * draws no heading over no rows, so a farm that never took anybody's money sees no change here.
 *
 * Each row leads to that Venture's own page, where the act the trouble asks for — check the bank, buy what
 * is left, bring in the rest or call it off — is a button at its head.
 */
export const VentureTroubles = ({
  ventures,
  headless,
}: {
  ventures: VentureNeedingHer[];
  /** Under a tab that already names it. */
  headless?: boolean;
}) => {
  const { t } = useLanguage();
  return (
    <QueueGroup
      headless={headless}
      icon={Handshake}
      label={t("ventureTrouble.title")}
      more={
        <Link className={MORE_LINK} to="/ventures">
          {t("home.openList")}
        </Link>
      }
      rows={ventures.map((one) => (
        <QueueRow
          key={one.id}
          meta={
            <span className="flex flex-col gap-0.5">
              {one.troubles.map((trouble) => (
                <span key={trouble.word}>
                  <TroubleLine trouble={trouble} ventureId={one.id} />
                </span>
              ))}
            </span>
          }
          title={
            <Link
              className={ROW_LINK}
              params={{ ventureId: one.id }}
              to="/ventures/$ventureId"
            >
              {one.name}
            </Link>
          }
          trailing={<Opens />}
        />
      ))}
      tone="warning"
    />
  );
};
