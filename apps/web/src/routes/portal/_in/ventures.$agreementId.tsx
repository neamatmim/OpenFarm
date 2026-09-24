import { formatNumber } from "@OpenFarm/i18n";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Beef, CalendarClock, Landmark, Scale } from "lucide-react";
import type { ReactNode } from "react";

import { Nothing, SaidDate } from "@/components/list-cells";
import { Loaded, Page, PageHeader, Section } from "@/components/page";
import type { Figure } from "@/components/page-kit";
import { SummaryFigures } from "@/components/page-kit";
import { PortalPapers } from "@/components/portal/portal-papers";
import { StageTrack } from "@/components/ventures/stage-track";
import { useLanguage } from "@/i18n/language-provider";
import { CHARGE_WORD } from "@/lib/charge-words";
import { useTaka } from "@/lib/taka";
import { orpc } from "@/utils/orpc";

type Today = Awaited<ReturnType<typeof orpc.portal.venture.call>>;

/** Kilogrammes as the reader writes them, or null where nobody has weighed. */
const saidKg = (kg: number | null, said: ReturnType<typeof useLanguage>) =>
  kg === null
    ? null
    : said.t("portal.kg", { kg: formatNumber(kg, said.language) });

/** The four figures their part of the Venture is read by. */
const useFigures = (today: Today): Figure[] => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  return [
    {
      label: t("portal.capital"),
      value: taka(today.his.capitalBdt),
      hint: t("portal.unitsShare", {
        count: today.his.units,
        share: formatNumber(today.his.sharePercent, language),
      }),
      icon: Landmark,
    },
    {
      label: t("portal.split"),
      // The reader's own part as the figure, and the Farm's under it: the whole line is too long to read as one.
      value: t("portal.percent", {
        percent: formatNumber(today.his.investorsPercent, language),
      }),
      hint: t("portal.farmTakes", {
        percent: formatNumber(100 - today.his.investorsPercent, language),
      }),
    },
    {
      label: t("portal.animals"),
      value: formatNumber(today.herd.standing, language),
      hint: t("portal.animalsHint", {
        sold: today.herd.sold,
        died: today.herd.died,
      }),
      icon: Beef,
    },
    {
      label: t("portal.daysToWindow"),
      value: formatNumber(today.window.daysTo, language),
      hint: t("portal.windowHint"),
      icon: CalendarClock,
    },
  ];
};

