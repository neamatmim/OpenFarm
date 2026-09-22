import { buttonVariants } from "@OpenFarm/ui/components/button";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Baby,
  ChevronLeft,
  FileText,
  LayoutList,
  Scale,
  SearchX,
  Stethoscope,
} from "lucide-react";
import { useState } from "react";

import { AnimalActs } from "@/components/animal/animal-acts";
import { AnimalProfile } from "@/components/animal/animal-profile";
import type { AnimalAct } from "@/components/animal/animal-types";
import { useAnimalPowers } from "@/components/animal/animal-types";
import { BreedingTab, hasBreeding } from "@/components/animal/breeding-tab";
import { HealthTab } from "@/components/animal/health-tab";
import {
  MoneyPapersTab,
  hasMoneyOrPapers,
} from "@/components/animal/money-papers-tab";
import { OverviewTab } from "@/components/animal/overview-tab";
import { WeightMovesTab } from "@/components/animal/weight-moves-tab";
import { EmptyState, Page } from "@/components/page";
import type { PageTab } from "@/components/page-kit";
import { PageTabs } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

const TABS = ["overview", "breeding", "health", "weight", "money"] as const;
type Tab = (typeof TABS)[number];

/**
 * One animal's page, by what somebody came to her for: her head says who she is and what holds her, with what was seen
 * of her and a move a thumb away; her tabs hold her at a glance, her breeding, her health, her weight and moves, and
 * her money and papers. Every record-keeping act opens in its own dialog, offered only to a Role the farm lets do it.
 * The tab is kept in the address, so her page comes back as it was left.
 */
const AnimalPage = () => {
  const { tagNumber } = Route.useParams();
  const { tab = "overview" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [act, setAct] = useState<AnimalAct | null>(null);

  const animal = useQuery(
    orpc.animals.byTag.queryOptions({ input: { tagNumber } })
  );
  const powers = useAnimalPowers(animal.data);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.animals.key() });

  if (animal.isError) {
    return (
      <Page>
        <EmptyState
          action={
            <Link
              className={buttonVariants({ variant: "outline" })}
              to="/animals"
            >
              {t("nav.animals")}
            </Link>
          }
          icon={SearchX}
          title={t("animals.notFound")}
        />
      </Page>
    );
  }
  if (!animal.data) {
    return (
      <Page>
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-11 rounded-lg" />
        <Skeleton className="h-64 rounded-xl" />
      </Page>
    );
  }

  const detail = animal.data;
  const tabs: PageTab<Tab>[] = [
    {
      value: "overview",
      label: t("animals.tab.overview"),
      icon: LayoutList,
      content: (
        <OverviewTab
          detail={detail}
          onAct={setAct}
          onChanged={refresh}
          powers={powers}
        />
      ),
    },
  ];
  // A fattening steer has no breeding to read; a heifer with none yet still has the tab her record will fill.
  if (detail.side === "dairy" || hasBreeding(detail, powers)) {
    tabs.push({
      value: "breeding",
      label: t("animals.tab.breeding"),
      icon: Baby,
      content: <BreedingTab detail={detail} onAct={setAct} powers={powers} />,
    });
  }
  tabs.push(
    {
      value: "health",
      label: t("animals.tab.health"),
      icon: Stethoscope,
      content: <HealthTab detail={detail} powers={powers} />,
    },
    {
      value: "weight",
      label: t("animals.tab.weight"),
      icon: Scale,
      content: <WeightMovesTab detail={detail} powers={powers} />,
    }
  );
  if (hasMoneyOrPapers(detail, powers)) {
    tabs.push({
      value: "money",
      label: powers.runsTheFarm ? t("animals.tab.money") : t("animals.papers"),
      icon: FileText,
      content: <MoneyPapersTab detail={detail} powers={powers} />,
    });
  }
  // A tab kept in an address this reader has no such tab for comes back as her overview.
  const shown = tabs.some((one) => one.value === tab) ? tab : "overview";

  return (
    <Page>
      <Link
        className="text-muted-foreground hover:text-foreground -mb-2 inline-flex min-h-11 w-fit items-center gap-1 text-sm md:min-h-0"
        to="/animals"
      >
        <ChevronLeft aria-hidden className="size-4" />
        {t("nav.animals")}
      </Link>

      <AnimalProfile
        detail={detail}
        onAct={setAct}
        onChanged={refresh}
        powers={powers}
      />

      <PageTabs
        onChange={(value) =>
          navigate({
            replace: true,
            search: value === "overview" ? {} : { tab: value },
          })
        }
        tabs={tabs}
        value={shown}
      />

      <AnimalActs
        act={act}
        detail={detail}
        movePens={powers.movePens}
        onClose={() => setAct(null)}
        onDone={refresh}
      />
    </Page>
  );
};

export const Route = createFileRoute("/_auth/animals/$tagNumber")({
  component: AnimalPage,
  /** Which tab, kept in the address so her page comes back as it was left. */
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } =>
    TABS.includes(search.tab as Tab) && search.tab !== "overview"
      ? { tab: search.tab as Tab }
      : {},
});
