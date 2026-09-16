import type { AlertKind } from "@OpenFarm/domain";
import { SAYS } from "@OpenFarm/domain";
import type { Language, MessageKey } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BellRing, OctagonAlert } from "lucide-react";
import { useState } from "react";

import { StatusBadge } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { STANDING_ASIDE_WORDS } from "@/lib/correction-refusal";
import { hoursLate } from "@/lib/lateness";
import { orpc } from "@/utils/orpc";

/** What each kind says in the farm's own list, from the farm's own words for it — one table, which the phone, the
 *  pocket, the evening's post and the two that go by text all read. */
const messageFor = (kind: string): MessageKey | null =>
  kind in SAYS ? SAYS[kind as AlertKind].app : null;

/** The Alert's snapshotted params arrive as jsonb, so the shape is the server's promise
 *  rather than the type system's; read defensively and in the reader's language. */
const paramsOf = (
  params: unknown,
  {
    language,
    wholeFarm,
  }: {
    language: Language;
    /** Where work about the whole farm is, which has no Pen to name. */
    wholeFarm: string;
  }
): Record<string, string | number> => {
  const raw = (params ?? {}) as Record<string, unknown>;
  const bangla = language === "bn";
  return {
    sop: String((bangla ? raw.sopBn : raw.sopEn) ?? raw.sopBn ?? ""),
    pen: typeof raw.pen === "string" ? raw.pen : wholeFarm,
    reason: String(raw.reason ?? ""),
    hours: hoursLate(Number(raw.minutesOverdue ?? 0)),
    /** A cow, for the notices that are about one rather than about a piece of work. */
    tag: String(raw.tag ?? ""),
    /** What the Vet called it, for the one notice that is about a disease. */
    disease: String(raw.disease ?? ""),
    /** How many, for the notice about entries the farm would not take. */
    count: Number(raw.count ?? 0),
    /** The Feed Item, how much is left and in what, for the notice about running low. */
    feed: String(raw.nameBn ?? ""),
    onHand: Number(raw.onHand ?? 0),
    unit: String(raw.unit ?? ""),
    /** How much and under what Category, for the notice about money waiting for the Owner. */
    amount: Number(raw.amountBdt ?? 0),
    category: String(
      (bangla ? raw.categoryBn : raw.categoryEn) ?? raw.categoryBn ?? ""
    ),
    /** When the Registration runs out, for the notice about its renewal. */
    date:
      typeof raw.expiresOn === "string"
        ? formatDate(new Date(raw.expiresOn), language, "date")
        : "",
  };
};

/** How many notices show before the rest wait behind "show all": the work below them is what the person came for. */
const FIRST_SHOWN = 2;

/** Notices about work already late, drawn with the same severity as the late work itself. */
const URGENT: ReadonlySet<string> = new Set([
  "instance_overdue",
  "instance_escalated",
  "notifiable_diagnosis",
]);

/** Why an Effect stood aside, for a Needs Review a Correction raised so: what the farm knew that the entry did not. */
const becauseOf = (params: unknown): MessageKey | null => {
  const because = (params as { because?: unknown } | null)?.because;
  return typeof because === "string" && because in STANDING_ASIDE_WORDS
    ? STANDING_ASIDE_WORDS[because as keyof typeof STANDING_ASIDE_WORDS]
    : null;
};

/**
 * What this person is being told. Raising the notices is the same call however anyone opens
 * the app: it is idempotent, so no scheduler has to have run for the farm to know its work
 * is late.
 */
export const AlertList = () => {
  const { t, language } = useLanguage();
  const [showAll, setShowAll] = useState(false);
  const queryClient = useQueryClient();
  const alerts = useQuery(orpc.alerts.mine.queryOptions({ input: {} }));
  const dismiss = useMutation(
    orpc.alerts.dismiss.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: orpc.alerts.key() }),
    })
  );

  if (!alerts.data?.length) {
    return null;
  }
  const notices = alerts.data;
  const shown = showAll ? notices : notices.slice(0, FIRST_SHOWN);
  return (
    <section
      aria-label={t("alerts.title")}
      className="bg-card overflow-hidden rounded-xl border"
    >
      <div className="bg-muted/50 flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <BellRing aria-hidden className="text-warning size-4" />
          {t("alerts.title")}
        </h2>
        <StatusBadge tone="warning">
          {formatNumber(notices.length, language)}
        </StatusBadge>
      </div>
      <ul className="divide-border divide-y">
        {shown.map((notice) => {
          const key = messageFor(notice.kind);
          const because = becauseOf(notice.params);
          const urgent = URGENT.has(notice.kind);
          return (
            <li className="flex items-start gap-3 px-4 py-3" key={notice.id}>
              {urgent ? (
                <OctagonAlert
                  aria-hidden
                  className="text-danger mt-0.5 size-5 shrink-0"
                />
              ) : (
                <AlertTriangle
                  aria-hidden
                  className="text-warning mt-0.5 size-5 shrink-0"
                />
              )}
              <p className="flex-1 text-sm">
                {key
                  ? t(
                      key,
                      paramsOf(notice.params, {
                        language,
                        wholeFarm: t("work.wholeFarm"),
                      })
                    )
                  : notice.kind}
                {because ? (
                  <span className="text-muted-foreground block">
                    {t(because)}
                  </span>
                ) : null}
              </p>
              <Button
                className="shrink-0"
                onClick={() => dismiss.mutate({ id: notice.id })}
                size="sm"
                variant="ghost"
              >
                {t("alerts.dismiss")}
              </Button>
            </li>
          );
        })}
      </ul>
      {FIRST_SHOWN < notices.length ? (
        <button
          className="text-primary hover:bg-muted/60 w-full border-t px-4 py-2.5 text-sm font-medium"
          onClick={() => setShowAll((all) => !all)}
          type="button"
        >
          {showAll
            ? t("alerts.showFewer")
            : t("alerts.showAll", {
                count: formatNumber(notices.length, language),
              })}
        </button>
      ) : null}
    </section>
  );
};
