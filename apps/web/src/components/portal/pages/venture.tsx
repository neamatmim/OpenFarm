import { hasEnded, startOfFarmDay } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { cn } from "@OpenFarm/ui/lib/utils";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Beef,
  CalendarClock,
  FileText,
  Landmark,
  PieChart,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";

import type { TheirAgreements } from "@/components/investors/investor-agreements";
import { Nothing, SaidDate } from "@/components/list-cells";
import {
  EmptyState,
  Loaded,
  Page,
  PageHeader,
  Section,
} from "@/components/page";
import type { Figure } from "@/components/page-kit";
import { PageTabs, SummaryFigures } from "@/components/page-kit";
import { FiguresAsAt } from "@/components/portal/figures-as-at";
import { HowToPay } from "@/components/portal/how-to-pay";
import { PortalPapers } from "@/components/portal/portal-papers";
import { VentureSkeleton } from "@/components/portal/portal-skeletons";
import {
  usePortalPlaces,
  useTheirAnimalPhoto,
  useTheirPortfolio,
  useTheirVenture,
} from "@/components/portal/portal-source";
import { HisProjectionSection } from "@/components/portal/projection";
import { WeightLine } from "@/components/portal/weight-line";
import { StageTrack } from "@/components/ventures/stage-track";
import { useLanguage } from "@/i18n/language-provider";
import { CHARGE_WORD } from "@/lib/charge-words";
import { useTaka } from "@/lib/taka";
import type { client } from "@/utils/orpc";

type Today = Awaited<ReturnType<typeof client.portal.venture>>;

const TABS = ["animals", "spending", "papers"] as const;
type Tab = (typeof TABS)[number];

/** Kilogrammes as the reader writes them, or null where nobody has weighed. */
const saidKg = (kg: number | null, said: ReturnType<typeof useLanguage>) =>
  kg === null
    ? null
    : said.t("portal.kg", { kg: formatNumber(kg, said.language) });

/** What an approved Settlement came to on their paper, as their portfolio answers it. */
type HisSettlement = NonNullable<
  TheirAgreements["agreements"][number]["settlement"]
>;

/**
 * The four figures their part of the Venture is read by: their capital and the split always, then the herd and the
 * days to the sale window while it runs — and, once it is settled, what they were owed and whether it was paid, since
 * a count of animals and days that have both run out says nothing any more.
 */
