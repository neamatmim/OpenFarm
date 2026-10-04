import { formatNumber } from "@OpenFarm/i18n";
import { Button, buttonVariants } from "@OpenFarm/ui/components/button";
import {
  AlertDialog,
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
import { Input } from "@OpenFarm/ui/components/input";
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
import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { ChevronDown, EllipsisVertical } from "lucide-react";
import type { ComponentProps, FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import type { Tone } from "@/components/page";
import { Notice, StatTile } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import type { RefusalWay } from "@/lib/open-form";
import { holdOpenForm } from "@/lib/open-form";

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
  /** The figure the page is read by, set larger than the rest — at most one. */
  lead?: boolean;
  /** What pressing it does — show the list below as it counts it — and whether the list is showing that now. */
  onSelect?: () => void;
  selected?: boolean;
}

/** How loud a figure's value is: a term among many, an ordinary figure, a range set above the facts about it, and the
 *  figures beside the one that matters most. */
const FIGURE_SIZE = {
  sm: "text-sm font-medium",
  md: "font-medium",
  lg: "text-lg font-semibold",
  xl: "text-xl font-semibold",
} as const;

/**
 * One figure under its name, inside a `<dl>`: a small label, the value, and a line under it saying what it means. One
 * shape for every figure a page states, so a label reads the same everywhere and only how loud the value is changes.
 */
export const FigureTerm = ({
  label,
  children,
  hint,
  tone = "neutral",
  size = "md",
  className,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  tone?: "neutral" | "warning";
  size?: keyof typeof FIGURE_SIZE;
  /** Where it sits in the grid around it — a sentence of a term may want the whole row. */
  className?: string;
}) => (
  <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
    <dt className="text-muted-foreground text-xs" data-slot="figure-label">
      {label}
    </dt>
    <dd
      className={cn(
        FIGURE_SIZE[size],
        "break-words tabular-nums",
        tone === "warning" && "text-warning"
      )}
    >
      {children}
    </dd>
    {hint ? <dd className="text-muted-foreground text-xs">{hint}</dd> : null}
  </div>
);

/** A page's few figures: tiles where there is room, and one small card on a phone so its first screen still reaches the
 *  work below. */
export const SummaryFigures = ({
  figures,
  hintsOnPhone = false,
}: {
  figures: Figure[];
  /** Keep each figure's line under it on a phone too, for a reader who has no work below and needs the figure's
   *  meaning more than the room: the Investor, for whom "not paid yet" is the point of the figure. */
  hintsOnPhone?: boolean;
}) => (
  <>
    <dl className="surface grid grid-cols-2 gap-x-4 gap-y-3 p-4 md:hidden">
      {figures.map(({ onSelect, ...figure }) => (
        <div
          className={cn(
            "relative flex min-w-0 flex-col gap-0.5",
            figure.lead && "col-span-2",
            figure.selected && "ring-primary -m-1.5 rounded-md p-1.5 ring-2"
          )}
          key={figure.label}
        >
          {/* A figure that shows the list below as it counts it: the whole of it pressable, named by its label. */}
          {onSelect ? (
            <button
              aria-label={figure.label}
              aria-pressed={figure.selected ?? false}
              className="absolute inset-0 z-10 rounded-md"
              onClick={onSelect}
              type="button"
            />
          ) : null}
          <dt
            className={cn(
              "text-muted-foreground text-xs",
              // A label cut short says no more than a missing line under it, and a Bangla label of three words may
              // not fit half a 375px phone.
              !hintsOnPhone && "truncate"
            )}
            data-slot="figure-label"
          >
            {figure.label}
          </dt>
          <dd
            className={cn(
              "font-semibold tabular-nums",
              figure.lead ? "text-2xl" : "text-lg",
              TONE_TEXT[figure.tone ?? "neutral"]
            )}
          >
            {figure.value}
          </dd>
          {hintsOnPhone && figure.hint ? (
            <dd className="text-muted-foreground text-xs">{figure.hint}</dd>
          ) : null}
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
      {figures.map(({ onSelect, ...figure }) => (
        <StatTile
          hint={figure.hint}
          icon={figure.icon}
          key={figure.label}
          label={figure.label}
          lead={figure.lead}
          onSelect={onSelect}
          selected={figure.selected}
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
  /** Red where what the count counts has already gone wrong — work gone late; amber otherwise. */
  countTone?: "danger";
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
        <TabsList className="h-11 gap-4 md:h-9" variant="line">
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
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-xs font-semibold tabular-nums",
                      tab.countTone === "danger"
                        ? "bg-danger/15 text-danger"
                        : "bg-warning/15 text-warning"
                    )}
                  >
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

/**
 * A page's views as a menu down its side, the way an account or settings page is laid out: the menu on the left and
 * the chosen view beside it on a desk, the menu stacked above the view on a phone. The same tabs `PageTabs` takes, so
 * a page can move between the two; arrow keys move up and down the menu. The page keeps the chosen view in its
 * address, as with `PageTabs`.
 */
export const SideTabs = <T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: PageTab<T>[];
  value: T;
  onChange: (value: T) => void;
  /** What the menu is, for a screen reader. */
  label: string;
}) => (
  <Tabs
    className="flex-col gap-6 lg:flex-row lg:items-start"
    onValueChange={(next) => onChange(next as T)}
    orientation="vertical"
    value={value}
  >
    <TabsList
      aria-label={label}
      className="w-full shrink-0 items-stretch gap-0.5 bg-transparent p-0 lg:sticky lg:top-20 lg:w-56"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <TabsTrigger
            className="data-active:bg-muted dark:data-active:bg-muted h-10 flex-none justify-start gap-2.5 px-3 after:hidden data-active:font-semibold dark:data-active:border-transparent"
            key={tab.value}
            value={tab.value}
          >
            {Icon ? <Icon aria-hidden /> : null}
            {tab.label}
          </TabsTrigger>
        );
      })}
    </TabsList>
    {tabs.map((tab) => (
      <TabsContent className="min-w-0" key={tab.value} value={tab.value}>
        {tab.content}
      </TabsContent>
    ))}
  </Tabs>
);

