import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Beef } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { GainColumn } from "@/components/gain";
import { EmptyState, Notice, Page, PageHeader } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/** The refusal the farm gives for an animal still inside her meat Withdrawal, with the day. */
const fitOnFrom = (error: unknown): string | null => {
  const data = (error as { data?: { refusal?: string; fitOn?: string } })?.data;
  return data?.refusal === "meat_withdrawal" ? (data.fitOn ?? null) : null;
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
      <Page className="max-w-4xl">
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
      <Page className="max-w-4xl">
        <PageHeader title={t("state.ready_for_sale")} />
        <EmptyState icon={Beef} title={t("ready.none")} />
      </Page>
    );
  }

  return (
    <Page width="default" className="max-w-4xl">
      <PageHeader title={t("state.ready_for_sale")} />
      <ul className="space-y-3">
        {suggestions.data.map((row) => (
          <li className="surface space-y-2 p-4" key={row.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link
                className="text-lg font-bold underline"
                params={{ tagNumber: row.tagNumber }}
                to="/animals/$tagNumber"
              >
                {row.tagNumber}
              </Link>
              <span className="text-muted-foreground text-sm">
                {row.penName}
              </span>
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
              <GainColumn
                basis={row.sinceIntake}
                label={t("gain.sinceIntake")}
              />
              <GainColumn basis={row.recent} label={t("gain.recent")} />
            </div>

            {keeping === row.tagNumber ? (
              <form
                className="space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  setAside.mutate({
                    tagNumber: row.tagNumber,
                    grounds: row.grounds,
                    reason: reason.trim(),
                  });
                }}
              >
                <Label htmlFor={`why-${row.id}`}>
                  {t("ready.setAsideWhy")}
                </Label>
                <Input
                  id={`why-${row.id}`}
                  maxLength={300}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  value={reason}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => setKeeping(null)}
                    type="button"
                    variant="ghost"
                  >
                    {t("work.back")}
                  </Button>
                  <Button disabled={!reason.trim()} type="submit">
                    {t("ready.setAside")}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => {
                    setKeeping(row.tagNumber);
                    setReason("");
                  }}
                  variant="outline"
                >
                  {t("ready.setAside")}
                </Button>
                <Button
                  disabled={confirm.isPending}
                  onClick={() => confirm.mutate({ tagNumber: row.tagNumber })}
                >
                  {t("ready.confirm")}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Page>
  );
};

export const Route = createFileRoute("/_auth/ready")({
  component: ReadyPage,
});
