import { underMeatWithdrawal } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { buttonVariants } from "@OpenFarm/ui/components/button";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Beef, CircleCheck, Lock, Sparkles, Store } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";

import type {
  BoardRow,
  Suggestion,
} from "@/components/fattening/fattening-types";
import { fitOnFrom } from "@/components/fattening/fattening-types";
import { KeepLongerDialog } from "@/components/fattening/keep-longer-dialog";
import { ReadySuggestions } from "@/components/fattening/ready-suggestions";
import { EmptyState, Notice, Page, PageHeader } from "@/components/page";
import { SummaryFigures } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";
import { orpc } from "@/utils/orpc";

/**
 * The three figures the question "what can go" is judged by: how many the farm is suggesting, how many the Manager has
 * already confirmed — and of those how many can leave today — and how many are held back by a meat Withdrawal, which
 * neither a suggestion nor a confirmation gets past. A dash for a figure the farm has not answered yet.
 */
const ReadyFigures = ({
  suggestions,
  board,
}: {
  suggestions: Suggestion[] | undefined;
  board: BoardRow[] | undefined;
}) => {
  const { t, language } = useLanguage();
  const number = (value: number | undefined) =>
    value === undefined ? "—" : formatNumber(value, language);
  const now = new Date();
  const confirmed = board?.filter((row) => row.state === "ready_for_sale");
  const clear = confirmed?.filter((row) => !underMeatWithdrawal(row, now));
  const held = board?.filter(
    (row) => row.state !== "quarantine" && underMeatWithdrawal(row, now)
  );
  return (
    <SummaryFigures
      figures={[
        {
          label: t("ready.kpi.suggested"),
          value: number(suggestions?.length),
          hint: t("ready.kpi.suggestedHint"),
          icon: Sparkles,
          tone: (suggestions?.length ?? 0) > 0 ? "info" : "neutral",
        },
        {
          label: t("ready.kpi.confirmed"),
          value: number(confirmed?.length),
          hint: t("ready.kpi.confirmedHint", {
            count: number(clear?.length),
          }),
          icon: CircleCheck,
          tone: (confirmed?.length ?? 0) > 0 ? "success" : "neutral",
        },
        {
          label: t("ready.kpi.held"),
          value: number(held?.length),
          hint: t("ready.kpi.heldHint"),
          icon: Lock,
          tone: (held?.length ?? 0) > 0 ? "warning" : "neutral",
        },
      ]}
    />
  );
};

/** Where a confirmed animal goes next: the sale. */
const SaleButton = () => {
  const { t } = useLanguage();
  return (
    <Link className={buttonVariants({ variant: "outline" })} to="/sale">
      <Store aria-hidden data-icon="inline-start" />
      {t("sale.title")}
    </Link>
  );
};

/** The suggestions, or a placeholder while the farm is asked, or why there are none. */
const SuggestionsBody = ({
  suggestions,
  failed,
  children,
}: {
  suggestions: Suggestion[] | undefined;
  failed: boolean;
  children: ReactNode;
}) => {
  const { t } = useLanguage();
  if (suggestions === undefined) {
    return failed ? (
      <Notice title={t("common.error")} tone="danger" />
    ) : (
      <Skeleton className="h-64 rounded-xl" />
    );
  }
  if (suggestions.length === 0) {
    return (
      <EmptyState
        action={
          <Link
            className={buttonVariants({ variant: "outline" })}
            to="/fattening"
          >
            {t("nav.fattening")}
          </Link>
        }
        description={t("ready.noneHint")}
        icon={Beef}
        title={t("ready.none")}
      />
    );
  }
  return children;
};

/**
 * What the farm thinks is ready to sell, and why it thinks so.
 *
 * The farm suggests and the Manager decides — so every row offers two answers, and neither of
 * them is the default. One set aside says why, in a dialog, and stops being offered until the farm has
 * something new to say.
 */
const ReadyPage = () => {
  const { t, language } = useLanguage();
  const [keeping, setKeeping] = useState<Suggestion | null>(null);
  const suggestions = useQuery(orpc.ready.suggestions.queryOptions());
  const board = useQuery(orpc.fattening.board.queryOptions({ input: {} }));

  const onError = (error: Error) => {
    const fitOn = fitOnFrom(error);
    toast.error(
      fitOn
        ? t("ready.underWithdrawal", {
            when: formatDate(new Date(fitOn), language, "date"),
          })
        : (error.message ?? t("common.error"))
    );
  };

  const confirm = useMutation(
    orpc.ready.confirm.mutationOptions({
      onSuccess: ({ tagNumber }) => {
        toast.success(t("ready.confirmed", { tag: tagNumber }));
      },
      onError,
    })
  );
  const setAside = useMutation(
    orpc.ready.setAside.mutationOptions({
      onSuccess: ({ tagNumber }) => {
        toast.success(t("ready.setAsideDone", { tag: tagNumber }));
        setKeeping(null);
      },
      onError,
    })
  );

  return (
    <Page>
      <PageHeader
        actions={<SaleButton />}
        description={t("ready.subtitle")}
        title={t("state.ready_for_sale")}
      />

      <ReadyFigures board={board.data} suggestions={suggestions.data} />

      <SuggestionsBody
        failed={suggestions.isError}
        suggestions={suggestions.data}
      >
        <ReadySuggestions
          answering={{
            confirmingTag: confirm.isPending
              ? (confirm.variables?.tagNumber ?? null)
              : null,
            handleConfirm: (row) =>
              confirm.mutate({ tagNumber: row.tagNumber }),
            handleKeepLonger: setKeeping,
          }}
          suggestions={suggestions.data ?? []}
        />
      </SuggestionsBody>

      <KeepLongerDialog
        key={keeping?.id ?? "none"}
        onKeep={(row, reason) =>
          setAside.mutate({
            tagNumber: row.tagNumber,
            grounds: row.grounds,
            reason,
          })
        }
        onOpenChange={(open) => {
          if (!open) {
            setKeeping(null);
          }
        }}
        pending={setAside.isPending}
        row={keeping}
      />
    </Page>
  );
};

export const Route = createFileRoute("/_auth/ready")({
  beforeLoad: onlyFor("runsTheFarm"),
  component: ReadyPage,
});
