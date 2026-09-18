import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { useState } from "react";

import { RecordInvestorSheet } from "@/components/investors/record-investor-sheet";
import {
  EmptyState,
  Loaded,
  Notice,
  Page,
  PageHeader,
  RecordList,
  RecordRow,
  Section,
  TagChip,
} from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";
import { orpc } from "@/utils/orpc";

type Investor = Awaited<
  ReturnType<typeof orpc.investors.list.call>
>["people"][number];

/** One Investor: who they are, how they are reached and paid, and what they hold across the Ventures still
 *  running — so the Owner sees at a glance who has most at stake. */
const InvestorRow = ({ investor }: { investor: Investor }) => {
  const { t, language } = useLanguage();
  return (
    <RecordRow
      meta={
        <>
          <span>{investor.phone}</span>
          {investor.address ? <span>{investor.address}</span> : null}
          {investor.nominee ? (
            <span>
              {t("investors.nomineeIs", { name: investor.nominee.name })}
            </span>
          ) : null}
        </>
      }
      title={investor.name}
      trailing={
        investor.unitsHeld > 0 ? (
          <TagChip>
            {t("investors.holds", {
              units: formatNumber(investor.unitsHeld, language),
            })}
          </TagChip>
        ) : null
      }
    />
  );
};

/**
 * The people whose money is in the farm's Ventures. The Owner's alone: who trusted her with money, and how
 * much, is not the Manager's business. The count against the cap sits at the top, because twenty people in
 * one business for gain is a company, and the farm is not one.
 */
const InvestorsPage = () => {
  const { t, language } = useLanguage();
  const [recording, setRecording] = useState(false);
  const investors = useQuery(orpc.investors.list.queryOptions());
  const people = investors.data?.people ?? [];
  const counted = investors.data;
  return (
    <Page>
      <PageHeader
        actions={
          <Button onClick={() => setRecording(true)} type="button">
            <Users aria-hidden data-icon="inline-start" />
            {t("investors.record")}
          </Button>
        }
        description={t("investors.subtitle")}
        title={t("investors.title")}
      />
      {counted?.nearingTheCap ? (
        <Notice
          title={t("investors.nearingTheCap", {
            standing: formatNumber(counted.standing, language),
            cap: formatNumber(counted.cap, language),
          })}
          tone="warning"
        >
          {t("investors.capWhy")}
        </Notice>
      ) : null}
      <Loaded
        query={investors}
        skeleton={<Skeleton className="h-40 rounded-xl" />}
      >
        {people.length === 0 ? (
          <EmptyState icon={Users} title={t("investors.none")} />
        ) : (
          <Section id="investors-list" title={t("investors.title")}>
            <RecordList>
              {people.map((one) => (
                <InvestorRow investor={one} key={one.id} />
              ))}
            </RecordList>
          </Section>
        )}
      </Loaded>
      <RecordInvestorSheet onOpenChange={setRecording} open={recording} />
    </Page>
  );
};

export const Route = createFileRoute("/_auth/investors")({
  /** The Owner's alone: nobody else is shown a screen that would only refuse them. */
  beforeLoad: onlyFor("owner"),
  component: InvestorsPage,
});
