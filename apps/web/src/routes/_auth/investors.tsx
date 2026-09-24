import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BadgeCheck, IdCard, Search, Users } from "lucide-react";
import { useState } from "react";

import { InvestorDetails } from "@/components/investors/investor-details";
import { InvestorSheet } from "@/components/investors/investor-sheet";
import type { Investor } from "@/components/investors/investor-types";
import { matching } from "@/components/investors/investor-types";
import { InvestorsTable } from "@/components/investors/investors-table";
import type { PortalStanding } from "@/components/investors/portal-access";
import {
  PortalSwitch,
  STANDING,
  portalInUse,
  standingOf,
} from "@/components/investors/portal-access";
import {
  EmptyState,
  Loaded,
  Notice,
  Page,
  PageHeader,
  Section,
} from "@/components/page";
import type { Figure } from "@/components/page-kit";
import { FilterBar, NativeSelect, SummaryFigures } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";
import { orpc } from "@/utils/orpc";

/** What the list answers, with how the farm stands against the cap it may not go past. */
type InvestorList = Awaited<ReturnType<typeof orpc.investors.list.call>>;

/**
 * The three figures the Investors are read by: how many are counted against the cap, how many Units they
 * hold between them across the Ventures still running, and how many names the farm has on file at all.
 *
 * Standing and names on file are different counts on purpose — somebody who joined one Venture that has
 * since settled is still on file and no longer counted — and the page says both rather than letting the
 * one number stand for the other.
 */
const useInvestorFigures = (list: InvestorList | undefined): Figure[] => {
  const { t, language } = useLanguage();
  const people = list?.people ?? [];
  const units = people.reduce((sum, one) => sum + one.unitsHeld, 0);
  const loading = <Skeleton className="h-8 w-20" />;
  return [
    {
      label: t("investors.inARun"),
      value: list
        ? t("investors.ofTheCap", {
            standing: formatNumber(list.standing, language),
            cap: formatNumber(list.cap, language),
          })
        : loading,
      // Where the second number comes from, said before the warning is: below the warning line nothing else
      // on the page explains it.
      hint: t("investors.capHint"),
      icon: BadgeCheck,
      tone: list?.nearingTheCap ? "warning" : "neutral",
    },
    {
      label: t("investors.unitsHeld"),
      value: list ? formatNumber(units, language) : loading,
      icon: IdCard,
    },
    {
      label: t("investors.recordedCount"),
      value: list ? formatNumber(people.length, language) : loading,
      icon: Users,
    },
  ];
};

/** The list narrowed to one portal standing, each with how many stand there, so the Owner finds who wants a new
 *  code without reading every row. */
const PortalFilter = ({
  people,
  value,
  onChange,
}: {
  people: Investor[];
  value: PortalStanding | "";
  onChange: (standing: PortalStanding | "") => void;
}) => {
  const { t, language } = useLanguage();
  const standings = Object.keys(STANDING) as PortalStanding[];
  return (
    <NativeSelect
      aria-label={t("portal.column")}
      className="sm:w-56"
      onChange={(event) =>
        onChange(standings.find((one) => one === event.target.value) ?? "")
      }
      value={value}
    >
      <option value="">{t("portal.anyStanding")}</option>
      {standings.map((one) => (
        <option key={one} value={one}>
          {`${t(STANDING[one].word)} · ${formatNumber(
            people.filter((person) => standingOf(person) === one).length,
            language
          )}`}
        </option>
      ))}
    </NativeSelect>
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
  const [looking, setLooking] = useState("");
  // Held by id and read from the list, so a sheet open on somebody shows them as they are after a correction
  // or a retiring rather than as they were when it was opened.
  const [showingId, setShowingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const investors = useQuery(orpc.investors.list.queryOptions());
  const people = investors.data?.people ?? [];
  const showing = people.find((one) => one.id === showingId) ?? null;
  const editing = people.find((one) => one.id === editingId) ?? null;
  const counted = investors.data;
  const figures = useInvestorFigures(counted);
  const [standing, setStanding] = useState<PortalStanding | "">("");
  const showPortal = portalInUse(counted?.portalOpen ?? false, people);
  const shown = people.filter(
    (one) =>
      matching(one, looking) &&
      (!showPortal || standing === "" || standingOf(one) === standing)
  );
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
      <SummaryFigures figures={figures} />
      {counted ? <PortalSwitch open={counted.portalOpen} /> : null}
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
          <Section id="investors-list">
            <FilterBar className="border-b pb-4">
              <div className="relative sm:min-w-64 sm:flex-1">
                <Search
                  aria-hidden
                  className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
                />
                <Input
                  aria-label={t("investors.search")}
                  className="ps-9"
                  onChange={(event) => setLooking(event.target.value)}
                  placeholder={t("investors.search")}
                  type="search"
                  value={looking}
                />
              </div>
              {showPortal ? (
                <PortalFilter
                  onChange={setStanding}
                  people={people}
                  value={standing}
                />
              ) : null}
            </FilterBar>
            {shown.length === 0 ? (
              <EmptyState bare icon={Search} title={t("investors.noneFound")} />
            ) : (
              <InvestorsTable
                investors={shown}
                onDetails={(one: Investor) => setShowingId(one.id)}
                showPortal={showPortal}
              />
            )}
          </Section>
        )}
      </Loaded>
      <InvestorSheet onOpenChange={setRecording} open={recording} />
      <InvestorSheet
        investor={editing}
        onOpenChange={(wanted) => {
          if (!wanted) {
            setEditingId(null);
          }
        }}
        open={editing !== null}
      />
      <InvestorDetails
        investor={showing}
        portalOpen={counted?.portalOpen ?? false}
        onEdit={(one) => {
          setShowingId(null);
          setEditingId(one.id);
        }}
        onOpenChange={(wanted) => {
          if (!wanted) {
            setShowingId(null);
          }
        }}
      />
    </Page>
  );
};

export const Route = createFileRoute("/_auth/investors")({
  /** The Owner's alone: nobody else is shown a screen that would only refuse them. */
  beforeLoad: onlyFor("owner"),
  component: InvestorsPage,
});
