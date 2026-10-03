// The sheet a Step is answered in: its evidence, the feed given, the store or medicine counted, a renewal, a skip.
import type { FactsAsShown } from "@OpenFarm/api/effects/effect";
import type {
  Bilingual,
  Evidence,
  MilkDestination,
  Step,
} from "@OpenFarm/domain";
import {
  feedUnitWord,
  MILK_DESTINATIONS,
  missingEvidence,
  outsideItsRange,
} from "@OpenFarm/domain";
import {
  formatDate,
  formatDayField,
  formatNumber,
  numberAsTyped,
} from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { cn } from "@OpenFarm/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import {
  Baby,
  Camera,
  Check,
  ChevronLeft,
  Lock,
  Milk,
  SkipForward,
  SprayCan,
  Trash2,
} from "lucide-react";
import type { ReactNode } from "react";
import { useId, useState } from "react";

import { AnimalPhoto } from "@/components/animal-photo";
import { Notice, StatusBadge, StickyAction, TagChip } from "@/components/page";
import { PhotoField } from "@/components/photo-field";
import type {
  Animal,
  Completion,
  Typed,
  Entered,
  Taken,
} from "@/components/work/work-types";
import { useLanguage } from "@/i18n/language-provider";
import type { Photo } from "@/lib/photo";
import { shrink } from "@/lib/photo";
import type { MedicineCountEntry, StockCountEntry } from "@/lib/record-offline";
import { useRefused } from "@/lib/refused";
import { skipReasonsOffered } from "@/lib/skipping";
import type { StepAnswer } from "@/lib/step-answer";

/**
 * What a Step that counts the store is being told: the box for each Feed Item and why it differs,
 * starting from what was counted before for a Correction and blank for a new count; whether every item
 * has been counted; and the lines to send. Nothing at all for any other Step.
 */
const useStockCount = (
  step: Step,
  board: StockCountBoard | null | undefined
) => {
  const counts = step.effect?.kind === "stock_count";
  const before = board?.counted ?? [];
  const [counted, setCounted] = useState<Typed>(() =>
    Object.fromEntries(
      before.map((line) => [line.feedItemId, String(line.counted)])
    )
  );
  const [reasons, setReasons] = useState<Typed>(() =>
    Object.fromEntries(
      before.map((line) => [line.feedItemId, line.reason ?? ""])
    )
  );
  const items = counts ? (board?.items ?? []) : [];
  return {
    items,
    counted,
    handleCounted: setCounted,
    reasons,
    handleReason: setReasons,
    complete: items.every(
      (item) => (counted[item.feedItemId] ?? "").trim() !== ""
    ),
    lines: (): StockCountEntry[] | undefined =>
      counts
        ? items.map((item) => ({
            feedItemId: item.feedItemId,
            counted: Number(counted[item.feedItemId]),
            reason: reasons[item.feedItemId]?.trim() || undefined,
          }))
        : undefined,
  };
};

/**
 * What a Step that counts the medicine is being told, as the store's count is: a box for each product, in doses, and
 * why it differs — blank for a new count, what was counted before for a Correction — and the lines to send.
 */
const useMedicineCount = (
  step: Step,
  board: MedicineCountBoard | null | undefined
) => {
  const counts = step.effect?.kind === "medicine_count";
  const before = board?.counted ?? [];
  const [counted, setCounted] = useState<Typed>(() =>
    Object.fromEntries(
      before.map((line) => [line.drugProductId, String(line.counted)])
    )
  );
  const [reasons, setReasons] = useState<Typed>(() =>
    Object.fromEntries(
      before.map((line) => [line.drugProductId, line.reason ?? ""])
    )
  );
  const items = counts ? (board?.items ?? []) : [];
  return {
    items,
    counted,
    handleCounted: setCounted,
    reasons,
    handleReason: setReasons,
    lines: (): MedicineCountEntry[] | undefined =>
      counts
        ? items.map((item) => ({
            drugProductId: item.drugProductId,
            counted: Number(counted[item.drugProductId]),
            reason: reasons[item.drugProductId]?.trim() || undefined,
          }))
        : undefined,
  };
};

