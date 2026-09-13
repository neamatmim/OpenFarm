import type { RepeatBreederDecision } from "@OpenFarm/domain";
import { REPEAT_BREEDER_DECISIONS } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

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
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const ensureDue = useMutation(orpc.instances.ensureDue.mutationOptions({}));
  const sweep = useMutation(orpc.alerts.sweep.mutationOptions({}));
  const digest = useMutation(orpc.alerts.digest.mutationOptions({}));
  const home = useQuery(orpc.home.manager.queryOptions());

  // The Manager often opens this before anybody has opened Today, and the day's work is
  // raised by whoever opens the app first. Without this the screen would say the farm had
  // nothing to do at six in the morning, which is the one hour it is certainly wrong.
  const raise = ensureDue.mutateAsync;
  const tell = sweep.mutateAsync;
  const carry = digest.mutateAsync;
  useEffect(() => {
    const run = async () => {
      try {
        await raise();
        await tell();
        await carry();
        await queryClient.invalidateQueries({ queryKey: orpc.home.key() });
      } catch {
        // No signal: the screen shows what this phone last knew.
      }
    };
    void run();
  }, [raise, tell, carry, queryClient]);
  const sheds = useQuery(orpc.herd.list.queryOptions());
  const penNames = new Map(
    (sheds.data ?? []).flatMap((shed) =>
      shed.pens.map((pen) => [pen.id, `${shed.name} / ${pen.name}`] as const)
    )
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
  const { queue, pens } = home.data;
  const waiting =
    queue.overdue.length +
    queue.signOff.length +
    queue.needsReview.length +
    queue.withdrawal.length +
    queue.meatWithdrawal.length +
    queue.repeatBreeders.length;

  return (
    <div className="container mx-auto max-w-2xl space-y-6 px-4 py-6">
      <h1 className="text-lg font-medium">{t("home.title")}</h1>

      <section className="space-y-2">
        <h2 className="font-medium">{t("home.tiles")}</h2>
        <div className="grid grid-cols-2 gap-2">
          <Link
            className="rounded-xl border p-3 text-sm"
            search={{}}
            to="/today"
          >
            <span className="text-muted-foreground">{t("home.workDone")}</span>
            <span className="block text-lg font-medium">
              {t("home.progress", {
                done: formatNumber(home.data.tiles.workDone, language),
                raised: formatNumber(home.data.tiles.workRaised, language),
              })}
            </span>
          </Link>
          <Link className="rounded-xl border p-3 text-sm" to="/animals">
            <span className="text-muted-foreground">{t("home.cowsHeld")}</span>
            <span className="block text-lg font-medium">
              {formatNumber(home.data.tiles.underWithdrawal, language)}
            </span>
          </Link>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">{t("home.queue")}</h2>
        {waiting === 0 ? (
          <p className="rounded-xl bg-emerald-950 p-3 text-sm text-emerald-100">
            {t("home.allClear")}
          </p>
        ) : null}

        <QueueBlock count={queue.overdue.length} label={t("home.overdue")}>
          {queue.overdue.map((row) => (
            <QueueRow key={row.id}>
              <Link
                className="underline"
                params={{ instanceId: row.id }}
                to="/work/$instanceId"
              >
                {row.sopBn} · {row.pen}
              </Link>
            </QueueRow>
          ))}
        </QueueBlock>

        <QueueBlock count={queue.signOff.length} label={t("home.signOff")}>
          {queue.signOff.map((row) => (
            <QueueRow key={row.id}>
              <Link
                className="underline"
                params={{ instanceId: row.id }}
                to="/work/$instanceId"
              >
                {row.sopBn} · {row.pen}
              </Link>
            </QueueRow>
          ))}
        </QueueBlock>

        <QueueBlock
          count={queue.repeatBreeders.length}
          label={t("home.repeatBreeders")}
        >
          {queue.repeatBreeders.map((row) => (
            <QueueRow key={row.animalId}>
              <RepeatBreeder row={row} />
            </QueueRow>
          ))}
        </QueueBlock>

        <QueueBlock
          count={queue.needsReview.length}
          label={t("home.needsReview")}
        >
          {queue.needsReview.map((row) => (
            <QueueRow key={row.id}>
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
            </QueueRow>
          ))}
        </QueueBlock>

        <QueueBlock
          count={queue.withdrawal.length}
          label={t("home.withdrawal")}
        >
          {queue.withdrawal.map((row) => (
            <QueueRow key={row.id}>
              <Link
                className="underline"
                params={{ tagNumber: row.tagNumber }}
                to="/animals/$tagNumber"
              >
                {row.tagNumber}
              </Link>
              {row.until ? (
                <span
                  className={
                    row.endingSoon
                      ? "ml-2 text-amber-400"
                      : "text-muted-foreground ml-2"
                  }
                >
                  {t("home.until", {
                    date: formatDate(new Date(row.until), language, "date"),
                  })}
                </span>
              ) : null}
            </QueueRow>
          ))}
        </QueueBlock>

        <QueueBlock
          count={queue.meatWithdrawal.length}
          label={t("home.meatWithdrawal")}
        >
          {queue.meatWithdrawal.map((row) => (
            <QueueRow key={row.id}>
              <Link
                className="underline"
                params={{ tagNumber: row.tagNumber }}
                to="/animals/$tagNumber"
              >
                {row.tagNumber}
              </Link>
              {row.fitForSaleAt ? (
                <span className="text-muted-foreground ml-2">
                  {t("animals.meatHeldUntil", {
                    date: formatDate(
                      new Date(row.fitForSaleAt),
                      language,
                      "date"
                    ),
                  })}
                </span>
              ) : null}
            </QueueRow>
          ))}
        </QueueBlock>
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

/** One queue, or nothing at all: an empty heading is a line of furniture. Each row brings
 *  its own link, so the route and its parameters are typed where they are written. */
const QueueBlock = ({
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

/**
 * A cow somebody has to decide about: what she has failed at, what was decided last time, and the
 * answer. Serve her again, treat her, or cull her — a decision recorded, never a State changed.
 */
const RepeatBreeder = ({
  row,
}: {
  row: {
    tagNumber: string;
    failedAttempts: number;
    failures: { serviceId: string; servedAt: Date }[];
    lastAnswer: { decision: string; note: string } | null;
  };
}) => {
  const t = useT();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const [decision, setDecision] =
    useState<RepeatBreederDecision>("serve_again");
  const [note, setNote] = useState("");
  const answer = useMutation(
    orpc.breeding.answerRepeatBreeder.mutationOptions({
      onSuccess: async () => {
        setNote("");
        await queryClient.invalidateQueries({ queryKey: orpc.home.key() });
      },
      onError: (error) => toast.error(error.message || t("common.error")),
    })
  );
  return (
    <div className="space-y-1">
      <Link
        className="underline"
        params={{ tagNumber: row.tagNumber }}
        to="/animals/$tagNumber"
      >
        {row.tagNumber}
      </Link>{" "}
      ·{" "}
      {t("home.failedAttempts", {
        count: formatNumber(row.failedAttempts, language),
      })}
      <p className="text-muted-foreground text-xs">
        {row.failures
          .map((one) => formatDate(one.servedAt, language))
          .join(", ")}
      </p>
      {row.lastAnswer ? (
        <p className="text-muted-foreground text-xs">
          {t("home.lastAnswer", {
            decision: t(
              `repeatBreeder.${row.lastAnswer.decision}` as MessageKey
            ),
            note: row.lastAnswer.note,
          })}
        </p>
      ) : null}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          answer.mutate({ tagNumber: row.tagNumber, decision, note });
        }}
      >
        <select
          aria-label={t("home.decision")}
          className="bg-background h-9 rounded-md border px-2 text-sm"
          onChange={(event) =>
            setDecision(event.target.value as RepeatBreederDecision)
          }
          value={decision}
        >
          {REPEAT_BREEDER_DECISIONS.map((one) => (
            <option key={one} value={one}>
              {t(`repeatBreeder.${one}`)}
            </option>
          ))}
        </select>
        <Input
          aria-label={t("home.why")}
          className="w-48"
          onChange={(event) => setNote(event.target.value)}
          value={note}
        />
        <Button
          disabled={!note.trim()}
          size="sm"
          type="submit"
          variant="outline"
        >
          {t("home.answer")}
        </Button>
      </form>
    </div>
  );
};

/** One line of a queue: what it is, and the way to it. */
const QueueRow = ({ children }: { children: ReactNode }) => (
  <li className="rounded-lg border p-2 text-sm">{children}</li>
);

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
      <Link className="underline" search={{ pen: pen.penId }} to="/today">
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