/** How the animals are doing: what they came in at, what they weigh now, and what they put on a day. */
const Herd = ({ today }: { today: Today }) => {
  const said = useLanguage();
  const { t, language } = said;
  const kg = (value: number | null) => saidKg(value, said);
  const gain = today.herd.gainKgPerDay;
  return (
    <Section
      description={t("portal.herdHint", { weighed: today.herd.weighed })}
      title={t("portal.herd")}
    >
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{t("portal.averageIntake")}</dt>
          <dd className="font-medium tabular-nums">
            {kg(today.herd.averageIntakeKg) ?? <Nothing />}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{t("portal.averageNow")}</dt>
          <dd className="font-medium tabular-nums">
            {kg(today.herd.averageLatestKg) ?? <Nothing />}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{t("portal.dailyGain")}</dt>
          <dd className="font-medium tabular-nums">
            {gain === null ? (
              <Nothing />
            ) : (
              t("portal.kgADay", { kg: formatNumber(gain, language) })
            )}
          </dd>
        </div>
      </dl>
      {today.herd.animals.length > 0 ? (
        <div className="-mx-4 overflow-x-auto md:-mx-5">
          <table className="w-full min-w-[28rem] text-sm">
            <thead className="text-muted-foreground border-b text-xs">
              <tr>
                <th
                  className="px-4 py-2 text-start font-medium md:px-5"
                  scope="col"
                >
                  {t("portal.tag")}
                </th>
                <th className="px-4 py-2 text-end font-medium" scope="col">
                  {t("portal.intake")}
                </th>
                <th className="px-4 py-2 text-end font-medium" scope="col">
                  {t("portal.now")}
                </th>
                <th
                  className="px-4 py-2 text-end font-medium md:px-5"
                  scope="col"
                >
                  {t("portal.dailyGain")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {today.herd.animals.map((one) => (
                <tr key={one.tagNumber}>
                  <td className="px-4 py-2 font-mono md:px-5">
                    {one.tagNumber}
                  </td>
                  <td className="px-4 py-2 text-end tabular-nums">
                    {kg(one.intakeKg) ?? <Nothing />}
                  </td>
                  <td className="px-4 py-2 text-end tabular-nums">
                    {kg(one.latestKg) ?? <Nothing />}
                  </td>
                  <td className="px-4 py-2 text-end tabular-nums md:px-5">
                    {one.dailyGainKg === null ? (
                      <Nothing />
                    ) : (
                      formatNumber(one.dailyGainKg, language)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Section>
  );
};

/** Where the Venture's money has gone, by charge, and what is left of its two budgets. */
const Money = ({ today }: { today: Today }) => {
  const { t } = useLanguage();
  const taka = useTaka();
  const { spend } = today;
  return (
    <Section description={t("portal.moneyHint")} title={t("portal.money")}>
      <dl className="flex flex-col divide-y text-sm">
        {spend.charges.map((one) => (
          <div
            className={cn(
              "flex justify-between gap-4 py-2",
              // Every kind of charge is listed, so nothing looks left out; one nothing was spent on reads quieter.
              one.bdt === 0 && "text-muted-foreground"
            )}
            key={one.word}
          >
            <dt>{t(CHARGE_WORD[one.word])}</dt>
            <dd className="tabular-nums">{taka(one.bdt)}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 py-2 font-semibold">
          <dt>{t("portal.spentTotal")}</dt>
          <dd className="tabular-nums">{taka(spend.chargedBdt)}</dd>
        </div>
      </dl>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="bg-muted/50 flex flex-col gap-0.5 rounded-lg p-3">
          <dt className="text-muted-foreground">{t("portal.cattleBudget")}</dt>
          <dd className="font-medium tabular-nums">
            {t("portal.budgetLeft", {
              left: taka(spend.cattleBudgetLeftBdt),
              of: taka(spend.cattleBudgetBdt),
            })}
          </dd>
        </div>
        <div className="bg-muted/50 flex flex-col gap-0.5 rounded-lg p-3">
          <dt className="text-muted-foreground">{t("portal.runningBudget")}</dt>
          <dd className="font-medium tabular-nums">
            {t("portal.budgetSpent", {
              spent: taka(spend.runningSpentBdt),
              of: taka(spend.runningBudgetBdt),
            })}
          </dd>
        </div>
      </dl>
    </Section>
  );
};

/** Their three papers, each made as the Owner would print it, shown here to read and print. */
const Papers = ({ today }: { today: Today }) => {
  const { t } = useLanguage();
  const theirs = useQuery(orpc.portal.portfolio.queryOptions());
  const mine = theirs.data?.agreements.find(
    (one) => one.id === today.agreementId
  );
  return (
    <Section description={t("portal.papersHint")} title={t("portal.papers")}>
      <PortalPapers
        agreementId={today.agreementId}
        hasCapital={today.his.capitalBdt > 0 || Boolean(mine?.settlement)}
        settled={
          mine ? mine.settlement !== null : today.venture.state === "settled"
        }
      />
    </Section>
  );
};

/**
 * The days that mark their part in this Venture, in order: the day they signed, the day their capital came in, the
 * sale window, and the day their payout went once it has. Each is a day that happened or a day the Agreement names —
 * never a guess.
 */
const KeyDates = ({ today }: { today: Today }) => {
  const { t } = useLanguage();
  const theirs = useQuery(orpc.portal.portfolio.queryOptions());
  const mine = theirs.data?.agreements.find(
    (one) => one.id === today.agreementId
  );
  const [firstIn] = (theirs.data?.movements ?? [])
    .filter(
      (one) =>
        one.agreementId === today.agreementId && one.kind === "capital_in"
    )
    .map((one) => one.movedOn)
    .toSorted();
  // Named, not written into the list below: the check for untranslated words reads a less-than beside JSX as a tag.
  const windowReached = today.window.daysTo <= 0;
  const rows: { label: string; at: ReactNode; done: boolean }[] = [
    {
      label: t("portal.dates.signed"),
      at: mine ? <SaidDate at={mine.signedAt} /> : <Nothing />,
      done: Boolean(mine),
    },
    {
      label: t("portal.dates.capitalIn"),
      at: firstIn ? <SaidDate at={firstIn} /> : <Nothing />,
      done: Boolean(firstIn),
    },
    {
      label: t("portal.dates.window"),
      at: (
        <>
          <SaidDate at={today.window.start} /> –{" "}
          <SaidDate at={today.window.end} />
        </>
      ),
      done: windowReached,
    },
    {
      label: t("portal.dates.paidOut"),
      at: mine?.settlement?.paidOn ? (
        <SaidDate at={mine.settlement.paidOn} />
      ) : (
        <Nothing />
      ),
      done: Boolean(mine?.settlement?.paidOn),
    },
  ];
  return (
    <Section title={t("portal.dates.title")}>
      <ol className="flex flex-col">
        {rows.map((row, at) => (
          <li className="relative flex gap-3 pb-4 last:pb-0" key={row.label}>
            {at < rows.length - 1 ? (
              <span
                aria-hidden
                className="bg-border absolute start-[0.3125rem] top-4 bottom-0 w-px"
              />
            ) : null}
            <span
              aria-hidden
              className={cn(
                "mt-1.5 size-2.5 shrink-0 rounded-full border-2",
                row.done
                  ? "border-primary bg-primary"
                  : "border-muted-foreground/40 bg-background"
              )}
            />
            <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-sm">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-medium">{row.at}</span>
            </span>
          </li>
        ))}
      </ol>
    </Section>
  );
};

/** The page itself, once the Venture is read. */
const VentureToday = ({ today }: { today: Today }) => {
  const { t } = useLanguage();
  const figures = useFigures(today);
  return (
    <>
      <Link
        className="text-muted-foreground hover:text-foreground -mb-2 inline-flex items-center gap-1 self-start text-sm"
        to="/portal"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {t("portal.back")}
      </Link>
      <PageHeader
        description={t("portal.ventureHint")}
        meta={
          <>
            <span className="inline-flex items-center gap-1">
              <Scale aria-hidden className="size-4" />
              <SaidDate at={today.window.start} /> –{" "}
              <SaidDate at={today.window.end} />
            </span>
            {today.his.amendedOn ? (
              <span>
                {t("portal.amendedOn")} <SaidDate at={today.his.amendedOn} />
              </span>
            ) : null}
          </>
        }
        title={today.venture.name}
      />
      <StageTrack state={today.venture.state} />
      <SummaryFigures figures={figures} />
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <Herd today={today} />
          <Money today={today} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <KeyDates today={today} />
          <Papers today={today} />
        </div>
      </div>
    </>
  );
};

/** One Venture an Investor is in, as it stands today — the same figures the progress statement says, and none of
 *  anybody else's. */
const PortalVenture = () => {
  const { agreementId } = Route.useParams();
  const today = useQuery(
    orpc.portal.venture.queryOptions({ input: { agreementId } })
  );
  return (
    <Page>
      <Loaded query={today} skeleton={<Skeleton className="h-96 rounded-xl" />}>
        {today.data ? <VentureToday today={today.data} /> : null}
      </Loaded>
    </Page>
  );
};

export const Route = createFileRoute("/portal/_in/ventures/$agreementId")({
  component: PortalVenture,
});
