import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { CircleCheck } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { categoryName, useApproveMoney } from "@/components/money";
import {
  EmptyState,
  Notice,
  Page,
  PageHeader,
  Section,
  StatusBadge,
} from "@/components/page";
import { useLanguage, useT } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/** The Registration's renewal on the Owner's list: to the renewal work when it has been raised, and to the farm
 *  page when it has not. */
const RenewalRow = ({
  renewal,
}: {
  renewal: {
    expiresOn: Date | null;
    expired: boolean;
    instanceId: string | null;
  };
}) => {
  const t = useT();
  const { language } = useLanguage();
  const said = t(
    renewal.expired ? "owner.registrationExpired" : "owner.registrationEnding",
    {
      date: renewal.expiresOn
        ? formatDate(renewal.expiresOn, language, "date")
        : "—",
    }
  );
  return renewal.instanceId ? (
    <Link
      className="font-medium hover:underline"
      params={{ instanceId: renewal.instanceId }}
      to="/work/$instanceId"
    >
      {said}
    </Link>
  ) : (
    <Link className="font-medium hover:underline" to="/admin/farm">
      {said}
    </Link>
  );
};

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
  const approveMoney = useApproveMoney();

  // Cached first, error second. A phone with no signal has the farm as it last knew it,
  // and a screen that throws that away to show the word "error" has taken away the only
  // thing it had — the sync banner above already says how old it is.
  if (!home.data) {
    return (
      <Page>
        <PageHeader title={t("owner.title")} />
        {home.isError ? (
          <Notice title={t("common.error")} tone="danger" />
        ) : (
          <Skeleton className="h-64 rounded-xl" />
        )}
      </Page>
    );
  }
  const { needsYou, tiles } = home.data;
  const waiting =
    needsYou.overdue.length +
    needsYou.approvals.length +
    needsYou.proposals.length +
    needsYou.needsReview.length +
    needsYou.endingWithdrawal.length +
    needsYou.lowStock.length +
    needsYou.moneyAwaiting.length +
    (needsYou.registrationRenewal ? 1 : 0);

  return (
    <Page width="wide">
      <PageHeader
        description={t("owner.subtitle")}
        eyebrow={formatDate(new Date(), language, "date")}
        meta={
          waiting > 0 ? (
            <StatusBadge tone="warning">
              {t("owner.waitingCount", {
                count: formatNumber(waiting, language),
              })}
            </StatusBadge>
          ) : (
            <StatusBadge tone="success">{t("owner.allFine")}</StatusBadge>
          )
        }
        title={t("owner.title")}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Section id="needs-you" title={t("owner.needsYou")}>
          {waiting === 0 ? (
            <EmptyState
              description={t("owner.allFineHint")}
              icon={CircleCheck}
              title={t("owner.allFine")}
            />
          ) : null}
          <div className="flex flex-col gap-5">
            <Exceptions
              count={needsYou.overdue.length}
              label={t("home.overdue")}
            >
              {needsYou.overdue.map((row) => (
                <li className="relative py-3 text-sm" key={row.id}>
                  <Link
                    className="font-medium hover:underline"
                    params={{ instanceId: row.id }}
                    to="/work/$instanceId"
                  >
                    {row.sopBn} · {row.pen ?? t("work.wholeFarm")}
                  </Link>
                  {row.escalated ? (
                    <span className="ml-2 inline-flex align-middle">
                      <StatusBadge tone="danger">
                        {t("owner.escalated")}
                      </StatusBadge>
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
                <li className="relative py-3 text-sm" key={row.id}>
                  <Link
                    className="font-medium hover:underline"
                    params={{ instanceId: row.id }}
                    to="/work/$instanceId"
                  >
                    {row.sopBn} · {row.pen ?? t("work.wholeFarm")}
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
                  className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                  key={row.id}
                >
                  <Link
                    className="font-medium hover:underline"
                    to="/admin/sops"
                  >
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

            {needsYou.registrationRenewal ? (
              <Exceptions count={1} label={t("owner.registrationRenewal")}>
                <li className="relative py-3 text-sm">
                  <RenewalRow renewal={needsYou.registrationRenewal} />
                </li>
              </Exceptions>
            ) : null}

            <Exceptions
              count={needsYou.moneyAwaiting.length}
              label={t("owner.moneyAwaiting")}
            >
              {needsYou.moneyAwaiting.map((row) => (
                <li
                  className="flex items-center justify-between gap-2 py-3 text-sm"
                  key={row.id}
                >
                  <Link className="font-medium hover:underline" to="/money">
                    {categoryName(row, language)} · ৳
                    {formatNumber(row.amountBdt, language)}
                    {row.counterpartyName ? ` · ${row.counterpartyName}` : ""}
                  </Link>
                  <Button
                    disabled={approveMoney.isPending}
                    onClick={() =>
                      approveMoney.mutate({
                        id: row.id,
                        amountBdt: row.amountBdt,
                      })
                    }
                    size="sm"
                    variant="outline"
                  >
                    {t("money.approve")}
                  </Button>
                </li>
              ))}
            </Exceptions>

            <Exceptions
              count={needsYou.lowStock.length}
              label={t("home.lowStock")}
            >
              {needsYou.lowStock.map((line) => (
                <li className="relative py-3 text-sm" key={line.feedItemId}>
                  <Link
                    className="font-medium hover:underline"
                    to="/admin/feed"
                  >
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
                <li className="relative py-3 text-sm" key={row.id}>
                  {row.instanceId ? (
                    <Link
                      className="font-medium hover:underline"
                      params={{ instanceId: row.instanceId }}
                      to="/work/$instanceId"
                    >
                      {t(`review.${row.reason}` as MessageKey)}
                    </Link>
                  ) : (
                    <Link
                      className="font-medium hover:underline"
                      to="/admin/sign-off"
                    >
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
                <li className="relative py-3 text-sm" key={row.id}>
                  <Link
                    className="font-medium hover:underline"
                    params={{ tagNumber: row.tagNumber }}
                    to="/animals/$tagNumber"
                  >
                    {row.tagNumber}
                  </Link>
                </li>
              ))}
            </Exceptions>
          </div>
        </Section>

        <section aria-labelledby="farm-today" className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold" id="farm-today">
            {t("home.tiles")}
          </h2>
          <div className="grid grid-cols-2 gap-3 md:gap-4">
            <div className="surface col-span-2 flex flex-col gap-3 p-4 md:p-5">
              <p className="text-muted-foreground text-sm">
                {t("owner.bulkToday")}
              </p>
              <p className="text-2xl leading-none font-semibold tabular-nums md:text-3xl">
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
            <Link
              className="surface flex flex-col gap-2 p-4 transition-shadow hover:shadow-md md:p-5"
              search={{}}
              to="/today"
            >
              <p className="text-muted-foreground text-sm">
                {t("home.workDone")}
              </p>
              <p className="text-2xl leading-none font-semibold tabular-nums md:text-3xl">
                {t("home.progress", {
                  done: formatNumber(tiles.workDone, language),
                  raised: formatNumber(tiles.workRaised, language),
                })}
              </p>
            </Link>
            <div className="surface flex flex-col gap-2 p-4 md:p-5">
              <p className="text-muted-foreground text-sm">
                {t("owner.discardToday")}
              </p>
              <p className="text-2xl leading-none font-semibold tabular-nums md:text-3xl">
                {t("owner.litres", {
                  litres: formatNumber(tiles.discardToday, language),
                })}
              </p>
            </div>
            <Link
              className="surface flex flex-col gap-2 p-4 transition-shadow hover:shadow-md md:p-5"
              to="/animals"
            >
              <p className="text-muted-foreground text-sm">
                {t("home.cowsHeld")}
              </p>
              <p className="text-2xl leading-none font-semibold tabular-nums md:text-3xl">
                {formatNumber(tiles.underWithdrawal, language)}
              </p>
            </Link>
            {/* What the farm has lost lately. The register an inspector reads comes later; the
              number a farm lives by belongs with the Owner's other numbers now. */}
            <div className="surface flex flex-col gap-2 p-4 md:p-5">
              <p className="text-muted-foreground text-sm">{t("home.died")}</p>
              <p className="text-2xl leading-none font-semibold tabular-nums md:text-3xl">
                {formatNumber(tiles.died, language)}
              </p>
            </div>
            <div className="surface flex flex-col gap-2 p-4 md:p-5">
              <p className="text-muted-foreground text-sm">
                {t("home.culled")}
              </p>
              <p className="text-2xl leading-none font-semibold tabular-nums md:text-3xl">
                {formatNumber(tiles.culled, language)}
              </p>
            </div>
          </div>
          <p className="text-muted-foreground text-xs">{t("owner.later")}</p>
        </section>
      </div>
    </Page>
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
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2 pb-1">
        <h3 className="text-sm font-semibold">{label}</h3>
        <StatusBadge tone="warning">
          {formatNumber(count, language)}
        </StatusBadge>
      </div>
      <ul className="divide-border flex flex-col divide-y">{children}</ul>
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
    <div className="flex h-16 items-end gap-1.5">
      {days.map((one) => (
        <span
          aria-label={`${one.day}: ${formatNumber(one.litres, language)}`}
          className="bg-primary/70 w-full rounded-sm"
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
