import { startOfFarmDay } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Badge } from "@OpenFarm/ui/components/badge";
import { Link } from "@tanstack/react-router";
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
import { OfferSkeleton } from "@/components/portal/portal-skeletons";
import {
  usePortalPlaces,
  useTheirOpenVentures,
} from "@/components/portal/portal-source";
import { AskToJoin } from "@/components/portal/requests-to-join";
import { useLanguage } from "@/i18n/language-provider";
import { useTaka } from "@/lib/taka";

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
    <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
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
    </div>
  );
};

/** One Venture the farm is raising capital for, by its address, with the Investor's own Request to Join beside it
 *  (beneath it on a phone); one no longer offered opens nothing but a way back. */
export const OpenVenturePage = ({ ventureId }: { ventureId: string }) => {
  const { t } = useLanguage();
  const places = usePortalPlaces();
  const offered = useTheirOpenVentures();
  const one = (offered.data ?? []).find((each) => each.id === ventureId);
  return (
    <Page>
      <Link
        className="text-muted-foreground hover:text-foreground -mb-2 flex w-fit items-center gap-1 text-sm"
        params={places.openVentures.link.params}
        to={places.openVentures.link.to}
      >
        <ArrowLeft aria-hidden className="size-4" />
        {t("portal.open.back")}
      </Link>
      <Loaded query={offered} skeleton={<OfferSkeleton />}>
        {one ? (
          <>
            <PageHeader
              meta={
                one.takingRequests ? null : (
                  <Badge variant="secondary">{t("portal.open.closed")}</Badge>
                )
              }
              title={one.name}
            />
            {/* The offer read down the page, and the Request beside it where there is room — kept in sight while the
                terms are read, below the bar and the Preview's band that stay pinned over the page. */}
            <div className="grid items-start gap-4 lg:grid-cols-3">
              <TheOffer one={one} />
              <div className="min-w-0 lg:sticky lg:top-28">
                <AskToJoin one={one} />
              </div>
            </div>
          </>
        ) : (
          <EmptyState icon={Sprout} title={t("portal.open.notFound")} />
        )}
      </Loaded>
    </Page>
  );
};
