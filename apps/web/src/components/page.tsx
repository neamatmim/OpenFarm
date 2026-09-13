import { Badge } from "@OpenFarm/ui/components/badge";
import { Button } from "@OpenFarm/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@OpenFarm/ui/components/empty";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { cn } from "@OpenFarm/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import {
  CircleAlert,
  CircleCheck,
  CircleDot,
  Info,
  OctagonX,
  RotateCw,
  TriangleAlert,
} from "lucide-react";
import type { ReactNode } from "react";
import { useId } from "react";

import { useT } from "@/i18n/language-provider";

/** How loud a thing is: the farm's semantic colours, always with a word and an icon beside them. */
export type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const TONE_ICON: Record<Tone, LucideIcon> = {
  neutral: CircleDot,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: OctagonX,
  info: Info,
};

const WIDTH = {
  narrow: "max-w-2xl",
  default: "max-w-6xl",
  wide: "max-w-screen-2xl",
} as const;

/** A page's frame: its width — narrow for a form, default for most, wide for registers — and its rhythm. */
export const Page = ({
  children,
  width = "default",
  className,
}: {
  children: ReactNode;
  width?: keyof typeof WIDTH;
  className?: string;
}) => (
  <div
    className={cn(
      "mx-auto flex w-full flex-col gap-6 px-4 py-6 md:gap-8 md:px-8 md:py-8",
      WIDTH[width],
      className
    )}
  >
    {children}
  </div>
);

/** What the page is, in one line, what it is for, and what can be done from it. */
export const PageHeader = ({
  title,
  description,
  eyebrow,
  actions,
  meta,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
}) => (
  <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div className="flex min-w-0 flex-col gap-1.5">
      {eyebrow ? (
        <p className="text-primary text-xs font-semibold tracking-wider uppercase">
          {eyebrow}
        </p>
      ) : null}
      <h1 className="text-2xl leading-tight font-semibold tracking-tight md:text-3xl">
        {title}
      </h1>
      {description ? (
        <p className="text-muted-foreground max-w-2xl text-sm md:text-base">
          {description}
        </p>
      ) : null}
      {meta ? (
        <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-sm">
          {meta}
        </div>
      ) : null}
    </div>
    {actions ? (
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {actions}
      </div>
    ) : null}
  </header>
);

/**
 * A part of a page with a name. On a card by default; `plain` for a part that is already a list or a grid of its
 * own cards, where a card around cards is noise.
 */
export const Section = ({
  title,
  description,
  action,
  children,
  plain = false,
  className,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  plain?: boolean;
  className?: string;
  id?: string;
}) => (
  <section
    aria-labelledby={title && id ? `${id}-title` : undefined}
    className={cn(
      "flex flex-col gap-4",
      !plain &&
        "bg-card rounded-xl border p-4 shadow-[0_1px_2px_0_oklch(0.2_0.02_160/0.05)] md:p-5",
      className
    )}
    id={id}
  >
    {title || action ? (
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          {title ? (
            <h2
              className="text-base font-semibold tracking-tight md:text-lg"
              id={id ? `${id}-title` : undefined}
            >
              {title}
            </h2>
          ) : null}
          {description ? (
            <p className="text-muted-foreground text-sm">{description}</p>
          ) : null}
        </div>
        {action ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {action}
          </div>
        ) : null}
      </div>
    ) : null}
    {children}
  </section>
);

const TILE_TONE: Record<Tone, string> = {
  neutral: "",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
};

/** One figure the farm watches: what it is, the figure large and aligned, and what it means. */
export const StatTile = ({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
}) => (
  <div className="surface flex h-full flex-col gap-3 p-4 md:p-5">
    <div className="text-muted-foreground flex items-center justify-between gap-2 text-sm font-medium">
      <span className="truncate">{label}</span>
      {Icon ? (
        <span className="bg-secondary text-secondary-foreground grid size-8 shrink-0 place-items-center rounded-lg">
          <Icon aria-hidden className="size-4" />
        </span>
      ) : null}
    </div>
    <div
      className={cn(
        "text-2xl leading-none font-semibold tracking-tight tabular-nums sm:text-3xl md:text-4xl",
        TILE_TONE[tone]
      )}
    >
      {value}
    </div>
    {hint ? <div className="text-muted-foreground text-sm">{hint}</div> : null}
  </div>
);

