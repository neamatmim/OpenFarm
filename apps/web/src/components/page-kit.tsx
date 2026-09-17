import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@OpenFarm/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@OpenFarm/ui/components/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@OpenFarm/ui/components/sheet";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@OpenFarm/ui/components/tabs";
import { cn } from "@OpenFarm/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import { EllipsisVertical } from "lucide-react";
import type { ComponentProps, FormEvent, ReactNode } from "react";
import { useEffect, useRef } from "react";

import type { Tone } from "@/components/page";
import { StatTile } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";

/**
 * The pieces every working page is built from, so a Manager who has learnt one page has learnt them all: the figures a
 * page is judged by, tabs by what somebody came to do, a bar of filters over a list, a menu at the end of a row, and the
 * sheet or dialog a form is written in.
 */

const TONE_TEXT: Record<Tone, string> = {
  neutral: "",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
};

export interface Figure {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
}

/** A page's few figures: tiles where there is room, and one small card on a phone so its first screen still reaches the
 *  work below. */
export const SummaryFigures = ({ figures }: { figures: Figure[] }) => (
  <>
    <dl className="bg-card grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border p-4 md:hidden">
      {figures.map((figure) => (
        <div className="flex min-w-0 flex-col gap-0.5" key={figure.label}>
          <dt className="text-muted-foreground truncate text-xs">
            {figure.label}
          </dt>
          <dd
            className={cn(
              "text-lg font-semibold tabular-nums",
              TONE_TEXT[figure.tone ?? "neutral"]
            )}
          >
            {figure.value}
          </dd>
        </div>
      ))}
    </dl>
    <div
      className={cn(
        "hidden grid-cols-2 gap-4 md:grid",
        figures.length >= 4 && "xl:grid-cols-4",
        figures.length === 3 && "xl:grid-cols-3"
      )}
    >
      {figures.map((figure) => (
        <StatTile
          hint={figure.hint}
          icon={figure.icon}
          key={figure.label}
          label={figure.label}
          tone={figure.tone}
          value={figure.value}
        />
      ))}
    </div>
  </>
);

export interface PageTab<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
  /** A number that wants attention on the tab itself — work waiting, stock running low. Nothing is shown for none. */
  count?: number;
  content: ReactNode;
}

/**
 * A page's tabs, by what somebody came to do. The page keeps the chosen tab in its address (`validateSearch`), so it
 * comes back as it was left; this only draws them. On a phone the row of tabs scrolls sideways under the page.
 */
export const PageTabs = <T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: PageTab<T>[];
  value: T;
  onChange: (value: T) => void;
}) => {
  const { language } = useLanguage();
  const strip = useRef<HTMLDivElement>(null);
  // A page opened on a tab far along the row — from its address — brings that tab into sight on a phone, sideways
  // only, so the page itself does not jump.
  useEffect(() => {
    const row = strip.current;
    const active = row?.querySelector<HTMLElement>(
      `[data-tab="${CSS.escape(value)}"]`
    );
    if (!(row && active)) {
      return;
    }
    const left = active.offsetLeft - row.offsetLeft;
    const right = left + active.offsetWidth;
    if (left < row.scrollLeft || right > row.scrollLeft + row.clientWidth) {
      row.scrollLeft = Math.max(0, left - 16);
    }
  }, [value]);
  return (
    <Tabs
      className="gap-4"
      onValueChange={(next) => onChange(next as T)}
      value={value}
    >
      <div
        className="-mx-4 overflow-x-auto border-b px-4 md:mx-0 md:px-0"
        ref={strip}
      >
        <TabsList className="h-11 gap-4" variant="line">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger
                className="flex-none px-1"
                data-tab={tab.value}
                key={tab.value}
                value={tab.value}
              >
                {Icon ? <Icon aria-hidden /> : null}
                {tab.label}
                {tab.count ? (
                  <span className="bg-warning/15 text-warning rounded-full px-1.5 text-xs font-semibold tabular-nums">
                    {formatNumber(tab.count, language)}
                  </span>
                ) : null}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
};

const SELECT_CLASS =
  "bg-card border-input focus-visible:border-ring focus-visible:ring-ring/50 h-11 w-full rounded-md border px-3 text-base outline-none focus-visible:ring-3 disabled:opacity-50 md:h-9 md:text-sm";

/** The farm's dropdown: the phone's own picker, drawn to match the inputs beside it. Label it — with a `Label`, or
 *  `aria-label` in a filter bar. */
export const NativeSelect = ({
  className,
  ...props
}: ComponentProps<"select">) => (
  <select className={cn(SELECT_CLASS, className)} {...props} />
);

/** The filters over a list, in a row above it where there is room and stacked on a phone. */
export const FilterBar = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div
    className={cn(
      "flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center",
      className
    )}
  >
    {children}
  </div>
);

