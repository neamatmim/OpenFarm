import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Beef } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  ActionsHeader,
  DataTable,
  createListColumns,
  listHeader,
  useListTable,
} from "@/components/data-table";
import {
  GainColumn,
  GainFigures,
  WeightAgainstTarget,
} from "@/components/gain";
import {
  EmptyState,
  Notice,
  Page,
  PageHeader,
  TagChip,
} from "@/components/page";
import { useLanguage, useT } from "@/i18n/language-provider";
import { onlyFor } from "@/lib/guard";
import { orpc } from "@/utils/orpc";

/** The refusal the farm gives for an animal still inside her meat Withdrawal, with the day. */
const fitOnFrom = (error: unknown): string | null => {
  const data = (error as { data?: { refusal?: string; fitOn?: string } })?.data;
  return data?.refusal === "meat_withdrawal" ? (data.fitOn ?? null) : null;
};

type Suggestion = Awaited<
  ReturnType<typeof orpc.ready.suggestions.call>
>[number];

/** Where the Manager is in answering: which suggestion is being kept back, the reason as far as it is typed, and the
 *  two answers themselves. One at a time — opening a second reason closes the first. */
interface Deciding {
  keeping: string | null;
  reason: string;
  confirming: boolean;
  onKeep: (tagNumber: string | null) => void;
  onReason: (reason: string) => void;
  onConfirm: (row: Suggestion) => void;
  onSetAside: (row: Suggestion) => void;
}

/** The two answers to one suggestion, neither of them the default — or, once "keep it longer" is pressed, why. */
const Decision = ({
  row,
  deciding,
  idPrefix,
  className,
}: {
  row: Suggestion;
  deciding: Deciding;
  /** The card and the table row are both on the page, one of them hidden; each needs its own label target. */
  idPrefix: string;
  className?: string;
}) => {
  const { t } = useLanguage();
  if (deciding.keeping === row.tagNumber) {
    return (
      <form
        className={cn("space-y-2", className)}
        onSubmit={(event) => {
          event.preventDefault();
          deciding.onSetAside(row);
        }}
      >
        <Label htmlFor={`${idPrefix}-${row.id}`}>
          {t("ready.setAsideWhy")}
        </Label>
        <Input
          id={`${idPrefix}-${row.id}`}
          maxLength={300}
          onChange={(e) => deciding.onReason(e.target.value)}
          required
          value={deciding.reason}
        />
        <div className="grid grid-cols-2 gap-2">
          <Button
            onClick={() => deciding.onKeep(null)}
            type="button"
            variant="ghost"
          >
            {t("work.back")}
          </Button>
          <Button disabled={!deciding.reason.trim()} type="submit">
            {t("ready.setAside")}
          </Button>
        </div>
      </form>
    );
  }
  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      <Button onClick={() => deciding.onKeep(row.tagNumber)} variant="outline">
        {t("ready.setAside")}
      </Button>
      <Button
        disabled={deciding.confirming}
        onClick={() => deciding.onConfirm(row)}
      >
        {t("ready.confirm")}
      </Button>
    </div>
  );
};

/** One suggestion as a phone shows it: the animal, why the farm thinks so, her weight and both rates, and the answers. */
const SuggestionCard = ({
  row,
  deciding,
}: {
  row: Suggestion;
  deciding: Deciding;
}) => {
  const { t, language } = useLanguage();
  return (
    <li className="surface space-y-2 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link
          className="text-lg font-bold underline"
          params={{ tagNumber: row.tagNumber }}
          to="/animals/$tagNumber"
        >
          {row.tagNumber}
        </Link>
        <span className="text-muted-foreground text-sm">{row.penName}</span>
        <span className="text-success">
          {row.grounds
            .map((ground) => t(`ready.because.${ground}`))
            .join(" · ")}
        </span>
      </div>
      <p className="text-muted-foreground text-sm">
        {row.latestKg === null
          ? t("gain.noneYet")
          : `${t("gain.now")}: ${t("intake.kg", {
              kg: formatNumber(row.latestKg, language),
            })}`}
        {row.targetWeightKg === null
          ? null
          : ` · ${t("intake.targetWeight")}: ${t("intake.kg", {
              kg: formatNumber(row.targetWeightKg, language),
            })}`}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <GainColumn basis={row.sinceIntake} label={t("gain.sinceIntake")} />
        <GainColumn basis={row.recent} label={t("gain.recent")} />
      </div>
      <Decision deciding={deciding} idPrefix="why" row={row} />
    </li>
  );
};

interface ReadyRow extends Suggestion {
  deciding: Deciding;
}

interface ReadyCell {
  row: { original: ReadyRow };
}

const TagCell = ({ row }: ReadyCell) => (
  <Link
    className="focus-visible:ring-ring w-fit rounded-md outline-none hover:underline focus-visible:ring-2"
    params={{ tagNumber: row.original.tagNumber }}
    to="/animals/$tagNumber"
  >
    <TagChip>{row.original.tagNumber}</TagChip>
  </Link>
);