const BADGE_VARIANT = {
  neutral: "secondary",
  success: "success",
  warning: "warning",
  danger: "danger",
  info: "info",
} as const;

/** A status as the farm says it: its word, its icon and its colour, never the colour alone. */
export const StatusBadge = ({
  tone,
  children,
  icon,
}: {
  tone: Tone;
  children: ReactNode;
  icon?: LucideIcon;
}) => {
  const Icon = icon ?? TONE_ICON[tone];
  return (
    <Badge variant={BADGE_VARIANT[tone]}>
      <Icon aria-hidden data-icon="inline-start" />
      {children}
    </Badge>
  );
};

/** Nothing here yet — said plainly, with what can be done about it. `bare` inside a Section, whose card already frames
 *  it: a box drawn inside a box only pushes the work below the fold. */
export const EmptyState = ({
  icon: Icon = CircleCheck,
  title,
  description,
  action,
  bare = false,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  bare?: boolean;
  className?: string;
}) => (
  <Empty
    className={cn(
      bare
        ? "p-0 py-4 md:p-0 md:py-5"
        : "rounded-xl border border-dashed py-10",
      className
    )}
  >
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <Icon aria-hidden />
      </EmptyMedia>
      <EmptyTitle>{title}</EmptyTitle>
      {description ? <EmptyDescription>{description}</EmptyDescription> : null}
    </EmptyHeader>
    {action ? <EmptyContent>{action}</EmptyContent> : null}
  </Empty>
);

/** An animal's Tag Number as the farm writes it on her ear: set apart, never translated, never broken. */
export const TagChip = ({ children }: { children: ReactNode }) => (
  <span className="bg-secondary text-secondary-foreground inline-flex w-fit items-center rounded-md px-2 py-0.5 font-mono text-[0.85em] font-semibold tracking-tight whitespace-nowrap tabular-nums">
    {children}
  </span>
);

/** One record in a list: what identifies it, what it is, its details, and what stands at its end. */
export const RecordRow = ({
  leading,
  title,
  meta,
  trailing,
  className,
}: {
  leading?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) => (
  <div
    className={cn(
      "hover:bg-muted/50 has-[a:focus-visible]:ring-ring relative -mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition-colors duration-150 has-[a:focus-visible]:ring-2",
      className
    )}
  >
    {leading ? <div className="shrink-0">{leading}</div> : null}
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <div className="truncate font-medium">{title}</div>
      {meta ? (
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
          {meta}
        </div>
      ) : null}
    </div>
    {trailing ? <div className="shrink-0">{trailing}</div> : null}
  </div>
);

/** A list of records with a quiet line between them. */
export const RecordList = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div className={cn("divide-border flex flex-col divide-y", className)}>
    {children}
  </div>
);

const NOTICE_TONE: Record<Exclude<Tone, "neutral">, string> = {
  success: "border-success/25 bg-success-surface text-success",
  warning: "border-warning/30 bg-warning-surface text-warning",
  danger: "border-danger/25 bg-danger-surface text-danger",
  info: "border-info/25 bg-info-surface text-info",
};

/**
 * Something the person must know before acting: a hard Gate ("Blocked: milk withdrawal"), a refusal, a warning. The
 * title says what, the body says why and what now.
 */
