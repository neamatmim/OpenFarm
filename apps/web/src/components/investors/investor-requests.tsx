import { formatNumber } from "@OpenFarm/i18n";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { SaidDate } from "@/components/list-cells";
import { Section, StatusBadge } from "@/components/page";
import {
  CLOSED_WORDS,
  STATE_TONE,
  STATE_WORDS,
} from "@/components/ventures/venture-requests";
import { useLanguage } from "@/i18n/language-provider";
import { useTaka } from "@/lib/taka";
import { orpc } from "@/utils/orpc";

type TheirRequest = Awaited<
  ReturnType<typeof orpc.investors.requests.call>
>[number];

/** One of their Requests: the Venture it was on, what they asked, the Owner's answer, and where it stands now. */
const RequestLine = ({ one }: { one: TheirRequest }) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  // An answer this phone kept from before the Owner could answer, or the farm close, has none of these.
  const promised = one.answeredUnits ?? null;
  const line = one.answerLine ?? null;
  const closedBecause = one.closedBecause ?? null;
  return (
    <li className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <Link
          className="font-medium break-words hover:underline"
          params={{ ventureId: one.ventureId }}
          hash="requests"
          search={{ tab: "investors" }}
          to="/ventures/$ventureId"
        >
          {one.ventureName}
        </Link>
        <span className="text-sm tabular-nums">
          {t("ventures.requests.unitsAndTaka", {
            units: formatNumber(one.units, language),
            taka: taka(one.bdt),
          })}
        </span>
        {one.note ? (
          <span className="text-sm break-words">
            <span className="text-muted-foreground">
              {`${t("ventures.requests.col.note")}: `}
            </span>
            {one.note}
          </span>
        ) : null}
        {promised === null ? null : (
          <span className="text-sm font-medium">
            {t("ventures.requests.answer.saidYes", {
              units: formatNumber(promised, language),
            })}
          </span>
        )}
        {closedBecause === null ? null : (
          <span className="text-muted-foreground text-sm">
            {t(CLOSED_WORDS[closedBecause])}
          </span>
        )}
        {one.state === "not_this_time" && line ? (
          <span className="border-l-2 pl-2 text-sm break-words">{line}</span>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col gap-1 sm:items-end">
        <StatusBadge tone={STATE_TONE[one.state]}>
          {t(STATE_WORDS[one.state])}
        </StatusBadge>
        <span className="text-muted-foreground text-xs">
          {`${t("ventures.requests.col.when")}: `}
          <SaidDate at={one.madeAt} withTime />
        </span>
      </div>
    </li>
  );
};

/**
 * One Investor's Requests to Join across every Venture, the newest first: what they asked for, the Owner's answer,
 * where each stands and why the farm closed it if it did — their whole conversation with the farm in one place. Each
 * leads to its Venture, where it is answered. Nothing for somebody who never asked through the portal.
 */
export const InvestorRequests = ({ investorId }: { investorId: string }) => {
  const { t } = useLanguage();
  const theirs = useQuery(
    orpc.investors.requests.queryOptions({ input: { id: investorId } })
  );
  const requests = theirs.data ?? [];
  if (requests.length === 0) {
    return null;
  }
  return (
    <Section
      description={t("investors.requests.hint")}
      title={t("ventures.requests.title")}
    >
      <ul className="divide-border -my-3 flex flex-col divide-y">
        {requests.map((one) => (
          <RequestLine key={one.id} one={one} />
        ))}
      </ul>
    </Section>
  );
};