/** What a Step that counts the medicine is handed: the products on the Drug List, and what it counted before. */
interface MedicineCountBoard {
  items: { drugProductId: string; nameBn: string }[];
  counted: { drugProductId: string; counted: number; reason: string | null }[];
}

/** What a Step that counts the store is handed: the Feed Items, and what it counted before. */
interface StockCountBoard {
  items: { feedItemId: string; nameBn: string; unit: string }[];
  counted: { feedItemId: string; counted: number; reason: string | null }[];
}

/** The farm day a year after the Registration runs out now: where a renewed certificate usually lands. */
const aYearOn = (expiresOn: Date | null): string => {
  if (!expiresOn) {
    return "";
  }
  const day = formatDayField(expiresOn);
  const [year, ...rest] = day.split("-");
  return [String(Number(year) + 1), ...rest].join("-");
};

/**
 * What the renewal's closing Step is filling in: the day the renewed certificate runs out — starting a year
 * on from the day it runs out now, which is how a certificate is usually renewed, or for a Correction the day it
 * was renewed to — and its photograph. Ready
 * once both are given; a Correction may keep the photograph it already sent.
 */
const useRenewal = (
  step: Step,
  board: { expiresOn: Date | null } | null | undefined,
  correcting: boolean,
  recorded: FactsAsShown["renewal"]
) => {
  const renews = step.effect?.kind === "registration_renewal";
  const runsOutOn = board?.expiresOn ?? null;
  const [expiresOn, setExpiresOn] = useState(
    () => recorded?.expiresOn ?? aYearOn(runsOutOn)
  );
  const [issuedOn, setIssuedOn] = useState("");
  const [certificate, setCertificate] = useState<Photo | null>(null);
  const given = expiresOn !== "" && (certificate !== null || correcting);
  return {
    renews,
    runsOutOn,
    expiresOn,
    setExpiresOn,
    issuedOn,
    setIssuedOn,
    certificate,
    setCertificate,
    /** Ready when everything else the Step asks is, and — for a renewal — its own fields are too. */
    readyWith: (restIsReady: boolean) => restIsReady && (!renews || given),
    entry: () =>
      renews
        ? {
            expiresOn,
            issuedOn: issuedOn || undefined,
            certificate: certificate ?? undefined,
          }
        : undefined,
  };
};

/** The renewal's closing Step's own fields, for that Step and no other. */
const RenewalFields = ({
  renewing,
}: {
  renewing: ReturnType<typeof useRenewal>;
}) => {
  const { t, language } = useLanguage();
  if (!renewing.renews) {
    return null;
  }
  const {
    runsOutOn,
    expiresOn,
    issuedOn,
    certificate,
    setExpiresOn: onExpiresOn,
    setIssuedOn: onIssuedOn,
    setCertificate: onCertificate,
  } = renewing;
  const certificateTaken = certificate !== null;
  return (
    <div className="space-y-3">
      {runsOutOn ? (
        <p className="text-muted-foreground text-sm">
          {t("renewal.runsOut", {
            date: formatDate(new Date(runsOutOn), language, "date"),
          })}
        </p>
      ) : null}
      <div className="space-y-1">
        <Label htmlFor="renewal-expires">{t("renewal.newExpiry")}</Label>
        <Input
          id="renewal-expires"
          onChange={(event) => onExpiresOn(event.target.value)}
          type="date"
          value={expiresOn}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="renewal-issued">{t("renewal.issuedOn")}</Label>
        <Input
          id="renewal-issued"
          onChange={(event) => onIssuedOn(event.target.value)}
          type="date"
          value={issuedOn}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="renewal-certificate">{t("renewal.certificate")}</Label>
        <PhotoField
          chosen={certificateTaken}
          id="renewal-certificate"
          onPhoto={(photo) => {
            if (photo) {
              onCertificate(photo);
            }
          }}
          takeLabel="renewal.certificateTake"
        />
      </div>
    </div>
  );
};

/**
 * One box per thing counted for what is really there, and one for why, if it is not what the farm expects. The expected
 * figure is never shown: a count that can see the answer copies it. The farm refuses a difference without a reason,
 * and says which.
 */
