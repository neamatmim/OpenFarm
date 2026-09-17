import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import {
  ClipboardList,
  ClipboardPlus,
  FolderOpen,
  Hourglass,
  Pill,
  Receipt,
  RefreshCcw,
} from "lucide-react";
import { useState } from "react";

import { Page, PageHeader } from "@/components/page";
import type { Figure, PageTab } from "@/components/page-kit";
import { PageTabs, SummaryFigures } from "@/components/page-kit";
import { DiagnosisSheet } from "@/components/vet/diagnosis-sheet";
import { PrescribeSheet } from "@/components/vet/prescribe-sheet";
import { ConcludedTab } from "@/components/vet/vet-concluded";
import { FeeTab } from "@/components/vet/vet-fee";
import { CasesTab, RepeatTab } from "@/components/vet/vet-lists";
import type { Made, Seen } from "@/components/vet/vet-types";
import { WaitingTab } from "@/components/vet/vet-waiting";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

const TABS = ["waiting", "mine", "repeat", "fee", "cases"] as const;
type Tab = (typeof TABS)[number];

/** The tabs a vet called in for a visit has: their Cases, not the farm's breeding list or fees. */
const VISITING_TABS: readonly Tab[] = ["waiting", "mine", "cases"];
const IN_HOUSE_TABS: readonly Tab[] = ["waiting", "mine", "repeat", "fee"];

/** Doses ordered that nobody has given yet and that are still to be given. */
const owedOf = (mine: Made[]) =>
  mine
    .flatMap((made) => made.prescriptions)
    .flatMap((course) => course.doses)
    .filter(
      (dose) =>
        dose.givenAt === null &&
        dose.state !== "called_off" &&
        dose.state !== "missed"
    ).length;

interface VetCounts {
  waiting: number;
  mine: Made[];
  /** The fourth figure: the cows that will not settle for the farm's own Vet, the open Cases for a visiting one. */
  last: number;
  visiting: boolean;
}

/** The figures the Vet reads the page by: what is waiting for them, what they concluded, the doses their courses still
 *  owe, and the cows or Cases that are theirs to decide on. */
const useVetFigures = ({ waiting, mine, last, visiting }: VetCounts) => {
  const { t, language } = useLanguage();
  const owed = owedOf(mine);
  const figures: Figure[] = [
    {
      label: t("vet.waiting"),
      value: formatNumber(waiting, language),
      hint: t("vet.kpi.waitingHint"),
      icon: Hourglass,
      tone: waiting > 0 ? "warning" : "neutral",
    },
    {
      label: t("vet.kpi.mine"),
      value: formatNumber(mine.length, language),
      hint: t("vet.kpi.mineHint"),
      icon: ClipboardList,
    },
    {
      label: t("vet.kpi.owed"),
      value: formatNumber(owed, language),
      hint: t("vet.kpi.owedHint"),
      icon: Pill,
      tone: owed > 0 ? "info" : "neutral",
    },
    visiting
      ? {
          label: t("cases.mine"),
          value: formatNumber(last, language),
          hint: t("vet.kpi.casesHint"),
          icon: FolderOpen,
        }
      : {
          label: t("vet.tab.repeat"),
          value: formatNumber(last, language),
          hint: t("vet.kpi.repeatHint"),
          icon: RefreshCcw,
          tone: last > 0 ? "warning" : "neutral",
        },
  ];
  return figures;
};

/** What the Vet's page reads. A vet called in for a visit sees their Cases, not the farm's rounds, breeding list or
 *  fees, so those are not asked for on their behalf. */
const useVetQueries = (saw: string) => {
  const me = useQuery(orpc.people.me.queryOptions());
  const visiting = me.data?.scopes.vet?.kind === "cases";
  const inHouse = me.data !== undefined && !visiting;
  const kinds = useQuery({
    ...orpc.observations.kinds.queryOptions(),
    enabled: inHouse,
  });
  const waiting = useQuery(
    orpc.diagnoses.waiting.queryOptions({ input: saw ? { saw } : {} })
  );
  // The figure and the tab count what waits, whichever word the list is narrowed by.
  const allWaiting = useQuery(
    orpc.diagnoses.waiting.queryOptions({ input: {} })
  );
  const mine = useQuery(orpc.diagnoses.mine.queryOptions({ input: {} }));
  const repeat = useQuery({
    ...orpc.breeding.repeatBreeders.queryOptions(),
    enabled: inHouse,
  });
  const cases = useQuery({
    ...orpc.vetCases.mine.queryOptions(),
    enabled: visiting,
  });
  return { visiting, kinds, waiting, allWaiting, mine, repeat, cases };
};

