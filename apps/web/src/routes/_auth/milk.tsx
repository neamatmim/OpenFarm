import { farmDayOf } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FileText, Milk, Scale, Truck } from "lucide-react";
import { useState } from "react";

import { MilkMismatches } from "@/components/milk-mismatches";
import { DispatchSheet } from "@/components/milk/dispatch-sheet";
import { HandedOverTab } from "@/components/milk/handed-over";
import { MilkRecordsTab } from "@/components/milk/milk-records";
import type { MilkDay } from "@/components/milk/milk-types";
import { worthOf } from "@/components/milk/milk-types";
import { Page, PageHeader } from "@/components/page";
import type { Figure } from "@/components/page-kit";
import { PageTabs, SummaryFigures } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";
import { orpc } from "@/utils/orpc";

const TABS = ["handedOver", "mismatches", "records"] as const;
type Tab = (typeof TABS)[number];

/**
 * The figures a day of milk is judged by: what went into the tank, what was handed over at the gate and what it came
 * to, and how many tank readings wait for the Manager to look at.
 */
const useMilkFigures = ({
  day,
  milkDay,
  failed,
  mismatches,
}: {
  day: string;
  milkDay: MilkDay | undefined;
  failed: boolean;
  mismatches: number | undefined;
}): Figure[] => {
  const { t, language } = useLanguage();
  // A figure the farm has not given yet: a placeholder while it is asked, a dash once asking has failed.
  const notYet = failed ? "—" : <Skeleton className="h-8 w-28" />;
  const litres = (value: number) =>
    `${formatNumber(value, language)} ${t("dispatch.litres")}`;
  const worth = (milkDay?.dispatches ?? []).reduce(
    (sum, one) => sum + worthOf(one.litres, one.pricePerLitreBdt),
    0
  );
  const dayWord = formatDate(new Date(`${day}T12:00:00`), language);
  return [
    {
      label: t("dispatch.intoTank"),
      value: milkDay ? litres(milkDay.toBulkLitres) : notYet,
      hint: dayWord,
      icon: Milk,
    },
    {
      label: t("dispatch.handedOver"),
      value: milkDay ? litres(milkDay.dispatchedLitres) : notYet,
      hint: milkDay
        ? t("dispatch.kpi.handedOverHint", {
            count: milkDay.dispatches.length,
            taka: Math.round(worth),
          })
        : dayWord,
      icon: Truck,
    },
    {
      label: t("dispatch.tab.mismatches"),
      value:
        mismatches === undefined ? notYet : formatNumber(mismatches, language),
      hint: t("dispatch.kpi.mismatchesHint"),
      icon: Scale,
      tone: mismatches ? "warning" : "neutral",
    },
  ];
};

/**
 * The milk leaving the farm, by what somebody came to it for: one day's tank beside what was handed over at the gate,
 * the milkings whose tank did not match its cows, and the records a processor or BFSA asks for. Milk handed over is
 * one button away from every tab. The tab is kept in the address, so a page comes back as it was left.
 */
const MilkPage = () => {
  const { t } = useLanguage();
  const navigate = useNavigate({ from: Route.fullPath });
  const { tab = "handedOver" } = Route.useSearch();
  const me = useQuery(orpc.people.me.queryOptions());
  const [day, setDay] = useState(() => farmDayOf(new Date()));
  const [recording, setRecording] = useState(false);
  const milkDay = useQuery(orpc.milk.day.queryOptions({ input: { day } }));
  const flagged = useQuery(orpc.milk.flagged.queryOptions());
  // The Manager's to record and put right, and the Owner's, who may do anything the Manager does.
  const mayRecord =
    me.data?.roles.some((role) => role === "owner" || role === "manager") ??
    false;
  const figures = useMilkFigures({
    day,
    milkDay: milkDay.data,
    failed: milkDay.isError,
    mismatches: flagged.data?.length,
  });

  return (
    <Page>
      <PageHeader
        actions={
          mayRecord ? (
            <Button onClick={() => setRecording(true)} type="button">
              <Truck aria-hidden data-icon="inline-start" />
              {t("dispatch.recordAction")}
            </Button>
          ) : null
        }
        description={t("dispatch.subtitle")}
        title={t("dispatch.title")}
      />

      <SummaryFigures figures={figures} />

      <PageTabs
        onChange={(value) =>
          navigate({
            replace: true,
            search: value === "handedOver" ? {} : { tab: value },
          })
        }
        tabs={[
          {
            value: "handedOver",
            label: t("dispatch.handedOver"),
            icon: Truck,
            content: (
              <HandedOverTab
                day={day}
                mayRecord={mayRecord}
                milkDay={milkDay}
                onDayChange={setDay}
                onRecord={() => setRecording(true)}
              />
            ),
          },
          {
            value: "mismatches",
            label: t("dispatch.tab.mismatches"),
            icon: Scale,
            count: flagged.data?.length,
            content: <MilkMismatches />,
          },
          {
            value: "records",
            label: t("dispatch.reports"),
            icon: FileText,
            content: <MilkRecordsTab />,
          },
        ]}
        value={tab}
      />

      {mayRecord ? (
        <DispatchSheet onOpenChange={setRecording} open={recording} />
      ) : null}
    </Page>
  );
};

export const Route = createFileRoute("/_auth/milk")({
  beforeLoad: onlyFor("runsTheFarm"),
  component: MilkPage,
  /** Which tab, kept in the address so the page comes back as it was left. */
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } =>
    TABS.includes(search.tab as Tab) && search.tab !== "handedOver"
      ? { tab: search.tab as Tab }
      : {},
});