const CountFields = ({
  items,
  counted,
  reasons,
  onCounted,
  onReason,
}: {
  items: { id: string; name: string; unit: string }[];
  counted: Typed;
  reasons: Typed;
  onCounted: (next: (current: Typed) => Typed) => void;
  onReason: (next: (current: Typed) => Typed) => void;
}) => {
  const { t } = useLanguage();
  return (
    <>
      {items.map((item) => (
        <div className="surface flex flex-col gap-2 p-3" key={item.id}>
          <p className="text-sm font-medium">
            {item.name}{" "}
            <span className="text-muted-foreground font-normal">
              ({item.unit})
            </span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Input
              aria-label={`${item.name} ${t("work.counted")}`}
              className="h-14 text-lg md:h-12 md:text-lg"
              inputMode="decimal"
              onChange={(event) =>
                onCounted((current) => ({
                  ...current,
                  [item.id]: event.target.value,
                }))
              }
              placeholder={t("work.counted")}
              type="number"
              value={counted[item.id] ?? ""}
            />
            <Input
              aria-label={`${item.name} ${t("work.countReason")}`}
              className="h-14 md:h-12"
              onChange={(event) =>
                onReason((current) => ({
                  ...current,
                  [item.id]: event.target.value,
                }))
              }
              placeholder={t("work.countReason")}
              value={reasons[item.id] ?? ""}
            />
          </div>
        </div>
      ))}
    </>
  );
};

/** The store's count: each Feed Item in its own unit. */
const StockCountFields = ({
  items,
  ...boxes
}: Omit<Parameters<typeof CountFields>[0], "items"> & {
  items: StockCountBoard["items"];
}) => {
  const { language } = useLanguage();
  return (
    <CountFields
      {...boxes}
      items={items.map((item) => ({
        id: item.feedItemId,
        name: item.nameBn,
        unit: feedUnitWord(item.unit, language),
      }))}
    />
  );
};

/** What this Pen is owed, and what actually went out. Prefilled from the Ration, because a
 *  normal day is confirming figures and a sick pen is the one where somebody changes them. */
