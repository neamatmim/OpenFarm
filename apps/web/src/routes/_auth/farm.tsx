import { formatNumber } from "@OpenFarm/i18n";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

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
  const home = useQuery(orpc.home.owner.queryOptions());

  if (home.isError) {
    return <p className="p-6">{t("common.error")}</p>;
  }
  if (!home.data) {
    return <p className="p-6">{t("common.loading")}</p>;
  }
  const { needsYou, tiles } = home.data;
  const waiting =
    needsYou.overdue.length +
    needsYou.proposals.length +
    needsYou.needsReview.length +
    needsYou.endingWithdrawal.length;

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
                  {t("alerts.instanceEscalated", { sop: "", pen: "" }).trim()}
                </span>
              ) : null}
            </li>
          ))}
        </Exceptions>

        <Exceptions
          count={needsYou.proposals.length}
          label={t("owner.proposals")}
        >
          {needsYou.proposals.map((row) => (
            <li className="rounded-lg border p-2 text-sm" key={row.id}>
              <Link className="underline" to="/admin/sops">
                {row.note ?? t("owner.proposals")}
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
              <Link className="underline" to="/admin/sign-off">
                {row.reason}
              </Link>
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
            <Bars sessions={tiles.sessions} />
            <p className="text-muted-foreground text-xs">{t("owner.week")}</p>
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
          <Link className="rounded-xl border p-3" to="/animals">
            <p className="text-muted-foreground text-sm">
              {t("home.cowsHeld")}
            </p>
            <p className="text-lg font-medium">
              {formatNumber(tiles.underWithdrawal, language)}
            </p>
          </Link>
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

/** The last seven milkings, oldest on the left: a day is read against the week around it. */
const Bars = ({ sessions }: { sessions: number[] }) => {
  const most = Math.max(...sessions, 1);
  return (
    <div className="flex h-10 items-end gap-1">
      {sessions.toReversed().map((litres, index) => (
        <span
          className="w-full rounded-sm bg-sky-700"
          key={`${index}-${litres}`}
          style={{ height: `${Math.max((litres / most) * 100, 4)}%` }}
        />
      ))}
    </div>
  );
};

export const Route = createFileRoute("/_auth/farm")({
  component: OwnerHome,
});