/** The tabs, by what the Vet came to do, and which of them this Vet has. */
const VetTabs = ({
  queries,
  saw,
  onSaw,
  onAnswer,
  onPrescribe,
  onCorrected,
}: {
  queries: ReturnType<typeof useVetQueries>;
  saw: string;
  onSaw: (saw: string) => void;
  onAnswer: (seen: Seen) => void;
  onPrescribe: (made: Made) => void;
  onCorrected: () => void;
}) => {
  const { t } = useLanguage();
  const navigate = useNavigate({ from: Route.fullPath });
  const search = Route.useSearch();
  const { visiting, kinds, waiting, allWaiting, mine, repeat, cases } = queries;
  const repeatRows = repeat.data ?? [];
  const allowed = visiting ? VISITING_TABS : IN_HOUSE_TABS;
  const tab =
    search.tab && allowed.includes(search.tab) ? search.tab : "waiting";

  const every: Record<Tab, PageTab<Tab>> = {
    waiting: {
      value: "waiting",
      label: t("vet.waiting"),
      icon: Hourglass,
      count: allWaiting.data?.length ?? 0,
      content: (
        <WaitingTab
          kinds={kinds.data ?? []}
          onAnswer={onAnswer}
          onSaw={onSaw}
          saw={saw}
          waiting={waiting}
        />
      ),
    },
    mine: {
      value: "mine",
      label: t("vet.mine"),
      icon: ClipboardList,
      content: (
        <ConcludedTab
          mine={mine}
          onCorrected={onCorrected}
          onPrescribe={onPrescribe}
        />
      ),
    },
    repeat: {
      value: "repeat",
      label: t("vet.tab.repeat"),
      icon: RefreshCcw,
      count: repeatRows.length,
      content: <RepeatTab query={repeat} rows={repeatRows} />,
    },
    fee: {
      value: "fee",
      label: t("vetFee.title"),
      icon: Receipt,
      content: <FeeTab />,
    },
    cases: {
      value: "cases",
      label: t("cases.mine"),
      icon: FolderOpen,
      content: <CasesTab cases={cases.data?.cases ?? []} query={cases} />,
    },
  };

  return (
    <PageTabs
      onChange={(value) =>
        navigate({
          replace: true,
          search: value === "waiting" ? {} : { tab: value },
        })
      }
      tabs={allowed.map((one) => every[one])}
      value={tab}
    />
  );
};

/**
 * The Vet's screen, and the only one they need: what the rounds have seen and nobody has
 * answered, and what they have concluded themselves — each a tab, with the farm's cows that will
 * not settle and the Vet's own fee beside them, or a visiting Vet's Cases.
 *
 * The Vet is off-site more often than on it — they read this on their own phone, from their
 * own practice, and a Diagnosis they record here is their act in law. So there is no form
 * anywhere else for anyone to record one on their behalf.
 */
const VetPage = () => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [saw, setSaw] = useState("");
  /** The Diagnosis sheet: what it answers, or none for one on its own; closed when there is no sheet. */
  const [diagnosing, setDiagnosing] = useState<{ seen: Seen | null } | null>(
    null
  );
  const [prescribing, setPrescribing] = useState<Made | null>(null);
  const queries = useVetQueries(saw);
  const { visiting } = queries;

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.diagnoses.key() });

  const figures = useVetFigures({
    waiting: queries.allWaiting.data?.length ?? 0,
    mine: queries.mine.data ?? [],
    last: visiting
      ? (queries.cases.data?.cases.length ?? 0)
      : (queries.repeat.data?.length ?? 0),
    visiting,
  });

  return (
    <Page>
      <PageHeader
        actions={
          <Button onClick={() => setDiagnosing({ seen: null })} type="button">
            <ClipboardPlus aria-hidden data-icon="inline-start" />
            {t("vet.onItsOwn")}
          </Button>
        }
        description={t("vet.subtitle")}
        title={t("vet.title")}
      />

      <SummaryFigures figures={figures} />

      <VetTabs
        onAnswer={(seen) => setDiagnosing({ seen })}
        onCorrected={refresh}
        onPrescribe={setPrescribing}
        onSaw={setSaw}
        queries={queries}
        saw={saw}
      />

      <DiagnosisSheet
        key={diagnosing?.seen?.id ?? "own"}
        onOpenChange={(open) => {
          if (!open) {
            setDiagnosing(null);
          }
        }}
        onRecorded={refresh}
        open={diagnosing !== null}
        seen={diagnosing?.seen ?? null}
      />
      <PrescribeSheet
        key={prescribing?.id ?? "none"}
        made={prescribing}
        onOpenChange={(open) => {
          if (!open) {
            setPrescribing(null);
          }
        }}
        onPrescribed={refresh}
      />
    </Page>
  );
};

export const Route = createFileRoute("/_auth/vet")({
  /** The Vet's own screen. Everyone else is sent away rather than shown forms that would
   *  refuse them — a Diagnosis is not a permission the farm can grant. */
  beforeLoad: ({ context }) => {
    if (!context.me.roles.includes("vet")) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: VetPage,
  /** Which tab, kept in the address so the page comes back as it was left. */
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } =>
    TABS.includes(search.tab as Tab) && search.tab !== "waiting"
      ? { tab: search.tab as Tab }
      : {},
});