export interface RowAction {
  label: string;
  icon?: LucideIcon;
  handleSelect: () => void;
  /** Drawn in the danger colour, after a line: an act that takes something away. */
  destructive?: boolean;
  disabled?: boolean;
}

/** One act in a row's menu, with its icon; an act that takes something away in the danger colour. */
const RowActionItem = ({ action }: { action: RowAction }) => {
  const Icon = action.icon;
  const { handleSelect } = action;
  return (
    <DropdownMenuItem
      className={cn(action.destructive && "text-danger")}
      disabled={action.disabled}
      onClick={handleSelect}
    >
      {Icon ? <Icon aria-hidden /> : null}
      {action.label}
    </DropdownMenuItem>
  );
};

/** The menu at the end of a row, for everything a row can do beyond its one main act. Nothing is drawn when there is
 *  nothing to do. */
export const RowMenu = ({
  label,
  actions,
}: {
  /** What the menu is for, for a screen reader: usually the row's name. */
  label: string;
  actions: RowAction[];
}) => {
  if (actions.length === 0) {
    return null;
  }
  const safe = actions.filter((action) => !action.destructive);
  const destructive = actions.filter((action) => action.destructive);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button aria-label={label} size="icon-sm" variant="ghost">
            <EllipsisVertical aria-hidden />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        {safe.map((action) => (
          <RowActionItem action={action} key={action.label} />
        ))}
        {safe.length > 0 && destructive.length > 0 ? (
          <DropdownMenuSeparator />
        ) : null}
        {destructive.map((action) => (
          <RowActionItem action={action} key={action.label} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

interface FormPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** The words on the button that saves: what the form does, never just "OK". */
  submitLabel: ReactNode;
  onSubmit: () => void;
  /** Whether everything the form needs has been given. */
  ready: boolean;
  pending: boolean;
  children: ReactNode;
}

const submitted =
  (ready: boolean, onSubmit: () => void) => (event: FormEvent) => {
    event.preventDefault();
    if (ready) {
      onSubmit();
    }
  };

/**
 * A form that is a piece of work of its own — feed in, a sale, milk handed over — in a sheet beside the page, so the
 * page it came from stays in sight. A title and a line of what it does above; the fields, labelled, in a body that
 * scrolls; cancel and the act itself pinned at the foot.
 */
export const FormSheet = ({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  onSubmit,
  ready,
  pending,
  children,
}: FormPanelProps) => {
  const { t } = useLanguage();
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>{title}</SheetTitle>
          {description ? (
            <SheetDescription>{description}</SheetDescription>
          ) : null}
        </SheetHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={submitted(ready, onSubmit)}
        >
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
            {children}
          </div>
          <SheetFooter className="flex-row justify-end border-t">
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              {t("common.cancel")}
            </Button>
            <Button disabled={!ready || pending} type="submit">
              {pending ? <Spinner /> : null}
              {submitLabel}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
};

/** A short form — a level, a name, a reason — in a dialog over the page, with cancel and the act itself at its foot. */
export const FormDialog = ({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  onSubmit,
  ready,
  pending,
  children,
  className,
}: FormPanelProps & { className?: string }) => {
  const { t } = useLanguage();
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className={className} closeLabel={t("common.close")}>
        <form
          className="flex flex-col gap-4"
          onSubmit={submitted(ready, onSubmit)}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : null}
          </DialogHeader>
          {children}
          <DialogFooter>
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              {t("common.cancel")}
            </Button>
            <Button disabled={!ready || pending} type="submit">
              {pending ? <Spinner /> : null}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

/** A labelled field: its label, the control, and a line of help or of what is wrong beneath. */
export const FormField = ({
  id,
  label,
  hint,
  children,
  className,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  <div className={cn("flex flex-col gap-1.5", className)}>
    <label className="text-sm font-medium" htmlFor={id}>
      {label}
    </label>
    {children}
    {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
  </div>
);