/** The farm's dropdown: the phone's own picker, drawn as the input beside it is (the kit's NativeSelect, shadcn's).
 *  Label it — with a `Label`, or `aria-label` in a filter bar. */
export { NativeSelect } from "@OpenFarm/ui/components/native-select";

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
  /** Why a dim act is dim, said under it: a greyed-out line with no reason reads as broken. */
  hint?: string;
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
      {action.hint ? (
        <span className="flex flex-col">
          <span>{action.label}</span>
          <span className="text-muted-foreground text-xs">{action.hint}</span>
        </span>
      ) : (
        action.label
      )}
    </DropdownMenuItem>
  );
};

/**
 * The one act a row can do, as a button of its own: a menu that only ever opens onto one item is a click to find
 * a button that could have been on the row.
 */
const RowActionButton = ({ action }: { action: RowAction }) => {
  const Icon = action.icon;
  return (
    <Button
      className={cn(action.destructive && "text-danger hover:text-danger")}
      disabled={action.disabled}
      onClick={action.handleSelect}
      size="sm"
      title={action.hint}
      type="button"
      variant="outline"
    >
      {Icon ? <Icon aria-hidden data-icon="inline-start" /> : null}
      {action.label}
    </Button>
  );
};

/** The menu at the end of a row, for everything a row can do beyond its one main act. Nothing is drawn when there is
 *  nothing to do, and a button rather than a menu when there is only one thing — whoever is looking, since what a
 *  row offers often depends on who is looking at it. */
