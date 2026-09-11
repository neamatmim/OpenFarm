import { formatNumber } from "@OpenFarm/i18n";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

import { useLanguage, useT } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/**
 * The screen the Manager runs the day from: what needs them, then how the day is going pen
 * by pen.
 *
 * Every number is a link. A count with no way to reach what it counts is a number people
 * stop believing, and a home screen full of those is a home screen nobody opens.
 */
const ManagerHome = () => {
  const t = useT();
  const home = useQuery(orpc.home.manager.queryOptions());
  const sheds = useQuery(orpc.herd.list.queryOptions());
  const penNames = new Map(
    (sheds.data ?? []).flatMap((shed) =>
      shed.pens.map((pen) => [pen.id, `${shed.name} / ${pen.name}`] as const)
    )
  );

  if (!home.data) {
    return <p className="p-6">{t("common.loading")}</p>;
  }
  const { queue, pens } = home.data;
  const waiting =
    queue.overdue.length +
    queue.signOff.length +
    queue.needsReview.length +
    queue.withdrawal.length;

  return (
    <div className="container mx-auto max-w-2xl space-y-6 px-4 py-6">
      <h1 className="text-lg font-medium">{t("home.title")}</h1>

      <section className="space-y-3">
        <h2 className="font-medium">{t("home.queue")}</h2>
        {waiting === 0 ? (
          <p className="rounded-xl bg-emerald-950 p-3 text-sm text-emerald-100">
            {t("home.allClear")}
          </p>
        ) : null}

        <QueueBlock
          label={t("home.overdue")}
          rows={queue.overdue.map((row) => ({
            key: row.id,
            words: `${row.sopBn} · ${row.pen}`,
            to: "/work/$instanceId" as const,
            params: { instanceId: row.id },
          }))}
        />
        <QueueBlock
          label={t("home.signOff")}
          rows={queue.signOff.map((row) => ({
            key: row.id,
            words: `${row.sopBn} · ${row.pen}`,
            to: "/work/$instanceId" as const,
            params: { instanceId: row.id },
          }))}
        />
        <QueueBlock
          label={t("home.needsReview")}
          rows={queue.needsReview.map((row) => ({
            key: row.id,
            words: t(`review.${row.reason}`),
            to: "/admin/sign-off" as const,
            params: {},
          }))}
        />
        <QueueBlock
          label={t("home.withdrawal")}
          rows={queue.withdrawal.map((row) => ({
            key: row.id,
            words: row.tagNumber,
            to: "/animals/$tagNumber" as const,
            params: { tagNumber: row.tagNumber },
          }))}
        />
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">{t("home.pens")}</h2>
        {pens.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("home.nothingRaised")}
          </p>
        ) : (
          <ul className="space-y-2">
            {pens.map((pen) => (
              <PenProgress
                key={pen.penId}
                name={penNames.get(pen.penId) ?? pen.penId}
                pen={pen}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

/** One queue, or nothing at all: an empty heading is a line of furniture. */
const QueueBlock = ({
  label,
  rows,
}: {
  label: string;
  rows: {
    key: string;
    words: string;
    to: "/work/$instanceId" | "/admin/sign-off" | "/animals/$tagNumber";
    params: Record<string, string>;
  }[];
}) => {
  const { language } = useLanguage();
  if (rows.length === 0) {
    return null;
  }
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-sm">
        {label} · {formatNumber(rows.length, language)}
      </p>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.key}>
            <Link
              className="block rounded-lg border p-2 text-sm underline"
              params={row.params}
              to={row.to}
            >
              {row.words}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** How one Pen's day is going, and how many animals are standing in it. */
const PenProgress = ({
  name,
  pen,
}: {
  name: string;
  pen: { penId: string; raised: number; done: number; animals: number };
}) => {
  const t = useT();
  const { language } = useLanguage();
  const finished = pen.raised > 0 && pen.done === pen.raised;
  return (
    <li
      className={`flex items-baseline justify-between gap-2 rounded-lg border p-3 text-sm ${
        finished ? "border-emerald-800" : ""
      }`}
    >
      <Link className="underline" params={{ penId: pen.penId }} to="/today">
        {name}
      </Link>
      <span className="text-muted-foreground">
        {t("home.progress", {
          done: formatNumber(pen.done, language),
          raised: formatNumber(pen.raised, language),
        })}{" "}
        · {t("home.animalsIn", { count: formatNumber(pen.animals, language) })}
      </span>
    </li>
  );
};

export const Route = createFileRoute("/_auth/home")({
  component: ManagerHome,
});
