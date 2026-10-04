import { farmDayOf } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FileText, Milk, Scale, TrendingDown, Truck } from "lucide-react";
import { useState } from "react";

import { GivingLessList } from "@/components/giving-less";
import { MilkMismatches } from "@/components/milk-mismatches";
import { DispatchSheet } from "@/components/milk/dispatch-sheet";
import { HandedOverTab } from "@/components/milk/handed-over";
import { MilkAccountCard } from "@/components/milk/milk-account";
import { MilkRecordsTab } from "@/components/milk/milk-records";
import type { MilkDay } from "@/components/milk/milk-types";
import { worthOf } from "@/components/milk/milk-types";
import { EmptyState, Page, PageHeader } from "@/components/page";
import type { Figure } from "@/components/page-kit";
import { PageTabs, SummaryFigures } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";
import { TAB_SWITCH, useTabOfPath } from "@/lib/path-tabs";
import { orpc } from "@/utils/orpc";

const TABS = ["handedOver", "mismatches", "givingLess", "records"] as const;
type Tab = (typeof TABS)[number];

/** Each tab at its own address, the first at the page's own. */
const TAB_PATHS = {
  handedOver: "/milk",
  mismatches: "/milk/reconciliation",
  givingLess: "/milk/giving-less",
  records: "/milk/records",
} as const satisfies Record<Tab, string>;

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
    (sum, one) => sum + worthOf(one.litres, one.pricePerLitreMoney),
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
            amount: Math.round(worth),
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
  const tab = useTabOfPath(TAB_PATHS) ?? "handedOver";
  const me = useQuery(orpc.people.me.queryOptions());
  const [day, setDay] = useState(() => farmDayOf(new Date()));
  const [recording, setRecording] = useState(false);
  const milkDay = useQuery(orpc.milk.day.queryOptions({ input: { day } }));
  const flagged = useQuery(orpc.milk.flagged.queryOptions());
  const givingLess = useQuery(orpc.milk.givingLess.queryOptions());
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
        title={t("nav.milk")}
      />

      <SummaryFigures figures={figures} />

      <PageTabs
        onChange={(value) => navigate({ ...TAB_SWITCH, to: TAB_PATHS[value] })}
        tabs={[
          {
            value: "handedOver",
            label: t("dispatch.handedOver"),
            icon: Truck,
            content: (
              <div className="flex flex-col gap-4">
                <MilkAccountCard />
                <HandedOverTab
                  day={day}
                  mayRecord={mayRecord}
                  milkDay={milkDay}
                  onDayChange={setDay}
                  onRecord={() => setRecording(true)}
                />
              </div>
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
            value: "givingLess",
            label: t("givingLess.title"),
            icon: TrendingDown,
            count: givingLess.data?.length,
            content: givingLess.data?.length ? (
              <GivingLessList rows={givingLess.data} />
            ) : (
              <EmptyState icon={TrendingDown} title={t("givingLess.none")} />
            ),
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

export const Route = createFileRoute("/_authenticated/milk")({
  beforeLoad: onlyFor("runsTheFarm"),
  component: MilkPage,
});
