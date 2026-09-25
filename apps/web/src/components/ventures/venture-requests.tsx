import type { RequestToJoinState } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";
import type { MessageKey } from "@OpenFarm/i18n";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Inbox } from "lucide-react";

import { useInvestorNames } from "@/components/investors/investor-names";
import { SaidDate } from "@/components/list-cells";
import type { Tone } from "@/components/page";
import { EmptyState, Section, StatusBadge } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { useTaka } from "@/lib/taka";
import type { Venture } from "@/lib/ventures";
import { orpc } from "@/utils/orpc";

type RequestsRead = Awaited<ReturnType<typeof orpc.ventures.requests.call>>;
type OneRequest = RequestsRead["requests"][number];

/** How each place a Request can stand in reads at a glance, from the Owner's side: one waiting is work for her, where
 *  to the Investor it is only news to wait for. */
const STATE_TONE: Record<RequestToJoinState, Tone> = {
  waiting: "warning",
  come_and_sign: "info",
  not_this_time: "neutral",
  withdrawn: "neutral",
  signed: "success",
  closed: "neutral",
};

/** Where a Request stands, in the Owner's words. */
const STATE_WORDS = {
  waiting: "ventures.requests.state.waiting",
  come_and_sign: "ventures.requests.state.come_and_sign",
  not_this_time: "ventures.requests.state.not_this_time",
  withdrawn: "ventures.requests.state.withdrawn",
  signed: "ventures.requests.state.signed",
  closed: "ventures.requests.state.closed",
} as const satisfies Record<RequestToJoinState, MessageKey>;

/** What the Investor did, beneath their Request. */
const KIND_WORDS = {
  made: "ventures.requests.kind.made",
  changed: "ventures.requests.kind.changed",
  withdrawn: "ventures.requests.kind.withdrawn",
} as const satisfies Record<OneRequest["history"][number]["kind"], MessageKey>;

/** One figure beside the target and the Floor. */
const Total = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className="flex min-w-0 flex-col gap-0.5">
    <dt className="text-muted-foreground text-xs">{label}</dt>
    <dd className="font-medium break-words tabular-nums">{children}</dd>
  </div>
);

/** One Request: who asked, for what, with their note and where it stands, and beneath it everything they did to it. */
const RequestRow = ({ one }: { one: OneRequest }) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const nameOf = useInvestorNames();
  // Only worth a list once they did more than ask: one line that repeats the row says nothing.
  const didMore = one.history.length > 1;
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <Link
            className="font-medium break-words hover:underline"
            params={{ investorId: one.investorId }}
            to="/investors/$investorId"
          >
            {nameOf(one.investorId)}
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
      </div>
      {didMore ? (
        <ol
          aria-label={t("ventures.requests.history")}
          className="text-muted-foreground border-l-2 pl-3 text-xs"
        >
          {one.history.map((step) => (
            <li className="flex flex-wrap gap-x-2" key={step.id}>
              <SaidDate at={step.at} withTime />
              <span>
                {t(KIND_WORDS[step.kind], {
                  units: formatNumber(step.units, language),
                })}
              </span>
              {step.note ? (
                <span className="break-words italic">{step.note}</span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </li>
  );
};

/**
 * What invited Investors have asked for through the portal on this Venture, with what each did to their Request, and
 * beside them the Units signed and the Units asked for and waiting against the target and the Floor — so the Owner
 * can tell whether the Requests would reach the Floor while the signatures do not yet. Nothing here binds anybody.
 */
export const VentureRequests = ({ venture }: { venture: Venture }) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const read = useQuery(
    orpc.ventures.requests.queryOptions({ input: { ventureId: venture.id } })
  );
  if (read.isPending) {
    return <Skeleton className="h-32 rounded-xl" />;
  }
  const requests = read.data?.requests ?? [];
  // A Venture nobody can be asked about, and nobody has: nothing to say, and no box saying so.
  const askable = venture.state === "open" && (venture.shownInPortal ?? false);
  if (requests.length === 0 && !askable) {
    return null;
  }
  const totals = read.data?.totals;
  const unitsAndTaka = (units: number, bdt: number) =>
    t("ventures.requests.unitsAndTaka", {
      units: formatNumber(units, language),
      taka: taka(bdt),
    });
  return (
    <Section
      description={t("ventures.requests.hint")}
      title={t("ventures.requests.title")}
    >
      <div className="flex flex-col gap-4">
        {totals ? (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
            <Total label={t("ventures.requests.signed")}>
              {unitsAndTaka(totals.signedUnits, totals.signedBdt)}
            </Total>
            <Total label={t("ventures.requests.waiting")}>
              {unitsAndTaka(totals.waitingUnits, totals.waitingBdt)}
            </Total>
            <Total label={t("ventures.requests.target")}>
              {taka(venture.targetCapitalBdt)}
            </Total>
            <Total label={t("ventures.requests.floor")}>
              {taka(venture.floorBdt)}
            </Total>
          </dl>
        ) : null}
        {requests.length === 0 ? (
          <EmptyState bare icon={Inbox} title={t("ventures.requests.none")} />
        ) : (
          <ul className="divide-border -my-3 flex flex-col divide-y">
            {requests.map((one) => (
              <RequestRow key={one.id} one={one} />
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
};