export const RowMenu = ({
  label,
  actions,
  named,
}: {
  /** What the menu is for, for a screen reader: usually the row's name. */
  label: string;
  actions: RowAction[];
  /** A menu of one kind of thing — a man's three papers — says what it holds on its face, rather than hiding
   *  behind the dots a row's miscellany does. */
  named?: { text: string; icon?: LucideIcon };
}) => {
  if (actions.length === 0) {
    return null;
  }
  const [only] = actions;
  if (actions.length === 1 && only) {
    return <RowActionButton action={only} />;
  }
  const safe = actions.filter((action) => !action.destructive);
  const destructive = actions.filter((action) => action.destructive);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          named ? (
            <Button aria-label={label} size="sm" variant="outline">
              {named.icon ? (
                <named.icon aria-hidden data-icon="inline-start" />
              ) : null}
              {named.text}
              <ChevronDown aria-hidden data-icon="inline-end" />
            </Button>
          ) : (
            <Button
              aria-label={label}
              // A phone's thumb gets the 44px every other control there has; a desk keeps the row's own height.
              className="size-11 md:size-8"
              size="icon-sm"
              variant="ghost"
            >
              <EllipsisVertical aria-hidden />
            </Button>
          )
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

/** What a form still needs, said when its act is pressed too soon: the words, and the field they are about. */
export interface StillMissing {
  said: string;
  /** The id of the field to go to. */
  at?: string;
}

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
  /**
   * What is still missing, in the form's own words and with the field to go to. The act is pressable either way:
   * pressed too soon, it says this at its foot — or, without it, the kit's own words and the first field its checks
   * find wrong.
   */
  missing?: StillMissing | null;
  pending: boolean;
  children: ReactNode;
}

/**
 * Asking before an act that takes something away — retiring a product, a Category — so a stray tap in a row's menu is
 * not the end of it. The question names what goes; the line under it says what that means; the act is in red. An
 * alert dialog, so it is announced as a question to answer and a tap beside it does not dismiss it.
 */
export const ConfirmDialog = ({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  pending = false,
  cancelLabel,
  takesAway = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: ReactNode;
  onConfirm: () => void;
  pending?: boolean;
  /** The words on the button that stays: "Cancel" unless the question wants its own ("Keep editing"). */
  cancelLabel?: ReactNode;
  /** Whether the act takes something away, and is in red; an act that only writes many things at once is not. */
  takesAway?: boolean;
}) => {
  const { t } = useLanguage();
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <DialogContent closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            {cancelLabel ?? t("common.cancel")}
          </Button>
          <Button
            disabled={pending}
            onClick={onConfirm}
            type="button"
            variant={takesAway ? "destructive" : "default"}
          >
            {pending ? <Spinner /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </AlertDialog>
  );
};

/** The first control a form's own checks say is wrong: a required box left empty, a figure out of its range. */
const firstWrong = (form: HTMLFormElement | null) =>
  form?.querySelector<HTMLElement>(":invalid, [aria-invalid='true']") ?? null;

/**
 * What every form in the kit does around its fields (docs/research/next-improvements.md §3):
 *
 * - **A refusal is said at its top**, where the person is, not in a toast beside it (GOV.UK: errors stay with what
 *   they are about); `useRefused` finds the open form through `lib/open-form.ts`.
 * - **Its act is never grey for want of something.** Pressed too soon it says what is missing — the form's own
 *   words where it gives them, the kit's otherwise — and goes to the field, or to the first one its checks find wrong.
 * - **Typed work is not closed on unasked.** Closed with changes in it, by Cancel, Escape, the cross or a tap
 *   beside it, it asks first — "close without saving?", since some forms keep what was typed for next time and some
 *   do not. A form the page closes itself, once saved, is not asked about.
 */
