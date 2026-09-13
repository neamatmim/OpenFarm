import type { MessageKey } from "@OpenFarm/i18n";
import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { useLanguage, useT } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/**
 * The Owner's home: an exception list, and the farm's own figures under it.
 *
 * An empty list means the farm is fine, and that is the whole point of it — a screen that
 * always has something on it is a screen that stops meaning anything. Nothing here is typed
 * by anybody: every figure is worked out from what was recorded.
 */
const OwnerHome = () => {
  const t = useT();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const home = useQuery(orpc.home.owner.queryOptions());
  const approve = useMutation(
    orpc.sops.approveProposal.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: orpc.home.key() }),
      onError: (error) => toast.error(error.message),
    })
  );

  // Cached first, error second. A phone with no signal has the farm as it last knew it,
  // and a screen that throws that away to show the word "error" has taken away the only
  // thing it had — the sync banner above already says how old it is.
  if (!home.data) {
    return (
      <p className="p-6">
        {home.isError ? t("common.error") : t("common.loading")}
      </p>
    );
  }
  const { needsYou, tiles } = home.data;
  const waiting =
    needsYou.overdue.length +
    needsYou.approvals.length +
    needsYou.proposals.length +
    needsYou.needsReview.length +
    needsYou.endingWithdrawal.length +
    needsYou.lowStock.length;

  return (
    <div className="container mx-auto max-w-2xl space-y-6 px-4 py-6">
      <h1 className="text-lg font-medium">{t("owner.title")}</h1>

      <section className="space-y-3">
        <h2 className="font-medium">{t("owner.needsYou")}</h2>
        {waiting === 0 ? (
          <p className="rounded-xl bg-emerald-950 p-4 text-center text-emerald-100">
            {t("owner.allFine")}
          </p>
        ) : null}

        <Exceptions count={needsYou.overdue.length} label={t("home.overdue")}>
          {needsYou.overdue.map((row) => (
            <li className="rounded-lg border p-2 text-sm" key={row.id}>
              <Link
                className="underline"
                params={{ instanceId: row.id }}
                to="/work/$instanceId"
              >
                {row.sopBn} · {row.pen}
              </Link>
              {row.escalated ? (
                <span className="ml-2 text-amber-400">
                  {t("owner.escalated")}
                </span>
              ) : null}
            </li>
          ))}
        </Exceptions>

        <Exceptions
          count={needsYou.approvals.length}
          label={t("owner.approvals")}
        >
          {needsYou.approvals.map((row) => (
            <li className="rounded-lg border p-2 text-sm" key={row.id}>
              <Link
                className="underline"
                params={{ instanceId: row.id }}
                to="/work/$instanceId"
              >
                {row.sopBn} · {row.pen}
              </Link>
            </li>
          ))}
        </Exceptions>

        <Exceptions
          count={needsYou.proposals.length}
          label={t("owner.proposals")}
        >
          {needsYou.proposals.map((row) => (
            <li
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2 text-sm"
              key={row.id}
            >
              <Link className="underline" to="/admin/sops">
                {row.note || t("owner.noNote")}
              </Link>
              <Button
                disabled={approve.isPending}
                onClick={() => approve.mutate({ id: row.id })}
                size="sm"
                variant="outline"
              >
                {t("sop.approve")}
              </Button>
            </li>
          ))}
        </Exceptions>

        <Exceptions count={needsYou.lowStock.length} label={t("home.lowStock")}>
          {needsYou.lowStock.map((line) => (
            <li className="rounded-lg border p-2 text-sm" key={line.feedItemId}>
              <Link className="underline" to="/admin/feed">
                {t("home.lowStockLine", {
                  feed: line.nameBn,
                  onHand: formatNumber(line.onHand, language),
                  unit: line.unit,
                  threshold: formatNumber(line.threshold, language),
                })}
              </Link>
            </li>
          ))}
        </Exceptions>

        <Exceptions
          count={needsYou.needsReview.length}
          label={t("home.needsReview")}
        >
          {needsYou.needsReview.map((row) => (
            <li className="rounded-lg border p-2 text-sm" key={row.id}>
              {row.instanceId ? (
                <Link
                  className="underline"
                  params={{ instanceId: row.instanceId }}
                  to="/work/$instanceId"
                >
                  {t(`review.${row.reason}` as MessageKey)}
                </Link>
              ) : (
                <Link className="underline" to="/admin/sign-off">
                  {t(`review.${row.reason}` as MessageKey)}
                </Link>
              )}
            </li>
          ))}
        </Exceptions>

        <Exceptions
          count={needsYou.endingWithdrawal.length}
          label={t("owner.endingWithdrawal")}
        >
          {needsYou.endingWithdrawal.map((row) => (
            <li className="rounded-lg border p-2 text-sm" key={row.id}>
              <Link
                className="underline"
                params={{ tagNumber: row.tagNumber }}
                to="/animals/$tagNumber"
              >
                {row.tagNumber}
              </Link>
            </li>
          ))}
        </Exceptions>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">{t("home.tiles")}</h2>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1 rounded-xl border p-3">
            <p className="text-muted-foreground text-sm">
              {t("owner.bulkToday")}
            </p>
            <p className="text-lg font-medium">
              {t("owner.litres", {
                litres: formatNumber(tiles.bulkToday, language),
              })}
            </p>
            <Bars days={tiles.days} />
            <p className="text-muted-foreground text-xs">
              {t("owner.average", {
                litres: formatNumber(tiles.averageBulk, language),
              })}
            </p>
          </div>
          <Link className="rounded-xl border p-3" search={{}} to="/today">
            <p className="text-muted-foreground text-sm">
              {t("home.workDone")}
            </p>
            <p className="text-lg font-medium">
              {t("home.progress", {
                done: formatNumber(tiles.workDone, language),
                raised: formatNumber(tiles.workRaised, language),
              })}
            </p>
          </Link>
          <div className="rounded-xl border p-3">
            <p className="text-muted-foreground text-sm">
              {t("owner.discardToday")}
            </p>
            <p className="text-lg font-medium">
              {t("owner.litres", {
                litres: formatNumber(tiles.discardToday, language),
              })}
            </p>
          </div>
          <Link className="rounded-xl border p-3" to="/animals">
            <p className="text-muted-foreground text-sm">
              {t("home.cowsHeld")}
            </p>
            <p className="text-lg font-medium">
              {formatNumber(tiles.underWithdrawal, language)}
            </p>
          </Link>
          {/* What the farm has lost lately. The register an inspector reads comes later; the
              number a farm lives by belongs with the Owner's other numbers now. */}
          <div className="rounded-xl border p-3">
            <p className="text-muted-foreground text-sm">{t("home.died")}</p>
            <p className="text-lg font-medium">
              {formatNumber(tiles.died, language)}
            </p>
          </div>
          <div className="rounded-xl border p-3">
            <p className="text-muted-foreground text-sm">{t("home.culled")}</p>
            <p className="text-lg font-medium">
              {formatNumber(tiles.culled, language)}
            </p>
          </div>
        </div>
        <p className="text-muted-foreground text-xs">{t("owner.later")}</p>
      </section>
    </div>
  );
};

/** One kind of thing that needs the Owner, or nothing at all. */
const Exceptions = ({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: ReactNode;
}) => {
  const { language } = useLanguage();
  if (count === 0) {
    return null;
  }
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-sm">
        {label} · {formatNumber(count, language)}
      </p>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
};

/** The week behind today, oldest on the left: a day is read against the week around it.
 *  Each bar is one day of the farm's milk — every Pen's Sessions added together, which is
 *  what somebody means when they ask what yesterday came to. */
const Bars = ({ days }: { days: { day: string; litres: number }[] }) => {
  const { language } = useLanguage();
  const most = Math.max(...days.map((one) => one.litres), 1);
  return (
    <div className="flex h-10 items-end gap-1">
      {days.map((one) => (
        <span
          aria-label={`${one.day}: ${formatNumber(one.litres, language)}`}
          className="w-full rounded-sm bg-sky-700"
          key={one.day}
          style={{ height: `${Math.max((one.litres / most) * 100, 4)}%` }}
        />
      ))}
    </div>
  );
};

export const Route = createFileRoute("/_auth/farm")({
  component: OwnerHome,
});