export const Notice = ({
  tone,
  title,
  children,
  action,
  icon,
}: {
  tone: Exclude<Tone, "neutral">;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
}) => {
  const Icon = icon ?? (tone === "danger" ? CircleAlert : TONE_ICON[tone]);
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border px-4 py-3",
        NOTICE_TONE[tone]
      )}
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
    >
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="font-semibold">{title}</p>
        {children ? (
          <div className="text-foreground/80 text-sm">{children}</div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
};

/**
 * What a list shows before the farm has answered: a placeholder while it is being asked, a failure with a way to ask
 * again, and only then the list — so "nothing waiting" is said only when the farm has said it.
 */
export const Loaded = ({
  query,
  children,
  skeleton,
}: {
  query: { data: unknown; isError: boolean; refetch: () => unknown };
  children: ReactNode;
  skeleton?: ReactNode;
}) => {
  const t = useT();
  if (query.data !== undefined) {
    return children;
  }
  if (query.isError) {
    return (
      <Notice
        action={
          <Button onClick={() => query.refetch()} size="sm" variant="outline">
            <RotateCw aria-hidden />
            {t("outbox.retry")}
          </Button>
        }
        title={t("common.loadFailed")}
        tone="danger"
      />
    );
  }
  return skeleton ?? <Skeleton className="h-20 rounded-lg" />;
};

/**
 * The one action a Step is waiting for, held above the phone's keyboard and its home bar, so it is never scrolled
 * away from a person with a cow in front of them.
 */
export const StickyAction = ({ children }: { children: ReactNode }) => (
  <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky bottom-0 z-20 -mx-4 mt-2 border-t px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
    {children}
  </div>
);

/** How much of something is done, as a bar: a real progress element, so assistive technology reads its value. */
export const ProgressBar = ({
  value,
  label,
  className,
}: {
  value: number;
  label?: string;
  className?: string;
}) => (
  <progress
    aria-label={label}
    className={cn(
      "[&::-webkit-progress-bar]:bg-muted bg-muted h-2 w-full appearance-none overflow-hidden rounded-full [&::-moz-progress-bar]:rounded-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:transition-[width] [&::-webkit-progress-value]:duration-300",
      value >= 100
        ? "[&::-moz-progress-bar]:bg-success [&::-webkit-progress-value]:bg-success"
        : "[&::-moz-progress-bar]:bg-primary [&::-webkit-progress-value]:bg-primary",
      className
    )}
    max={100}
    value={Math.min(100, Math.max(0, value))}
  />
);

/** A handful of mutually exclusive choices side by side — real radio buttons, drawn as a segmented control. */
export const SegmentedControl = <T extends string>({
  name,
  label,
  options,
  value,
  onChange,
}: {
  name: string;
  label: string;
  options: readonly { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
}) => (
  <fieldset className="bg-muted flex shrink-0 gap-1 rounded-lg p-1">
    <legend className="sr-only">{label}</legend>
    {options.map((option) => (
      <label
        className={cn(
          "has-[:focus-visible]:ring-ring flex h-8 cursor-pointer items-center rounded-md px-3 text-sm font-medium transition-colors duration-150 has-[:focus-visible]:ring-2",
          value === option.value
            ? "bg-card text-foreground shadow-xs"
            : "text-muted-foreground hover:text-foreground"
        )}
        key={option.value || "all"}
      >
        <input
          checked={value === option.value}
          className="sr-only"
          name={name}
          onChange={() => onChange(option.value)}
          type="radio"
          value={option.value}
        />
        {option.label}
      </label>
    ))}
  </fieldset>
);

/** The period a page reads, with its two days labelled where they are typed. */
export const PeriodFilter = ({
  label,
  fromLabel,
  toLabel,
  from,
  to,
  onFrom,
  onTo,
  children,
}: {
  label: ReactNode;
  fromLabel: string;
  toLabel: string;
  from: string;
  to: string;
  onFrom: (day: string) => void;
  onTo: (day: string) => void;
  children?: ReactNode;
}) => {
  const id = useId();
  return (
    <fieldset className="surface flex flex-wrap items-end gap-3 p-4">
      <legend className="sr-only">{label}</legend>
      <label
        className="flex flex-col gap-1.5 text-sm font-medium"
        htmlFor={`${id}-from`}
      >
        {fromLabel}
        <input
          className="bg-card border-input focus-visible:border-ring focus-visible:ring-ring/50 h-11 w-44 rounded-md border px-3 text-base font-normal outline-none focus-visible:ring-[3px] md:h-9 md:text-sm"
          id={`${id}-from`}
          onChange={(event) => onFrom(event.target.value)}
          type="date"
          value={from}
        />
      </label>
      <label
        className="flex flex-col gap-1.5 text-sm font-medium"
        htmlFor={`${id}-to`}
      >
        {toLabel}
        <input
          className="bg-card border-input focus-visible:border-ring focus-visible:ring-ring/50 h-11 w-44 rounded-md border px-3 text-base font-normal outline-none focus-visible:ring-[3px] md:h-9 md:text-sm"
          id={`${id}-to`}
          onChange={(event) => onTo(event.target.value)}
          type="date"
          value={to}
        />
      </label>
      {children ? (
        <div className="ml-auto flex flex-wrap gap-2">{children}</div>
      ) : null}
    </fieldset>
  );
};