const FeedingFields = ({
  rows,
  cannotFeed,
  given,
  leftover,
  onGiven,
  onLeftover,
}: {
  rows: {
    feedItemId: string;
    nameBn: string;
    unit: string;
    /** Nothing for a line by weight in a Pen nobody weighed. */
    quantity: number | null;
  }[];
  /** The phone has never seen this Pen's Ration, so it cannot say what was owed. */
  cannotFeed: boolean;
  given: Typed;
  leftover: Typed;
  onGiven: (next: (current: Typed) => Typed) => void;
  onLeftover: (next: (current: Typed) => Typed) => void;
}) => {
  const { t, language } = useLanguage();
  if (cannotFeed) {
    return <Notice title={t("work.noRation")} tone="warning" />;
  }
  return (
    <>
      {rows.map((line) => (
        <div className="surface flex flex-col gap-2 p-3" key={line.feedItemId}>
          <p className="text-sm font-medium">
            {line.nameBn}{" "}
            {line.quantity === null ? null : (
              <span className="text-muted-foreground font-normal">
                · {t("feed.target")}: {formatNumber(line.quantity, language)}{" "}
                {feedUnitWord(line.unit, language)}
              </span>
            )}
          </p>
          {line.quantity === null ? (
            <p className="text-warning text-xs">{t("work.typeWhatWentOut")}</p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Input
              aria-label={`${line.nameBn} ${t("work.given")}`}
              className="h-14 text-lg md:h-12 md:text-lg"
              inputMode="decimal"
              onChange={(event) =>
                onGiven((current) => ({
                  ...current,
                  [line.feedItemId]: event.target.value,
                }))
              }
              placeholder={t("work.given")}
              type="number"
              value={
                given[line.feedItemId] ??
                (line.quantity === null ? "" : String(line.quantity))
              }
            />
            <Input
              aria-label={`${line.nameBn} ${t("work.leftover")}`}
              className="h-14 text-lg md:h-12 md:text-lg"
              inputMode="decimal"
              onChange={(event) =>
                onLeftover((current) => ({
                  ...current,
                  [line.feedItemId]: event.target.value,
                }))
              }
              placeholder={t("work.leftover")}
              type="number"
              value={leftover[line.feedItemId] ?? ""}
            />
          </div>
        </div>
      ))}
    </>
  );
};

/** Skipping an animal: the Version's own reasons, and nothing typed into a free box. A
 *  Correction still has to say why, because changing a recorded fact is the person speaking. */
const SkipSheet = ({
  reasons,
  animalTag,
  correcting,
  reason,
  onReason,
  onSkip,
  onBack,
}: {
  /** What this Step may be skipped with, as the button that opened this was drawn from. */
  reasons: Bilingual[];
  /** The animal being skipped, named above the reasons so nobody skips the wrong cow. */
  animalTag?: string;
  correcting: boolean;
  reason: string;
  onReason: (value: string) => void;
  onSkip: (payload: StepAnswer) => void;
  onBack: () => void;
}) => {
  const { t } = useLanguage();
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 pt-4 pb-6">
      <button
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring -ms-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-md px-2 text-sm font-medium outline-none focus-visible:ring-2"
        onClick={onBack}
        type="button"
      >
        <ChevronLeft aria-hidden className="size-4" />
        {t("work.back")}
      </button>
      <header className="flex items-center gap-3">
        <span className="bg-muted text-muted-foreground grid size-12 shrink-0 place-items-center rounded-xl">
          <SkipForward aria-hidden className="size-6" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          {animalTag ? <TagChip>{animalTag}</TagChip> : null}
          <h1 className="text-xl font-semibold">{t("work.skipWhy")}</h1>
        </div>
      </header>
      {correcting ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="skip-correction-reason">{t("correct.why")}</Label>
          <Input
            className="h-12 text-base md:h-12 md:text-base"
            id="skip-correction-reason"
            onChange={(event) => onReason(event.target.value)}
            value={reason}
          />
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        {reasons.map((skip) => (
          <Button
            className="h-auto min-h-14 w-full justify-start py-2 text-start text-lg whitespace-normal md:h-auto"
            disabled={correcting && !reason.trim()}
            key={skip.bn}
            onClick={() =>
              onSkip({
                evidence: [],
                skipReason: skip.bn,
                // Never the skip label standing in for a reason: changing what was recorded is
                // a Correction, and a Correction is the person saying why.
                reason: correcting ? reason.trim() : undefined,
              })
            }
            variant="outline"
          >
            {skip.bn}
          </Button>
        ))}
      </div>
      <Button
        className="h-12 w-full text-base md:h-12"
        onClick={onBack}
        variant="ghost"
      >
        {t("work.back")}
      </Button>
    </div>
  );
};

/**
 * What this Pen is owed, and whether this phone can say. A phone that has never opened
 * today's work with signal has no Ration to prefill from, and recording zeros against a
 * target it does not know would put a false shortfall on the farm.
 */
const feedingState = (
  feeds: boolean,
  feeding:
    | {
        items: {
          feedItemId: string;
          nameBn: string;
          unit: string;
          /** Nothing for a line by weight in a Pen nobody weighed. */
          quantity: number | null;
        }[];
      }
    | null
    | undefined
) => {
  const rows = feeds ? (feeding?.items ?? []) : [];
  return { rows, cannotFeed: feeds && rows.length === 0 };
};

/** A line that owed no figure — by weight, in a Pen nobody weighed — with nothing typed for it: until somebody says what
 *  went out, a blank would be recorded as none given. */
const untypedFeed = (
  rows: { feedItemId: string; quantity: number | null }[],
  given: Typed
) =>
  rows.some(
    (line) =>
      line.quantity === null && (given[line.feedItemId] ?? "").trim() === ""
  );

/** A field left as it was handed over means the figure that was handed over. */
const numberOr = (value: string | undefined, fallback: number): number => {
  const typed = Number(value);
  return value === undefined || value.trim() === "" || Number.isNaN(typed)
    ? fallback
    : typed;
};

/**
 * What went out, per Feed Item. A box left as it was handed over means the figure that was
 * handed over: somebody who clears one to retype it has not yet said the Pen got nothing.
 */
const whatWentOut = (
  rows: { feedItemId: string; quantity: number | null }[],
  given: Typed,
  leftover: Typed
) =>
  rows.map((line) => ({
    feedItemId: line.feedItemId,
    givenKg: numberOr(given[line.feedItemId], line.quantity ?? 0),
    leftoverKg: numberOr(leftover[line.feedItemId], 0),
  }));

/** What an entry's Effect recorded beside its Evidence, or nothing for an entry not yet made. */
const factsOf = (existing: Completion | undefined): FactsAsShown =>
  existing?.facts ?? {};

/** Each Feed Item's box filled with one figure of what was recorded. */
const typedFrom = (
  lines: FactsAsShown["feeding"],
  figure: (line: NonNullable<FactsAsShown["feeding"]>[number]) => number
): Typed =>
  Object.fromEntries(
    (lines ?? []).map((line) => [line.feedItemId, String(figure(line))])
  );

/** What the sheet is for, at its top: the animal and her photo, or the Step's picture; the Step's words; and whether
 *  this is a Correction or a cow whose milk is held. */
const SheetHead = ({
  step,
  animal,
  correcting,
  locked,
}: {
  step: Step;
  animal?: Animal;
  correcting: boolean;
  locked: boolean;
}) => {
  const { t } = useLanguage();
  return (
    <header className="surface flex items-center gap-4 p-4">
      {animal ? (
        <AnimalPhoto
          photoUpdatedAt={animal.photoUpdatedAt}
          size={80}
          tagNumber={animal.tagNumber}
        />
      ) : (
        <span className="bg-secondary text-secondary-foreground grid size-14 shrink-0 place-items-center rounded-xl">
          <SprayCan aria-hidden className="size-7" />
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-1.5">
        {animal ? <TagChip>{animal.tagNumber}</TagChip> : null}
        <h1 className="text-xl font-semibold">{step.text.bn}</h1>
        {correcting ? (
          <StatusBadge tone="info">{t("work.correcting")}</StatusBadge>
        ) : null}
        {locked ? (
          <StatusBadge icon={Lock} tone="warning">
            {t("milk.withdrawalShort")}
          </StatusBadge>
        ) : null}
      </div>
    </header>
  );
};

/** Each place milk can go, with a picture beside its word: the tank, the calf, the drain. */
const DESTINATION_ICON: Record<MilkDestination, LucideIcon> = {
  bulk: Milk,
  calves: Baby,
  discard: Trash2,
};

/** Where the milk goes. Three buttons, because that is the whole vocabulary — and none at
 *  all when a Withdrawal has already decided it. */
const DestinationChoice = ({
  value,
  locked,
  onChange,
}: {
  value: MilkDestination;
  locked: boolean;
  onChange: (next: MilkDestination) => void;
}) => {
  const { t } = useLanguage();
  if (locked) {
    return (
      <Notice icon={Lock} title={t("work.blockedWithdrawal")} tone="danger">
        {t("milk.withdrawal")}
      </Notice>
    );
  }
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">
        {t("milk.destination")}
      </legend>
      <div className="grid grid-cols-3 gap-2">
        {MILK_DESTINATIONS.map((option) => {
          const Icon = DESTINATION_ICON[option];
          const chosen = value === option;
          return (
            <Button
              aria-pressed={chosen}
              key={option}
              variant={chosen ? "default" : "outline"}
              className="h-auto min-h-16 flex-col gap-1 px-2 py-2 text-sm whitespace-normal md:h-auto"
              onClick={() => onChange(option)}
            >
              <Icon aria-hidden className="size-5" />
              {t(`milk.${option}`)}
            </Button>
          );
        })}
      </div>
    </fieldset>
  );
};

/** A field with its name above it, where somebody reads it before they type. */
const FieldWithLabel = ({
  htmlFor,
  label,
  children,
}: {
  htmlFor: string;
  label: string;
  children: ReactNode;
}) => (
  <div className="flex flex-col gap-1.5">
    <Label htmlFor={htmlFor}>{label}</Label>
    {children}
  </div>
);

/** Two digits, as a date field writes a month, a day, an hour or a minute. */
const twoDigits = (part: number) => String(part).padStart(2, "0");

/** An instant as a `datetime-local` field holds it: the phone's own day and minute, no zone. */
const asLocalField = (value: boolean | number | string | undefined): string => {
  if (typeof value !== "string" || value === "") {
    return "";
  }
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) {
    return "";
  }
  return `${at.getFullYear()}-${twoDigits(at.getMonth() + 1)}-${twoDigits(at.getDate())}T${twoDigits(at.getHours())}:${twoDigits(at.getMinutes())}`;
};

/** One piece of Evidence: a big number pad, a note, a choice, or the camera. A tick needs no
 *  control — confirming the Step is the tick. */
const EvidenceControl = ({
  evidence,
  language,
  value,
  hasPhoto,
  onValue,
  onPhoto,
}: {
  evidence: Evidence;
  language: string;
  value: boolean | number | string | undefined;
  hasPhoto: boolean;
  onValue: (value: string) => void;
  onPhoto: (photo: { contentType: "image/jpeg"; data: string }) => void;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const id = useId();

  if (evidence.type === "tick") {
    return null;
  }

  if (evidence.type === "number") {
    const typed = String(value ?? "");
    return (
      <div className="surface flex flex-col gap-3 p-4">
        <p
          aria-hidden
          className={cn(
            "text-center text-5xl font-bold tabular-nums",
            typed === "" && "text-muted-foreground/50"
          )}
        >
          {typed !== "" && Number.isFinite(Number(typed))
            ? new Intl.NumberFormat(
                language === "bn" ? "bn-BD" : "en-GB"
              ).format(Number(typed))
            : "০"}{" "}
          <span className="text-muted-foreground text-xl font-semibold">
            {evidence.unit?.bn}
          </span>
        </p>
        <Input
          inputMode="decimal"
          value={typed}
          onChange={(event) =>
            onValue(numberAsTyped(event.target.value).replaceAll("-", ""))
          }
          className="h-16 text-center text-3xl font-semibold tabular-nums md:h-16 md:text-3xl"
          aria-label={evidence.unit?.bn ?? t("work.confirm")}
        />
      </div>
    );
  }

  if (evidence.type === "choice") {
    return (
      <div className="grid grid-cols-2 gap-2">
        {(evidence.choices ?? []).map((choice) => (
          <Button
            aria-pressed={value === choice.value}
            key={choice.value}
            variant={value === choice.value ? "default" : "outline"}
            className="h-auto min-h-14 py-2 text-base whitespace-normal md:h-auto"
            onClick={() => onValue(choice.value)}
          >
            {choice.label.bn}
          </Button>
        ))}
      </div>
    );
  }

  if (evidence.type === "datetime") {
    return (
      <FieldWithLabel htmlFor={id} label={t("work.when")}>
        <Input
          className="h-12 text-base md:h-12 md:text-base"
          id={id}
          // The field speaks the phone's own clock, which on this farm is the farm's; what is kept
          // is the instant, so a phone set a zone away still records the right moment.
          onChange={(event) =>
            onValue(
              event.target.value === ""
                ? ""
                : new Date(event.target.value).toISOString()
            )
          }
          type="datetime-local"
          value={asLocalField(value)}
        />
      </FieldWithLabel>
    );
  }

  if (evidence.type === "note") {
    return (
      <FieldWithLabel htmlFor={id} label={t("work.note")}>
        <Input
          className="h-12 text-base md:h-12 md:text-base"
          id={id}
          value={String(value ?? "")}
          onChange={(event) => onValue(event.target.value)}
        />
      </FieldWithLabel>
    );
  }

  return (
    <label
      className={cn(
        "has-[:focus-visible]:ring-ring flex min-h-16 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed p-3 text-base font-medium has-[:focus-visible]:ring-2",
        hasPhoto
          ? "border-success/40 bg-success-surface text-success"
          : "bg-muted/60 hover:bg-muted"
      )}
    >
      {hasPhoto ? (
        <Check aria-hidden className="size-5" />
      ) : (
        <Camera aria-hidden className="size-5" />
      )}
      {hasPhoto ? t("work.saved") : t("work.photo")}
      <input
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) {
            return;
          }
          try {
            // Shrunk here, on the device. A camera makes three or four megabytes; a
            // morning of those would sit in the Outbox and time out on every attempt.
            onPhoto(await shrink(file));
          } catch (error) {
            refused(error);
          }
        }}
        type="file"
      />
    </label>
  );
};

