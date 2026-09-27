import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { createFileRoute } from "@tanstack/react-router";

import { Notice, Page, PageHeader, Section } from "@/components/page";
import {
  FinishedRuns,
  ReturnsChart,
  useReturns,
} from "@/components/returns/returns-page";
import { useLanguage } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";

/**
 * What the money in the farm's cattle returned, for the Owner: each Season of the Farm's own fattening cattle and each
 * settled Venture, worked as a Settlement is, with what every hundred taka made, the days its money was out and that
 * scaled to a year — and the sentence saying what none of it charges.
 */
const ReturnsPage = () => {
  const { t } = useLanguage();
  const returns = useReturns();
  const header = (
    <PageHeader description={t("returns.subtitle")} title={t("nav.returns")} />
  );
  if (!returns.data) {
    return (
      <Page>
        {header}
        {returns.isError ? (
          <Notice title={t("common.loadFailed")} tone="danger" />
        ) : (
          <Skeleton className="h-64 rounded-xl" />
        )}
      </Page>
    );
  }
  return (
    <Page>
      {header}
      <Section
        description={t("returns.chartHint")}
        title={t("returns.chartTitle")}
      >
        <ReturnsChart page={returns.data} />
      </Section>
      <Section
        description={t("returns.finishedHint")}
        title={t("returns.finishedTitle")}
      >
        <FinishedRuns page={returns.data} />
      </Section>
      <p className="text-muted-foreground text-sm italic">
        {t("returns.leftOut")}
      </p>
    </Page>
  );
};

export const Route = createFileRoute("/_auth/returns")({
  beforeLoad: onlyFor("owner"),
  component: ReturnsPage,
});