const useFormKeeping = ({
  open,
  onOpenChange,
  ready,
  missing,
  onSubmit,
  pending,
}: Pick<
  FormPanelProps,
  "open" | "onOpenChange" | "ready" | "missing" | "onSubmit" | "pending"
>) => {
  const { t } = useLanguage();
  const form = useRef<HTMLFormElement>(null);
  const top = useRef<HTMLDivElement>(null);
  // Pressed too soon at least once since it opened: from then on what is missing is said, and changes as it is given.
  const [asked, setAsked] = useState(false);
  const [refusal, setRefusal] = useState<{
    words: string;
    way?: RefusalWay;
  } | null>(null);
  const [changed, setChanged] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  // Closed, it forgets: opened again, it says nothing until pressed too soon again.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setAsked(false);
      setRefusal(null);
      setChanged(false);
      setDiscarding(false);
    }
  }
  useEffect(() => {
    if (!open) {
      return;
    }
    return holdOpenForm((words, way) => {
      setRefusal({ words, way });
      top.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
  }, [open]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setRefusal(null);
    if (ready) {
      onSubmit();
      return;
    }
    setAsked(true);
    const field =
      (missing?.at
        ? document.querySelector<HTMLElement>(`#${CSS.escape(missing.at)}`)
        : null) ?? firstWrong(form.current);
    field?.scrollIntoView({ behavior: "smooth", block: "center" });
    field?.focus({ preventScroll: true });
  };
  const requestClose = () => {
    if (changed && !pending) {
      setDiscarding(true);
      return;
    }
    onOpenChange(false);
  };
  const handleOpenChange = (next: boolean) => {
    if (next) {
      onOpenChange(true);
    } else {
      requestClose();
    }
  };
  const stillMissing =
    asked && !ready ? (missing?.said ?? t("form.notReady")) : null;
  const refused = refusal ? (
    <Notice
      action={
        refusal.way ? (
          <Link
            className={buttonVariants({ size: "sm", variant: "outline" })}
            to={refusal.way.to}
          >
            {refusal.way.label}
          </Link>
        ) : null
      }
      title={refusal.words}
      tone="danger"
    />
  ) : null;
  const askToDiscard = (
    <ConfirmDialog
      cancelLabel={t("form.keepEditing")}
      confirmLabel={t("form.discard")}
      description={t("form.discardWhy")}
      onConfirm={() => {
        setDiscarding(false);
        onOpenChange(false);
      }}
      onOpenChange={setDiscarding}
      open={discarding}
      title={t("form.discardTitle")}
    />
  );
  return {
    form,
    top,
    handleSubmit: submit,
    handleCancel: requestClose,
    handleOpenChange,
    handleChange: () => setChanged(true),
    stillMissing,
    refused,
    askToDiscard,
  };
};

/**
 * A form that is a piece of work of its own — feed in, a sale, milk handed over — in a sheet beside the page, so the
 * page it came from stays in sight. A title and a line of what it does above; the fields, labelled, in a body that
 * scrolls; cancel and the act itself pinned at the foot.
 *
 * `wide` is for a record with more to it than a handful of fields — a person, written down in sections — where two
 * columns on a computer read better than one long column. `full` is for a form written in rows of several fields at
 * once, such as a Venture Plan's lines, which a two-column sheet would wrap (Carbon: "complex, lengthier" forms get
 * the room of a page; Fluent's large drawer).
 */
export const FormSheet = ({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  onSubmit,
  ready,
  missing,
  pending,
  children,
  wide = false,
  full = false,
}: FormPanelProps & { wide?: boolean; full?: boolean }) => {
  const { t } = useLanguage();
  const {
    form,
    top,
    handleSubmit,
    handleCancel,
    handleOpenChange,
    handleChange,
    stillMissing,
    refused,
    askToDiscard,
  } = useFormKeeping({
    open,
    onOpenChange,
    ready,
    missing,
    onSubmit,
    pending,
  });
  return (
    <Sheet onOpenChange={handleOpenChange} open={open}>
      <SheetContent
        className={cn(
          "gap-0 data-[side=right]:w-full",
          full && "data-[side=right]:sm:max-w-5xl",
          wide && !full && "data-[side=right]:sm:max-w-3xl",
          !(wide || full) && "data-[side=right]:sm:max-w-lg"
        )}
        closeLabel={t("common.close")}
      >
        <SheetHeader className="border-b">
          <SheetTitle>{title}</SheetTitle>
          {description ? (
            <SheetDescription>{description}</SheetDescription>
          ) : null}
        </SheetHeader>
        {/* What is missing is said in the farm's words: the browser's own check of a required box would stop the
            press first, in the browser's language, and say nothing at the foot. */}
        <form
          className="flex min-h-0 flex-1 flex-col"
          noValidate
          onChangeCapture={handleChange}
          onSubmit={handleSubmit}
          ref={form}
        >
          <div
            className="flex flex-1 flex-col gap-5 overflow-y-auto p-4"
            ref={top}
          >
            {refused}
            {children}
          </div>
          <SheetFooter className="flex-row flex-wrap items-center justify-end border-t">
            {stillMissing ? (
              <p className="text-warning me-auto text-sm" role="alert">
                {stillMissing}
              </p>
            ) : null}
            <Button onClick={handleCancel} type="button" variant="outline">
              {t("common.cancel")}
            </Button>
            <Button disabled={pending} type="submit">
              {pending ? <Spinner /> : null}
              {submitLabel}
            </Button>
          </SheetFooter>
        </form>
        {askToDiscard}
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
  missing,
  pending,
  children,
  className,
}: FormPanelProps & { className?: string }) => {
  const { t } = useLanguage();
  const {
    form,
    top,
    handleSubmit,
    handleCancel,
    handleOpenChange,
    handleChange,
    stillMissing,
    refused,
    askToDiscard,
  } = useFormKeeping({
    open,
    onOpenChange,
    ready,
    missing,
    onSubmit,
    pending,
  });
  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className={className} closeLabel={t("common.close")}>
        <form
          className="flex flex-col gap-4"
          noValidate
          onChangeCapture={handleChange}
          onSubmit={handleSubmit}
          ref={form}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : null}
          </DialogHeader>
          <div className="flex flex-col gap-4" ref={top}>
            {refused}
            {children}
          </div>
          {stillMissing ? (
            <p className="text-warning text-sm" role="alert">
              {stillMissing}
            </p>
          ) : null}
          <DialogFooter>
            <Button onClick={handleCancel} type="button" variant="outline">
              {t("common.cancel")}
            </Button>
            <Button disabled={pending} type="submit">
              {pending ? <Spinner /> : null}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
        {askToDiscard}
      </DialogContent>
    </Dialog>
  );
};