const useFigures = (
  today: Today,
  settlement: HisSettlement | null
): Figure[] => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const terms: Figure[] = [
    {
      label: t("portal.capital"),
      value: taka(today.his.capitalBdt),
      // What investors open the page to see, as the portfolio sets its capital first and largest.
      lead: true,
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
      icon: PieChart,
    },
  ];
  if (settlement) {
    return [
      ...terms,
      {
        label: t("portal.profit"),
        value: taka(settlement.shareBdt),
        icon: TrendingUp,
        tone: settlement.shareBdt < 0 ? "warning" : "neutral",
      },
      {
        label: t("portal.paidOut"),
        value: taka(settlement.payoutBdt),
        hint: settlement.paidOn
          ? t("portal.paidOnDay", {
              day: formatDate(startOfFarmDay(settlement.paidOn), language),
            })
          : t("investors.page.notPaidYet"),
        icon: Wallet,
      },
    ];
  }
  return [
    ...terms,
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

/** One figure set in its own shaded box, as the Spending tab sets its two budgets. */
const AVERAGE_BOX = "bg-muted/50 flex flex-col gap-0.5 rounded-lg p-3";

type HerAnimal = Today["herd"]["animals"][number];

/** One animal's photograph, captioned with her tag and the day it was taken; grey while it comes. */
const HerPhoto = ({
  agreementId,
  one,
  photoAt,
}: {
  agreementId: string;
  one: HerAnimal;
  photoAt: Date | string;
}) => {
  const photo = useTheirAnimalPhoto(agreementId, one.tagNumber, photoAt);
  const tile = "aspect-square w-full rounded-lg";
  let picture: ReactNode = <Skeleton className={tile} />;
  if (photo.data) {
    picture = (
      <img
        alt={one.tagNumber}
        className={cn("bg-muted border object-cover", tile)}
        height={112}
        src={`data:${photo.data.contentType};base64,${photo.data.data}`}
        width={112}
      />
    );
  } else if (photo.isError || photo.data === null) {
    // Gone from the Venture since the page was read, its photograph taken away, or no signal: a still tile rather
    // than a placeholder that pulses for ever.
    picture = <div className={cn("bg-muted border", tile)} />;
  }
  return (
    <figure className="flex w-28 shrink-0 flex-col gap-1.5">
      {picture}
      <figcaption className="flex flex-col text-xs">
        <span className="font-mono font-medium">{one.tagNumber}</span>
        <span className="text-muted-foreground">
          <SaidDate at={photoAt} />
        </span>
      </figcaption>
    </figure>
  );
};

/**
 * The standing animals' photographs, in a row that scrolls sideways on its own: the same photographs their progress
 * statement prints, so nothing is shown here that the paper does not. Nothing at all while none has one.
 */
const HerdPhotos = ({ today }: { today: Today }) => {
  const { t } = useLanguage();
  // An answer this phone kept from before the portal showed photographs says of none.
  const photographed = today.herd.animals.flatMap((one) =>
    one.photoAt ? [{ one, photoAt: one.photoAt }] : []
  );
  if (photographed.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{t("portal.photos")}</h3>
      <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 md:-mx-5 md:px-5">
        {photographed.map(({ one, photoAt }) => (
          <li key={one.tagNumber}>
            <HerPhoto
              agreementId={today.agreementId}
              one={one}
              photoAt={photoAt}
            />
          </li>
        ))}
      </ul>
    </div>
  );
};

/** One animal as a row of its own on a phone: her tag, what she arrived at and puts on a day, and what she weighs now
 *  and on which day. */
const HerRow = ({ one }: { one: HerAnimal }) => {
  const said = useLanguage();
  const { t, language } = said;
  const now = saidKg(one.latestKg, said);
  const arrived = saidKg(one.intakeKg, said);
  return (
    <li className="flex items-start justify-between gap-3 py-3 text-sm">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-mono font-medium">{one.tagNumber}</span>
        <span className="text-muted-foreground flex flex-col text-xs tabular-nums">
          {arrived ? (
            <span>{t("portal.arrivedKg", { kg: arrived })}</span>
          ) : null}
          {one.dailyGainKg === null ? null : (
            <span>
              {t("portal.kgADay", {
                kg: formatNumber(one.dailyGainKg, language),
              })}
            </span>
          )}
        </span>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="font-medium tabular-nums">{now ?? <Nothing />}</span>
        {one.latestAt ? (
          <span className="text-muted-foreground text-xs">
            <SaidDate at={one.latestAt} />
          </span>
        ) : null}
      </div>
    </li>
  );
};

/** How the animals are doing: what they came in at, what they weigh now, and what they put on a day. */
const Herd = ({ today }: { today: Today }) => {
  const said = useLanguage();
  const { t, language } = said;
  const kg = (value: number | null) => saidKg(value, said);
  const gain = today.herd.gainKgPerDay;
  // No animal standing and none ever weighed: three boxes of dashes say nothing, so say why there are none.
  const noHerd = today.herd.standing === 0 && today.herd.weighed === 0;
  if (noHerd) {
    const gone = today.herd.sold + today.herd.died > 0;
    return (
      <Section title={t("portal.herd")}>
        <EmptyState
          bare
          description={
            gone
              ? t("portal.animalsHint", {
                  sold: today.herd.sold,
                  died: today.herd.died,
                })
              : undefined
          }
          icon={Beef}
          title={gone ? t("portal.herdGone") : t("portal.herdNoneYet")}
        />
      </Section>
    );
  }
  // An answer this phone kept from before the portal said when the animals were weighed has no day to say.
  const lastWeighedAt = today.herd.lastWeighedAt ?? null;
  return (
    <Section
      description={
        <>
          {t("portal.herdHint", { weighed: today.herd.weighed })}
          {lastWeighedAt ? (
            <>
              {" "}
              {t("portal.lastWeighed", {
                day: formatDate(new Date(lastWeighedAt), language),
              })}
            </>
          ) : null}
        </>
      }
      title={t("portal.herd")}
    >
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div className={AVERAGE_BOX}>
          <dt className="text-muted-foreground">{t("portal.averageIntake")}</dt>
          <dd className="font-medium tabular-nums">
            {kg(today.herd.averageIntakeKg) ?? <Nothing />}
          </dd>
        </div>
        <div className={AVERAGE_BOX}>
          <dt className="text-muted-foreground">{t("portal.averageNow")}</dt>
          <dd className="font-medium tabular-nums">
            {kg(today.herd.averageLatestKg) ?? <Nothing />}
          </dd>
        </div>
        <div className={AVERAGE_BOX}>
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
      {/* An answer this phone kept from before the portal drew the line has no days to draw it over. */}
      <WeightLine weights={today.herd.weights ?? []} />
      <HerdPhotos today={today} />
      {today.herd.animals.length > 0 ? (
        <>
          {/* A phone lists them one to a row rather than four columns scrolled sideways. */}
          <ul className="divide-border flex flex-col divide-y sm:hidden">
            {today.herd.animals.map((one) => (
              <HerRow key={one.tagNumber} one={one} />
            ))}
          </ul>
          <div className="-mx-4 hidden overflow-x-auto sm:block md:-mx-5">
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
                      {/* The day of that weight, so one animal's "now" can be told from a month-old one. */}
                      {one.latestAt ? (
                        <span className="text-muted-foreground block text-xs">
                          <SaidDate at={one.latestAt} />
                        </span>
                      ) : null}
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
        </>
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
  const theirs = useTheirPortfolio();
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
  const theirs = useTheirPortfolio();
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

/**
 * A tab's view with the key dates beside it: the days that mark their part, read whichever view is open. Inside each
 * tab rather than beside the row of them, so the two cards start level.
 */
const WithKeyDates = ({
  today,
  children,
}: {
  today: Today;
  children: ReactNode;
}) => (
  <div className="grid items-start gap-4 lg:grid-cols-3">
    <div className="min-w-0 lg:col-span-2">{children}</div>
    <KeyDates today={today} />
  </div>
);

/** The page itself, once the Venture is read. */
const VentureToday = ({
  today,
  tab,
  readAt,
}: {
  today: Today;
  tab: Tab;
  /** When this answer came back from the farm. */
  readAt: number;
}) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const places = usePortalPlaces();
  const theirs = useTheirPortfolio();
  const mine = theirs.data?.agreements.find(
    (one) => one.id === today.agreementId
  );
  const figures = useFigures(today, mine?.settlement ?? null);
  return (
    <>
      {/* Back to where it is listed: the portfolio keeps the running ones, and those that have finished are read from
          the list of all their Ventures. */}
      {hasEnded(today.venture.state) ? (
        <Link
          className="text-muted-foreground hover:text-foreground -mb-2 inline-flex items-center gap-1 self-start text-sm"
          params={places.ventures.link.params}
          search={{ tab: "finished" }}
          to={places.ventures.link.to}
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t("portal.ventures.all")}
        </Link>
      ) : (
        <Link
          className="text-muted-foreground hover:text-foreground -mb-2 inline-flex items-center gap-1 self-start text-sm"
          params={places.home.link.params}
          to={places.home.link.to}
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t("portal.back")}
        </Link>
      )}
      <PageHeader
        description={t("portal.ventureHint")}
        meta={
          <>
            <FiguresAsAt readAt={readAt} />
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
      <SummaryFigures figures={figures} hintsOnPhone />
      {/* While their capital is owed. An answer this phone kept from before the farm said where to pay has none. */}
      <HowToPay paying={today.howToPay ?? null} />
      {/* An answer this phone kept from before the portal could show one has none. */}
      <HisProjectionSection projection={today.projection ?? null} />
      <PageTabs
        onChange={(value) =>
          navigate({
            ...places.venture(today.agreementId).link,
            replace: true,
            search: value === "animals" ? {} : { tab: value },
          })
        }
        tabs={[
          {
            value: "animals",
            label: t("portal.herd"),
            icon: Beef,
            content: (
              <WithKeyDates today={today}>
                <Herd today={today} />
              </WithKeyDates>
            ),
          },
          {
            value: "spending",
            label: t("portal.tab.spending"),
            icon: Wallet,
            content: (
              <WithKeyDates today={today}>
                <Money today={today} />
              </WithKeyDates>
            ),
          },
          {
            value: "papers",
            label: t("portal.papers"),
            icon: FileText,
            content: (
              <WithKeyDates today={today}>
                <Papers today={today} />
              </WithKeyDates>
            ),
          },
        ]}
        value={tab}
      />
    </>
  );
};

/** One Venture an Investor is in, as it stands today — the same figures the progress statement says, and none of
 *  anybody else's. */
export const PortalVenture = ({
  agreementId,
  tab = "animals",
}: {
  agreementId: string;
  tab?: Tab;
}) => {
  const today = useTheirVenture(agreementId);
  return (
    <Page>
      <Loaded query={today} skeleton={<VentureSkeleton />}>
        {today.data ? (
          <VentureToday
            readAt={today.dataUpdatedAt}
            tab={tab}
            today={today.data}
          />
        ) : null}
      </Loaded>
    </Page>
  );
};

/** What the address may say about this page: which of its views is open. */
export interface VentureSearch {
  tab?: Tab;
}

/** The address's word on which view is open, in the portal and in the Preview alike. */
export const ventureSearch = (
  search: Record<string, unknown>
): VentureSearch =>
  TABS.includes(search.tab as Tab) && search.tab !== "animals"
    ? { tab: search.tab as Tab }
    : {};
