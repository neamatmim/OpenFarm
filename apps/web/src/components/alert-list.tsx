import type { AlertKind } from "@OpenFarm/domain";
import { SAYS, noticeFilling } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import { orpc } from "@/utils/orpc";

/** What each kind says in the farm's own list, from the farm's own words for it — one table, which the phone, the
 *  pocket, the evening's post and the two that go by text all read. */
const messageFor = (kind: string): MessageKey | null =>
  kind in SAYS ? SAYS[kind as AlertKind].app : null;

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
    ? t(key, noticeFilling(notice.kind, notice.params, language))
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

/** Which animal a notice names, where it names one by her tag. */
const tagOf = (params: unknown): string | null => {
  const tag = (params as { tag?: unknown } | null)?.tag;
  return typeof tag === "string" && tag !== "" ? tag : null;
};

/** The notices about a procedure itself — retired, brought back — which lead to its card. */
const ABOUT_A_PROCEDURE: ReadonlySet<string> = new Set([
  "sop_retired",
  "sop_restored",
]);

/** Which procedure a notice is about, for the way to its card. */
const procedureOf = (notice: {
  kind: string;
  params: unknown;
}): string | null => {
  if (!ABOUT_A_PROCEDURE.has(notice.kind)) {
    return null;
  }
  const id = (notice.params as { definitionId?: unknown } | null)?.definitionId;
  return typeof id === "string" && id !== "" ? id : null;
};

const LEADS_CLASS =
  "text-primary mt-1 block text-sm font-medium hover:underline";

/**
 * Where a notice leads: to what it is about, so the notice is a way there rather than a sentence to go and act on
 * somewhere else — the work that is late or was sent back, the animal it names, the Venture whose Investors are
 * owed a paper. A notice about none of these has nowhere to go, and "got it" is its only answer.
 */
const WhereItLeads = ({
  notice,
}: {
  notice: { kind: string; params: unknown; entity: string; entityId: string };
}) => {
  const { t } = useLanguage();
  if (notice.kind === "investor_statement_due") {
    const ventureId = ventureOf(notice.params);
    return ventureId === null ? null : (
      <Link
        className={LEADS_CLASS}
        params={{ ventureId }}
        search={{ tab: "investors" }}
        to="/ventures/$ventureId"
      >
        {t("alerts.makeThePaper")}
      </Link>
    );
  }
  const definitionId = procedureOf(notice);
  if (definitionId !== null) {
    return (
      <Link
        className={LEADS_CLASS}
        params={{ definitionId }}
        to="/cards/$definitionId"
      >
        {t("alerts.openTheCard")}
      </Link>
    );
  }
  if (notice.entity === "sop_instance") {
    return (
      <Link
        className={LEADS_CLASS}
        params={{ instanceId: notice.entityId }}
        to="/work/$instanceId"
      >
        {t("alerts.openTheWork")}
      </Link>
    );
  }
  const tagNumber = tagOf(notice.params);
  return tagNumber === null ? null : (
    <Link
      className={LEADS_CLASS}
      params={{ tagNumber }}
      to="/animals/$tagNumber"
    >
      {t("alerts.openHer", { tag: tagNumber })}
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
  const alerts = useQuery(orpc.alerts.mine.queryOptions({ input: {} }));
  const dismiss = useMutation(orpc.alerts.dismiss.mutationOptions({}));

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