/** The full-screen sheet: one control per piece of Evidence the Version asks for, skip with
 *  a reason for a per-animal Step, and a warning that must be acknowledged for an odd figure. */
export const EvidenceSheet = ({
  step,
  animal,
  correcting,
  existing,
  feeding,
  stockCount,
  medicineCount,
  renewal,
  onCancel,
  onRecord,
}: {
  step: Step;
  animal?: Animal;
  /** The entry already exists, so saving it again is a Correction. */
  correcting: boolean;
  /** The entry as it stands, whose Effect's facts a Correction starts from. */
  existing?: Completion;
  /** What this Pen is owed this session, for a Step that feeds. */
  feeding?: {
    items: {
      feedItemId: string;
      nameBn: string;
      unit: string;
      /** Nothing for a line by weight in a Pen nobody weighed. */
      quantity: number | null;
    }[];
  } | null;
  /** What to count, for a Step that counts the store. */
  stockCount?: StockCountBoard | null;
  /** What to count, in doses, for a Step that counts the medicine. */
  medicineCount?: MedicineCountBoard | null;
  /** When the Registration runs out now, for the Step that renews it. */
  renewal?: { expiresOn: Date | null } | null;
  onCancel: () => void;
  onRecord: (payload: StepAnswer) => void;
}) => {
  const { t, language } = useLanguage();
  // A date and time the Step asks for starts as now: it is changed only when the thing happened
  // earlier than it is being written down, which is the exception and not the rule.
  const [values, setValues] = useState<Entered>(() =>
    Object.fromEntries(
      step.evidence.flatMap((item, index) =>
        item.type === "datetime" ? [[index, new Date().toISOString()]] : []
      )
    )
  );
  const [skipping, setSkipping] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Taken>({});
  const [reason, setReason] = useState("");
  // A cow under Withdrawal has no choice to make. The server decides again when the entry
  // lands — this phone may have been offline since before she was treated.
  const locked = Boolean(animal?.underMilkWithdrawal);
  const [destination, setDestination] = useState<MilkDestination>(
    locked ? "discard" : "bulk"
  );
  const recordsMilk = step.effect?.kind === "milk_record";
  const feedsThePen = step.effect?.kind === "feeding";
  // Asked of one place, not worked out here: the server refuses a skip by the same rule, and when this
  // screen had its own the two disagreed — a dose Step written with "ওষুধ শেষ" against it drew no
  // button at all. The reasons rather than a yes, so the button and the sheet cannot differ on them.
  const skipReasons = skipReasonsOffered(step);
  const skippable = skipReasons.length > 0;
  // A Correction starts from what was fed, not from what the Ration owed: saving it unchanged keeps what went out.
  const recorded = factsOf(existing);
  const [given, setGiven] = useState<Typed>(() =>
    typedFrom(recorded.feeding, (line) => line.givenKg)
  );
  const [leftover, setLeftover] = useState<Typed>(() =>
    typedFrom(recorded.feeding, (line) => line.leftoverKg)
  );
  const count = useStockCount(step, stockCount);
  const medicine = useMedicineCount(step, medicineCount);
  const renewing = useRenewal(step, renewal, correcting, recorded.renewal);

  const { rows: feedingRows, cannotFeed } = feedingState(feedsThePen, feeding);

  const setValue = (index: number, value: boolean | number | string) => {
    setValues((current) => ({ ...current, [index]: value }));
    setWarning(null);
  };

  const assembled = step.evidence.map((item, index) => {
    if (item.type === "tick") {
      return true;
    }
    return values[index] ?? "";
  });

  const firstOutOfRange = () => outsideItsRange(step.evidence, values);
  // Asked of the answers as they will be sent, and by the farm's own rule: the button is offered when
  // the farm would take it, not when the boxes merely look filled.
  const ready = renewing.readyWith(
    missingEvidence(step, assembled, (slot) => Boolean(photos[slot])).length ===
      0
  );

  const submit = (force: boolean) => {
    const outside = firstOutOfRange();
    if (outside && !force) {
      setWarning(outside);
      return;
    }
    onRecord({
      evidence: assembled.map((value, index) =>
        step.evidence[index]?.type === "number" ? Number(value) : value
      ),
      outOfRange: outside ?? undefined,
      destination: recordsMilk ? destination : undefined,
      feeding: feedsThePen
        ? whatWentOut(feedingRows, given, leftover)
        : undefined,
      counts: count.lines(),
      medicineCounts: medicine.lines(),
      renewal: renewing.entry(),
      photos: Object.entries(photos).map(([slot, taken]) => ({
        slot: Number(slot),
        ...taken,
      })),
      reason: correcting ? reason.trim() : undefined,
    });
  };

  if (skipping) {
    return (
      <SkipSheet
        animalTag={animal?.tagNumber}
        correcting={correcting}
        onBack={() => setSkipping(false)}
        onReason={setReason}
        onSkip={onRecord}
        reason={reason}
        reasons={skipReasons}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 pt-4 pb-2">
      <button
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring -ms-2 -mb-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-md px-2 text-sm font-medium outline-none focus-visible:ring-2"
        onClick={onCancel}
        type="button"
      >
        <ChevronLeft aria-hidden className="size-4" />
        {t("work.back")}
      </button>
      <SheetHead
        animal={animal}
        correcting={correcting}
        locked={locked}
        step={step}
      />

      {step.evidence.map((item, index) => (
        <EvidenceControl
          key={`${step.id}-${index}`}
          evidence={item}
          language={language}
          value={values[index]}
          hasPhoto={Boolean(photos[index])}
          onValue={(value) => setValue(index, value)}
          onPhoto={(taken) =>
            setPhotos((current) => ({ ...current, [index]: taken }))
          }
        />
      ))}

      {recordsMilk ? (
        <DestinationChoice
          value={destination}
          locked={locked}
          onChange={setDestination}
        />
      ) : null}

      <RenewalFields renewing={renewing} />

      <StockCountFields
        counted={count.counted}
        items={count.items}
        onCounted={count.handleCounted}
        onReason={count.handleReason}
        reasons={count.reasons}
      />

      <CountFields
        counted={medicine.counted}
        items={medicine.items.map((item) => ({
          id: item.drugProductId,
          name: item.nameBn,
          unit: t("drugs.doseWord"),
        }))}
        onCounted={medicine.handleCounted}
        onReason={medicine.handleReason}
        reasons={medicine.reasons}
      />

      <FeedingFields
        cannotFeed={cannotFeed}
        given={given}
        leftover={leftover}
        onGiven={setGiven}
        onLeftover={setLeftover}
        rows={feedingRows}
      />

      {correcting ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="correction-reason">{t("correct.why")}</Label>
          <Input
            className="h-12 text-base md:h-12 md:text-base"
            id="correction-reason"
            onChange={(event) => setReason(event.target.value)}
            value={reason}
          />
        </div>
      ) : null}

      {warning ? (
        <Notice title={t("work.outOfRange")} tone="warning">
          <Button
            className="mt-2 w-full"
            onClick={() => submit(true)}
            variant="outline"
          >
            {t("work.keepAnyway")}
          </Button>
        </Notice>
      ) : null}

      <StickyAction>
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="ghost"
            className="h-14 text-base md:h-12"
            onClick={onCancel}
          >
            {t("work.back")}
          </Button>
          {skippable ? (
            <Button
              variant="outline"
              className="h-14 text-base md:h-12"
              onClick={() => setSkipping(true)}
            >
              <SkipForward data-icon="inline-start" />
              {t("work.skip")}
            </Button>
          ) : null}
          <Button
            className={`h-14 text-lg md:h-12 ${skippable ? "" : "col-span-2"}`}
            disabled={
              cannotFeed ||
              untypedFeed(feedingRows, given) ||
              !count.complete ||
              !(ready && (!correcting || reason.trim()))
            }
            onClick={() => submit(false)}
          >
            <Check data-icon="inline-start" />
            {correcting ? t("correct.save") : t("work.confirm")}
          </Button>
        </div>
      </StickyAction>
    </div>
  );
};
