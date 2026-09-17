import { formatNumber } from "@OpenFarm/i18n";
import { cn } from "@OpenFarm/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import { ChevronDown, ChevronRight, ChevronUp } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import type { Tone } from "@/components/page";
import { RecordList, StatusBadge } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";

/** How many rows a queue shows before the rest wait behind "show all": a screen of one queue hides the queues below. */
const FIRST_SHOWN = 5;

const ICON_TONE: Record<Tone, string> = {
  neutral: "bg-secondary text-secondary-foreground",
  success: "bg-success-surface text-success",
  warning: "bg-warning-surface text-warning",
  danger: "bg-danger-surface text-danger",
  info: "bg-info-surface text-info",
};

/**
 * One thing waiting, as a row: what identifies it, what it is — over two lines where it needs them, since a proposal or
 * a notice cut off mid-word cannot be judged — its details, and the act or the way in at its end.
 */
export const QueueRow = ({
  leading,
  title,
  meta,
  trailing,
}: {
  leading?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
}) => (
  <div className="hover:bg-muted/50 has-[a:focus-visible]:ring-ring relative -mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition-colors duration-150 has-[a:focus-visible]:ring-2">
    {leading ? <div className="shrink-0">{leading}</div> : null}
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <div className="line-clamp-2 font-medium break-words">{title}</div>
      {meta ? (
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
          {meta}
        </div>
      ) : null}
    </div>
    {trailing ? <div className="shrink-0">{trailing}</div> : null}
  </div>
);

/** A row that opens something. */
export const Opens = () => (
  <ChevronRight aria-hidden className="text-muted-foreground size-4" />
);

/**
 * One kind of thing waiting, or nothing at all: an empty heading is a line of furniture. Its name and how many, the way
 * to the page that holds the whole list, and its first few rows — the rest a tap away, so one long queue does not
 * push the others off the screen. Each row brings its own link, so the route and its parameters are typed where they
 * are written.
 */
export const QueueGroup = ({
  label,
  tone,
  icon: Icon,
  rows,
  more,
}: {
  label: string;
  tone: Tone;
  icon: LucideIcon;
  /** One element to a row, each with its own key. */
  rows: ReactNode[];
  /** The link to the page that holds the whole list, where there is one. */
  more?: ReactNode;
}) => {
  const { t, language } = useLanguage();
  const [all, setAll] = useState(false);
  if (rows.length === 0) {
    return null;
  }
  const shown = all ? rows : rows.slice(0, FIRST_SHOWN);
  const long = rows.length > FIRST_SHOWN;
  const Chevron = all ? ChevronUp : ChevronDown;
  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pb-1">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-md",
              ICON_TONE[tone]
            )}
          >
            <Icon aria-hidden className="size-4" />
          </span>
          <h3 className="text-sm font-semibold">{label}</h3>
          <StatusBadge tone={tone}>
            {formatNumber(rows.length, language)}
          </StatusBadge>
        </div>
        {more ? <div className="hidden text-sm sm:block">{more}</div> : null}
      </div>
      <RecordList>{shown}</RecordList>
      {long || more ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 border-t text-sm empty:hidden sm:border-t-0">
          {long ? (
            <button
              aria-expanded={all}
              className="text-primary hover:bg-muted/60 focus-visible:ring-ring -mx-2 flex min-h-11 items-center gap-1 rounded-lg px-2 font-medium outline-none focus-visible:ring-2 sm:flex-1 sm:justify-center sm:border-t md:min-h-9"
              onClick={() => setAll((shownAll) => !shownAll)}
              type="button"
            >
              {all
                ? t("alerts.showFewer")
                : t("alerts.showAll", {
                    count: formatNumber(rows.length, language),
                  })}
              <Chevron aria-hidden className="size-4" />
            </button>
          ) : null}
          {/* On a phone the way to the whole list waits at the foot, where the thumb is, rather than crowding the name. */}
          {more ? <div className="ml-auto sm:hidden">{more}</div> : null}
        </div>
      ) : null}
    </div>
  );
};

/** The link at the head of a queue to the page that holds all of it. */
export const MORE_LINK =
  "text-primary inline-flex min-h-9 items-center gap-1 font-medium underline-offset-4 hover:underline";
