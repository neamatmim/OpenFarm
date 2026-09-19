import type { MessageKey, MessageParams, Language } from "@OpenFarm/i18n";
import { formatNumber } from "@OpenFarm/i18n";
import { Link } from "@tanstack/react-router";
import { Handshake } from "lucide-react";

import {
  MORE_LINK,
  Opens,
  QueueGroup,
  QueueRow,
  ROW_LINK,
} from "@/components/home/queue";
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
  running_budget_low: {
    key: "ventureTrouble.runningBudgetLow",
    parts: (trouble, language) => ({
      left: formatNumber(trouble.leftBdt, language),
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

/** One thing wrong with one Venture, in the reader's own language and numerals. */
const TroubleLine = ({ trouble }: { trouble: VentureTrouble }) => {
  const { t, language } = useLanguage();
  const says = SAYS[trouble.word];
  // Narrowed by the word it was looked up by; the table's own types keep the two in step.
  const parts = (
    says.parts as (one: VentureTrouble, language: Language) => MessageParams
  )(trouble, language);
  return <>{t(says.key, parts)}</>;
};

/**
 * The Ventures that want the Owner, on the page she opens rather than on one she has to remember to go
 * to.
 *
 * Nothing at all when none of them does, and nothing at all on a farm with no Venture: `QueueGroup`
 * draws no heading over no rows, so a farm that never took anybody's money sees no change here.
 *
 * Each row leads to `/ventures` and no further. The act itself is a button on the Venture's own card —
 * check the bank, buy what is left — and there is no route to one Venture to land on: the whole screen
 * is one list of cards with sheets. Getting her to the card is as close as the app can take her today.
 */
export const VentureTroubles = ({
  ventures,
}: {
  ventures: VentureNeedingHer[];
}) => {
  const { t } = useLanguage();
  return (
    <QueueGroup
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
                  <TroubleLine trouble={trouble} />
                </span>
              ))}
            </span>
          }
          title={
            <Link className={ROW_LINK} to="/ventures">
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