/**
 * One part of a longer form under its own heading — who the person is, where the money goes — with a line of what
 * it is for. Its fields sit two to a row where there is room; a field that needs the whole row says so with
 * `sm:col-span-2`.
 */
export const FormSection = ({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) => (
  <div className="border-t pt-5 first:border-t-0 first:pt-0">
    <fieldset>
      <legend className="text-base font-semibold">{title}</legend>
      {description ? (
        <p className="text-muted-foreground mt-1 text-xs">{description}</p>
      ) : null}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  </div>
);

/**
 * A labelled field: its label, the control, and a line of help or of what is wrong beneath. The help and the error
 * are tied to the control with the field's `id` (`aria-describedby`, and `aria-invalid` with an error), so a screen
 * reader says them with it (WCAG 1.3.1, 3.3.1).
 */
export const FormField = ({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  /** What is wrong with what was given, said in red under it. */
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) => {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ");
  const wrong = Boolean(error);
  // Tied to the control by its id, wherever in the field it sits: inside a wrapper with its unit, or its own child.
  useEffect(() => {
    const control = document.querySelector(`#${CSS.escape(id)}`);
    if (!control) {
      return;
    }
    if (describedBy) {
      control.setAttribute("aria-describedby", describedBy);
    } else {
      control.removeAttribute("aria-describedby");
    }
    if (wrong) {
      control.setAttribute("aria-invalid", "true");
    } else {
      control.removeAttribute("aria-invalid");
    }
  }, [id, describedBy, wrong]);
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label
        className="text-sm font-medium"
        data-slot="form-label"
        htmlFor={id}
      >
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-danger text-xs font-medium" id={errorId}>
          {error}
        </p>
      ) : null}
      {hint ? (
        <p className="text-muted-foreground text-xs" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
};

/**
 * A figure typed with its unit written inside the box at its end — "কেজি", "৳/কেজি" — so the label says only what the
 * figure is. The app's own Input, so it stands as tall as every other box beside it.
 */
export const UnitInput = ({
  unit,
  className,
  ...props
}: ComponentProps<typeof Input> & { unit: string }) => (
  <div className="relative">
    <Input
      autoComplete="off"
      className={cn("pe-16 tabular-nums", className)}
      {...props}
    />
    <span className="text-muted-foreground pointer-events-none absolute inset-y-0 end-3 flex items-center text-sm">
      {unit}
    </span>
  </div>
);
