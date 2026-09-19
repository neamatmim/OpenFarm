import type { AlertKind } from "@OpenFarm/domain";
import { SAYS } from "@OpenFarm/domain";
import type { Language, MessageKey } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  BellRing,
  ChevronDown,
  ChevronUp,
  OctagonAlert,
} from "lucide-react";
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

/** Which Venture, how many are waiting and what brought it round, for the notice that Investors are due
 *  their paper. The occasion arrives already worded, because the word the code keeps would print
 *  `buying_closed` into the middle of a Bangla sentence. */
const papersDue = (raw: Record<string, unknown>) => ({
  venture: String(raw.venture ?? ""),
  investors: Number(raw.investors ?? 0),
  occasion: String(raw.occasion ?? ""),
});

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
    ...papersDue(raw),
    /** When the Registration runs out, for the notice about its renewal. */
    date:
      typeof raw.expiresOn === "string"
        ? formatDate(new Date(raw.expiresOn), language, "date")
        : "",
  };
};

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

/** One notice, in the reader's language, with why an Effect stood aside where that is what it is about. */
const NoticeWords = ({
  notice,
  truncate = false,
}: {
  notice: { kind: string; params: unknown };
  truncate?: boolean;
}) => {
  const { t, language } = useLanguage();
  const key = messageFor(notice.kind);
  const because = becauseOf(notice.params);
  const said = key
    ? t(
        key,
        paramsOf(notice.params, { language, wholeFarm: t("work.wholeFarm") })
      )
    : notice.kind;
  if (truncate) {
    return <span className="block truncate">{said}</span>;
  }
  return (
    <>
      {said}
      {because ? (
        <span className="text-muted-foreground block">{t(because)}</span>
      ) : null}
    </>
  );
};

/** Which Venture a notice is about, read as defensively as the rest of the snapshotted params are. */
const ventureOf = (params: unknown): string | null => {
  const id = (params as { ventureId?: unknown } | null)?.ventureId;
  return typeof id === "string" && id !== "" ? id : null;
};

/**
 * Where a notice leads, for the one kind that has somewhere to send her.
 *
 * Most notices have nowhere to go — the sentence is the whole of what they have to say, and "got it" is
 * the only answer they want. This one is different: it says a paper is owed, and the paper is made on a
 * screen she would otherwise have to go and find. One kind on purpose; a general table of routes would
 * be a mechanism built for a single caller.
 */
const WhereItLeads = ({
  notice,
}: {
  notice: { kind: string; params: unknown };
}) => {
  const { t } = useLanguage();
  const ventureId =
    notice.kind === "investor_statement_due" ? ventureOf(notice.params) : null;
  return ventureId === null ? null : (
    <Link
      className="text-primary mt-1 block text-sm font-medium hover:underline"
      search={{ statements: ventureId }}
      to="/ventures"
    >
      {t("alerts.makeThePaper")}
    </Link>
  );
};

/** The mark beside a notice: louder for late work and a notifiable disease than for the rest. */
const NoticeIcon = ({ kind }: { kind: string }) =>
  URGENT.has(kind) ? (
    <OctagonAlert aria-hidden className="text-danger mt-0.5 size-5 shrink-0" />
  ) : (
    <AlertTriangle
      aria-hidden
      className="text-warning mt-0.5 size-5 shrink-0"
    />
  );

/**
 * What this person is being told, as a banner that takes one line until it is opened: how many notices there are and
 * the loudest of them, so the work below stays on the first screen of a phone. Opened, every notice is listed, the
 * loudest first, each with its "got it".
 *
 * Raising the notices is the same call however anyone opens the app: it is idempotent, so no scheduler has to have run
 * for the farm to know its work is late.
 */
export const AlertList = () => {
  const { t, language } = useLanguage();
  const [open, setOpen] = useState(false);
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
  // The loudest first; within each, the order the farm gave them.
  const notices = alerts.data.toSorted(
    (a, b) => Number(URGENT.has(b.kind)) - Number(URGENT.has(a.kind))
  );
  const [loudest] = notices;
  const urgent = notices.some((notice) => URGENT.has(notice.kind));
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <section
      aria-label={t("alerts.title")}
      className={cn(
        "bg-card overflow-hidden rounded-xl border",
        urgent ? "border-danger/35" : "border-warning/35"
      )}
    >
      <button
        aria-expanded={open}
        className="hover:bg-muted/50 focus-visible:ring-ring flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset"
        onClick={() => setOpen((shown) => !shown)}
        type="button"
      >
        <BellRing
          aria-hidden
          className={cn(
            "size-5 shrink-0",
            urgent ? "text-danger" : "text-warning"
          )}
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-2 text-sm font-semibold">
            {t("alerts.title")}
            <StatusBadge tone={urgent ? "danger" : "warning"}>
              {formatNumber(notices.length, language)}
            </StatusBadge>
          </span>
          {open || !loudest ? null : (
            <span className="text-muted-foreground min-w-0 text-sm">
              <NoticeWords notice={loudest} truncate />
            </span>
          )}
        </span>
        <span className="text-primary flex shrink-0 items-center gap-1 text-sm font-medium">
          <span className="hidden sm:inline">
            {open
              ? t("alerts.showFewer")
              : t("alerts.showAll", {
                  count: formatNumber(notices.length, language),
                })}
          </span>
          <Chevron aria-hidden className="size-4" />
        </span>
      </button>
      {open ? (
        <ul className="divide-border divide-y border-t">
          {notices.map((notice) => (
            <li className="flex items-start gap-3 px-4 py-3" key={notice.id}>
              <NoticeIcon kind={notice.kind} />
              <p className="min-w-0 flex-1 text-sm">
                <NoticeWords notice={notice} />
                <WhereItLeads notice={notice} />
              </p>
              <Button
                className="h-11 shrink-0 md:h-8"
                onClick={() => dismiss.mutate({ id: notice.id })}
                size="sm"
                variant="ghost"
              >
                {t("alerts.dismiss")}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
};
