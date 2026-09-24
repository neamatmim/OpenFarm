import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@OpenFarm/ui/components/dialog";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  Beef,
  CalendarClock,
  FileText,
  Landmark,
  Scale,
} from "lucide-react";
import { useState } from "react";

import { Nothing, SaidDate } from "@/components/list-cells";
import { Loaded, PageHeader, Section, StatusBadge } from "@/components/page";
import type { Figure } from "@/components/page-kit";
import { SummaryFigures } from "@/components/page-kit";
import type {
  Produced,
  StatementKind,
} from "@/components/ventures/investor-papers";
import { ProducedPaper } from "@/components/ventures/investor-papers";
import { useLanguage } from "@/i18n/language-provider";
import { CHARGE_WORD } from "@/lib/charge-words";
import { useRefused } from "@/lib/refused";
import { useTaka } from "@/lib/taka";
import { orpc } from "@/utils/orpc";

type Today = Awaited<ReturnType<typeof orpc.portal.venture.call>>;

/** What each paper is called, on its button and over it. */
const PAPER_WORD = {
  joining: "portal.paper.joining",
  progress: "portal.paper.progress",
  settlement: "portal.paper.settlement",
} as const satisfies Record<StatementKind, string>;

/** Why a paper did not come, in the Investor's words: the portal shut, their access taken away, or their sign-in's
 *  day over, while they read. */
const REFUSALS = {
  not_an_investor: "portal.refused.notAnInvestor",
  signed_in_too_long: "portal.endedHint",
  no_such_agreement: "statements.noSuchAgreement",
} as const;

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
          <div className="flex justify-between gap-4 py-2" key={one.word}>
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
  const refused = useRefused(REFUSALS);
  const [shown, setShown] = useState<Produced | null>(null);
  const making = useMutation(
    orpc.portal.paper.mutationOptions({ onError: refused })
  );
  const kinds: StatementKind[] =
    today.venture.state === "settled"
      ? ["joining", "progress", "settlement"]
      : ["joining", "progress"];
  return (
    <Section description={t("portal.papersHint")} title={t("portal.papers")}>
      <div className="flex flex-wrap gap-2">
        {kinds.map((kind) => (
          <Button
            disabled={making.isPending}
            key={kind}
            onClick={() =>
              making.mutate(
                { agreementId: today.agreementId, kind },
                {
                  onSuccess: (made) =>
                    setShown({ kind, text: made.text, photos: made.photos }),
                }
              )
            }
            type="button"
            variant="outline"
          >
            {making.isPending && making.variables?.kind === kind ? (
              <Spinner />
            ) : (
              <FileText aria-hidden data-icon="inline-start" />
            )}
            {t(PAPER_WORD[kind])}
          </Button>
        ))}
      </div>
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setShown(null);
          }
        }}
        open={shown !== null}
      >
        <DialogContent
          className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"
          closeLabel={t("common.close")}
        >
          <DialogHeader>
            <DialogTitle>{shown ? t(PAPER_WORD[shown.kind]) : ""}</DialogTitle>
          </DialogHeader>
          {shown ? <ProducedPaper produced={shown} /> : null}
        </DialogContent>
      </Dialog>
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
            <StatusBadge tone="neutral">
              {t(`ventures.state.${today.venture.state}`)}
            </StatusBadge>
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
      <SummaryFigures figures={figures} />
      <Herd today={today} />
      <Money today={today} />
      <Papers today={today} />
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
    <Loaded query={today} skeleton={<Skeleton className="h-96 rounded-xl" />}>
      {today.data ? <VentureToday today={today.data} /> : null}
    </Loaded>
  );
};

export const Route = createFileRoute("/portal/_in/ventures/$agreementId")({
  component: PortalVenture,
});