const WhyCell = ({ row }: ReadyCell) => {
  const t = useT();
  return (
    <div className="text-success flex flex-col gap-0.5 whitespace-nowrap">
      {row.original.grounds.map((ground) => (
        <span key={ground}>{t(`ready.because.${ground}`)}</span>
      ))}
    </div>
  );
};

const WeightCell = ({ row }: ReadyCell) => (
  <WeightAgainstTarget
    latestKg={row.original.latestKg}
    targetWeightKg={row.original.targetWeightKg}
  />
);

const SinceIntakeCell = ({ row }: ReadyCell) => (
  <GainFigures basis={row.original.sinceIntake} />
);

const RecentCell = ({ row }: ReadyCell) => (
  <GainFigures basis={row.original.recent} />
);

const DecisionCell = ({ row }: ReadyCell) => (
  <Decision
    className="ml-auto w-64 text-left"
    deciding={row.original.deciding}
    idPrefix="why-row"
    row={row.original}
  />
);

const column = createListColumns<ReadyRow>();
const readyColumns = column.columns([
  column.accessor("tagNumber", {
    header: listHeader("animals.col.tag"),
    cell: TagCell,
  }),
  column.accessor("penName", {
    header: listHeader("animals.pen"),
    meta: { className: "whitespace-nowrap" },
  }),
  column.display({
    id: "why",
    header: listHeader("ready.col.why"),
    cell: WhyCell,
  }),
  column.accessor((row) => row.latestKg ?? undefined, {
    id: "latestKg",
    header: listHeader("gain.now"),
    cell: WeightCell,
    sortUndefined: "last",
    meta: { align: "end" },
  }),
  column.accessor((row) => row.sinceIntake?.dailyGainKg, {
    id: "sinceIntake",
    header: listHeader("gain.sinceIntake"),
    cell: SinceIntakeCell,
    sortUndefined: "last",
    meta: { align: "end" },
  }),
  column.accessor((row) => row.recent?.dailyGainKg, {
    id: "recent",
    header: listHeader("gain.recent"),
    cell: RecentCell,
    sortUndefined: "last",
    meta: { align: "end" },
  }),
  column.display({
    header: ActionsHeader,
    id: "decision",
    cell: DecisionCell,
    meta: { align: "end" },
  }),
]);

/** The suggestions as a table where there is room: the reasons and the figures in columns, the answers at the end of
 *  each row. */
const ReadyTable = ({
  suggestions,
  deciding,
}: {
  suggestions: Suggestion[];
  deciding: Deciding;
}) => {
  const table = useListTable({
    columns: readyColumns,
    data: suggestions.map((row) => ({ ...row, deciding })),
    getRowId: (row) => row.id,
  });
  return (
    <div className="bg-card hidden rounded-xl border md:block">
      <DataTable bare minWidth="64rem" table={table} />
    </div>
  );
};

/**
 * What the farm thinks is ready to sell, and why it thinks so.
 *
 * The farm suggests and the Manager decides — so every row offers two answers, and neither of
 * them is the default. One set aside says why, and stops being offered until the farm has
 * something new to say.
 */
const ReadyPage = () => {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const [keeping, setKeeping] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const suggestions = useQuery(orpc.ready.suggestions.queryOptions());

  const refresh = () => {
    for (const key of [orpc.ready.key(), orpc.fattening.key()]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };
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
        refresh();
      },
      onError,
    })
  );
  const setAside = useMutation(
    orpc.ready.setAside.mutationOptions({
      onSuccess: ({ tagNumber }) => {
        toast.success(t("ready.setAsideDone", { tag: tagNumber }));
        setKeeping(null);
        setReason("");
        refresh();
      },
      onError,
    })
  );

  if (!suggestions.data) {
    return (
      <Page>
        <PageHeader title={t("state.ready_for_sale")} />
        {suggestions.isError ? (
          <Notice title={t("common.error")} tone="danger" />
        ) : (
          <Skeleton className="h-40 rounded-xl" />
        )}
      </Page>
    );
  }
  if (suggestions.data.length === 0) {
    return (
      <Page>
        <PageHeader title={t("state.ready_for_sale")} />
        <EmptyState icon={Beef} title={t("ready.none")} />
      </Page>
    );
  }

  const deciding: Deciding = {
    keeping,
    reason,
    confirming: confirm.isPending,
    onKeep: (tagNumber) => {
      setKeeping(tagNumber);
      setReason("");
    },
    onReason: setReason,
    onConfirm: (row) => confirm.mutate({ tagNumber: row.tagNumber }),
    onSetAside: (row) =>
      setAside.mutate({
        tagNumber: row.tagNumber,
        grounds: row.grounds,
        reason: reason.trim(),
      }),
  };

  return (
    <Page>
      <PageHeader title={t("state.ready_for_sale")} />
      <ul className="space-y-3 md:hidden">
        {suggestions.data.map((row) => (
          <SuggestionCard deciding={deciding} key={row.id} row={row} />
        ))}
      </ul>
      <ReadyTable deciding={deciding} suggestions={suggestions.data} />
    </Page>
  );
};

export const Route = createFileRoute("/_auth/ready")({
  beforeLoad: onlyFor("runsTheFarm"),
  component: ReadyPage,
});
