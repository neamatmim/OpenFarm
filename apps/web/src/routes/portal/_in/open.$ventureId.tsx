import { startOfFarmDay } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Badge } from "@OpenFarm/ui/components/badge";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Sprout } from "lucide-react";

import { SaidDate } from "@/components/list-cells";
import {
  EmptyState,
  Loaded,
  Page,
  PageHeader,
  Section,
} from "@/components/page";
import type { OpenVenture } from "@/components/portal/open-ventures";
import { Fact } from "@/components/portal/open-ventures";
import { AskToJoin } from "@/components/portal/requests-to-join";
import { useLanguage } from "@/i18n/language-provider";
import { useTaka } from "@/lib/taka";
import { orpc } from "@/utils/orpc";

const WHOLE = 100;

/**
 * One offered Venture, read before anything is asked: its terms, the split the farm signs on, the farm's own words,
 * and the rules said plainly — the Floor refund, a loss off capital, nothing guaranteed, joining only by signing in
 * person. Nothing about anybody else: not who has signed, not how many Units are left.
 */
const TheOffer = ({ one }: { one: OpenVenture }) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  return (
    <>
      <PageHeader
        meta={
          one.takingRequests ? null : (
            <Badge variant="secondary">{t("portal.open.closed")}</Badge>
          )
        }
        title={one.name}
      />
      {one.words ? (
        <Section title={t("portal.open.fromTheFarm")}>
          <p className="text-sm break-words whitespace-pre-line">{one.words}</p>
        </Section>
      ) : null}
      <Section title={t("ventures.page.terms")}>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
          <Fact label={t("portal.open.unit")}>{taka(one.unitPriceBdt)}</Fact>
          <Fact label={t("portal.open.target")}>
            {taka(one.targetCapitalBdt)}
          </Fact>
          <Fact label={t("portal.open.floor")}>{taka(one.floorBdt)}</Fact>
          <Fact label={t("portal.open.decideBy")}>
            <SaidDate at={one.decideBy} />
          </Fact>
          <Fact label={t("portal.window")}>
            <SaidDate at={one.targetWindow.start} />
            {" – "}
            <SaidDate at={one.targetWindow.end} />
          </Fact>
          <Fact label={t("portal.split")}>
            {t("portal.splitLine", {
              investors: formatNumber(one.investorsPercent, language),
              farm: formatNumber(WHOLE - one.investorsPercent, language),
            })}
          </Fact>
          <Fact label={t("portal.open.cattleBudget")}>
            {taka(one.cattleBudgetBdt)}
          </Fact>
          <Fact label={t("portal.open.runningBudget")}>
            {taka(one.runningBudgetBdt)}
          </Fact>
        </dl>
      </Section>
      <Section title={t("portal.open.rules")}>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm">
          <li>
            {t("portal.open.ruleFloor", {
              floor: taka(one.floorBdt),
              day: formatDate(startOfFarmDay(one.decideBy), language, "date"),
            })}
          </li>
          <li>{t("portal.open.ruleLoss")}</li>
          <li>{t("portal.open.ruleNoReturn")}</li>
          <li>{t("portal.open.ruleSigning")}</li>
        </ul>
      </Section>
    </>
  );
};

/** One Venture the farm is raising capital for, by its address, with the Investor's own Request to Join beneath it;
 *  one no longer offered opens nothing but a way back. */
const OpenVenturePage = () => {
  const { t } = useLanguage();
  const { ventureId } = Route.useParams();
  const offered = useQuery(orpc.portal.openVentures.queryOptions());
  const one = (offered.data ?? []).find((each) => each.id === ventureId);
  return (
    <Page>
      <Link
        className="text-muted-foreground hover:text-foreground -mb-2 flex w-fit items-center gap-1 text-sm"
        to="/portal/open"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {t("portal.open.back")}
      </Link>
      <Loaded
        query={offered}
        skeleton={<Skeleton className="h-64 rounded-xl" />}
      >
        {one ? (
          <>
            <TheOffer one={one} />
            <AskToJoin one={one} />
          </>
        ) : (
          <EmptyState icon={Sprout} title={t("portal.open.notFound")} />
        )}
      </Loaded>
    </Page>
  );
};

export const Route = createFileRoute("/portal/_in/open/$ventureId")({
  component: OpenVenturePage,
});
