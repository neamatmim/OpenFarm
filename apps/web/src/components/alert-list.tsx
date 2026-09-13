import type { AlertKind } from "@OpenFarm/domain";
import type { Language, MessageKey } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BellRing, OctagonAlert } from "lucide-react";
import { useState } from "react";

import { StatusBadge } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { hoursLate } from "@/lib/lateness";
import { orpc } from "@/utils/orpc";

/** Every kind of Alert has something to say. Typed by the kind rather than by string, so a
 *  new one is a compile error here rather than a row that renders as its own name. */
const MESSAGE_FOR: Record<AlertKind, MessageKey> = {
  instance_overdue: "alerts.instanceOverdue",
  instance_escalated: "alerts.instanceEscalated",
  instance_sent_back: "alerts.instanceSentBack",
  needs_review: "alerts.needsReview",
  sop_published: "alerts.sopPublished",
  sop_proposed: "alerts.sopProposed",
  withdrawal_ending: "alerts.withdrawalEnding",
  notifiable_diagnosis: "alerts.notifiableDiagnosis",
  entry_rejected: "alerts.entryRejected",
  withdrawal_changed: "alerts.withdrawalChanged",
  low_stock: "alerts.lowStock",
  money_awaiting_approval: "alerts.moneyAwaiting",
  registration_renewal_due: "alerts.registrationRenewal",
};

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

const messageFor = (kind: string): MessageKey | null =>
  (MESSAGE_FOR as Record<string, MessageKey>)[kind] ?? null;

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
