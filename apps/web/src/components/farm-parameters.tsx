import {
  FEWEST_KEEP_READ_DAYS,
  fewestDaysBeforeMilkIsWeighed,
} from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { useIsOwner } from "@/components/money";
import { Section } from "@/components/page";
import { useT } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

type NumberKey =
  | "milkTolerancePercent"
  | "feedTolerancePercent"
  | "escalationMinutes"
  | "staffCorrectionHours"
  | "managerCorrectionDays"
  | "registrationRenewalLeadDays"
  | "expiryWarnDays"
  | "fatteningTargetWeightKg"
  | "aiWindowStartHours"
  | "aiWindowEndHours"
  | "pregnancyCheckAfterDays"
  | "gestationDays"
  | "dryOffLeadDays"
  | "calvingPrepLeadDays"
  | "repeatBreederThreshold"
  | "keepReadDays"
  | "keepAheadDays"
  | "keepNeedsDays"
  | "keepRateGapDays"
  | "cullOpenDays"
  | "cullMilkAfterDays"
  | "cullMilkPriceDays"
  | "approvalThresholdBdt"
  | "ventureFloorPercent"
  | "ventureRunningPercent"
  | "ventureInvestorsPercent"
  | "windUpDays"
  | "adjustmentThresholdBdt"
  | "investorCap"
  | "investorWarnAt"
  | "runningBudgetWarnBdt";
type TextKey = "digestTimes" | "quietFrom" | "quietUntil";
type Key = NumberKey | TextKey;

interface FieldSpec {
  key: Key;
  label: MessageKey;
  unit?: MessageKey;
  min?: number;
  max?: number;
  time?: boolean;
}

/** The Parameters in the groups a Manager thinks of them in, each with what it is for and the bounds the farm will
 *  accept. */
const GROUPS: {
  id: string;
  title: MessageKey;
  hint: MessageKey;
  /** A group only the Owner is offered: a Venture's figures are hers, as the Venture is. */
  owner?: boolean;
  fields: FieldSpec[];
}[] = [
  {
    id: "params-alerts",
    title: "params.alerts",
    hint: "params.alertsHint",
    fields: [
      { key: "digestTimes", label: "params.digestTimes" },
      { key: "quietFrom", label: "params.quietFrom", time: true },
      { key: "quietUntil", label: "params.quietUntil", time: true },
      {
        key: "escalationMinutes",
        label: "params.escalation",
        unit: "params.minutes",
        min: 0,
        max: 1440,
      },
      {
        key: "expiryWarnDays",
        label: "params.expiryWarn",
        unit: "params.days",
        min: 1,
        max: 365,
      },
    ],
  },
  {
    id: "params-records",
    title: "params.records",
    hint: "params.recordsHint",
    fields: [
      {
        key: "milkTolerancePercent",
        label: "params.milkTolerance",
        unit: "params.percent",
        min: 0,
        max: 100,
      },
      {
        key: "feedTolerancePercent",
        label: "params.feedTolerance",
        unit: "params.percent",
        min: 0,
        max: 100,
      },
      {
        key: "staffCorrectionHours",
        label: "params.staffCorrection",
        unit: "params.hours",
        min: 0,
        max: 168,
      },
      {
        key: "managerCorrectionDays",
        label: "params.managerCorrection",
        unit: "params.days",
        min: 0,
        max: 365,
      },
      {
        key: "approvalThresholdBdt",
        label: "params.approvalThreshold",
        unit: "params.taka",
        min: 0,
        max: 100_000_000,
      },
    ],
  },
  {
    id: "params-keep-and-cull",
    title: "params.keepAndCull",
    hint: "params.keepAndCullHint",
    owner: true,
    fields: [
      {
        key: "keepReadDays",
        label: "params.keepReadDays",
        unit: "params.days",
        min: FEWEST_KEEP_READ_DAYS,
        max: 90,
      },
      {
        key: "keepAheadDays",
        label: "params.keepAheadDays",
        unit: "params.days",
        min: 7,
        max: 90,
      },
      {
        key: "keepNeedsDays",
        label: "params.keepNeedsDays",
        unit: "params.days",
        min: 1,
        max: 28,
      },
      {
        key: "keepRateGapDays",
        label: "params.keepRateGapDays",
        unit: "params.days",
        min: 1,
        max: 28,
      },
      {
        key: "cullOpenDays",
        label: "params.cullOpenDays",
        unit: "params.days",
        min: 60,
        max: 365,
      },
      {
        key: "cullMilkAfterDays",
        label: "params.cullMilkAfterDays",
        unit: "params.days",
        // The server holds it a week past the days this farm reads a keep over; this is only the soonest any farm may
        // have.
        min: fewestDaysBeforeMilkIsWeighed(FEWEST_KEEP_READ_DAYS),
        max: 180,
      },
      {
        key: "cullMilkPriceDays",
        label: "params.cullMilkPriceDays",
        unit: "params.days",
        min: 7,
        max: 365,
      },
    ],
  },
  {
    id: "params-ventures",
    title: "params.ventures",
    hint: "params.venturesHint",
    owner: true,
    fields: [
      {
        key: "ventureFloorPercent",
        label: "params.ventureFloor",
        unit: "params.percent",
        min: 0,
        max: 100,
      },
      {
        key: "ventureRunningPercent",
        label: "params.ventureRunning",
        unit: "params.percent",
        min: 0,
        max: 90,
      },
      {
        key: "ventureInvestorsPercent",
        label: "params.ventureInvestors",
        unit: "params.percent",
        min: 0,
        max: 100,
      },
      {
        key: "windUpDays",
        label: "params.windUp",
        unit: "params.days",
        min: 0,
        max: 180,
      },
      {
        key: "adjustmentThresholdBdt",
        label: "params.adjustmentThreshold",
        unit: "params.taka",
        min: 0,
        max: 1_000_000,
      },
      {
        key: "investorCap",
        label: "params.investorCap",
        unit: "params.people",
        min: 1,
        max: 50,
      },
      {
        key: "investorWarnAt",
        label: "params.investorWarnAt",
        unit: "params.people",
        min: 1,
        max: 50,
      },
      {
        key: "runningBudgetWarnBdt",
        label: "params.runningBudgetWarn",
        unit: "params.taka",
        min: 0,
        max: 100_000_000,
      },
    ],
  },
  {
    id: "params-breeding",
    title: "params.breeding",
    hint: "params.breedingHint",
    fields: [
      {
        key: "aiWindowStartHours",
        label: "params.aiWindowStart",
        unit: "params.hours",
        min: 0,
        max: 72,
      },
      {
        key: "aiWindowEndHours",
        label: "params.aiWindowEnd",
        unit: "params.hours",
        min: 1,
        max: 96,
      },
      {
        key: "pregnancyCheckAfterDays",
        label: "params.pregnancyCheck",
        unit: "params.days",
        min: 28,
        max: 90,
      },
      {
        key: "gestationDays",
        label: "params.gestation",
        unit: "params.days",
        min: 260,
        max: 300,
      },
      {
        key: "dryOffLeadDays",
        label: "params.dryOffLead",
        unit: "params.days",
        min: 30,
        max: 90,
      },
      {
        key: "calvingPrepLeadDays",
        label: "params.calvingPrepLead",
        unit: "params.days",
        min: 1,
        max: 30,
      },
      {
        key: "repeatBreederThreshold",
        label: "params.repeatBreeder",
        unit: "params.attempts",
        min: 2,
        max: 10,
      },
    ],
  },
  {
    id: "params-fattening",
    title: "params.fatteningAndPapers",
    hint: "params.fatteningAndPapersHint",
    fields: [
      {
        key: "fatteningTargetWeightKg",
        label: "params.fatteningTarget",
        unit: "params.kg",
        min: 1,
        max: 2000,
      },
      {
        key: "registrationRenewalLeadDays",
        label: "params.renewalLead",
        unit: "params.days",
        min: 0,
        max: 365,
      },
    ],
  },
];

type Values = Record<Key, string>;
/** What has been typed into a group so far: only the fields somebody touched. */
type Draft = Partial<Values>;

const inputTypeOf = (field: FieldSpec) => {
  if (field.time) {
    return "time";
  }
  return field.unit ? "number" : "text";
};

const asText = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return value === null || value === undefined ? "" : String(value);
};

/** Only what was changed goes to the farm, so saving one number never rewrites the rest. */
const changesOf = (draft: Draft, saved: Values): Record<string, unknown> => {
  const changes: Record<string, unknown> = {};
  for (const key of Object.keys(draft) as Key[]) {
    const typed = draft[key] ?? "";
    if (typed.trim() === saved[key].trim()) {
      continue;
    }
    if (key === "digestTimes") {
      changes[key] = typed
        .split(",")
        .map((time) => time.trim())
        .filter(Boolean);
    } else if (key === "quietFrom" || key === "quietUntil") {
      changes[key] = typed.trim();
    } else {
      changes[key] = Number(typed);
    }
  }
  return changes;
};

/**
 * One part of a settings page with a save of its own: its name and what it is for, its fields, and at its foot the
 * save — ready only once something in it has changed — with the way back to what the farm holds.
 */
export const SettingsSection = ({
  id,
  title,
  description,
  saveLabel,
  changed,
  pending,
  onSubmit,
  onReset,
  children,
}: {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  saveLabel: ReactNode;
  changed: boolean;
  pending: boolean;
  onSubmit: () => void;
  onReset: () => void;
  children: ReactNode;
}) => {
  const t = useT();
  return (
    <Section
      className="scroll-mt-6"
      description={description}
      id={id}
      title={title}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        {children}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
          {changed ? (
            <p className="text-muted-foreground mr-auto text-sm">
              {t("identity.unsaved")}
            </p>
          ) : null}
          {changed ? (
            <Button onClick={onReset} type="button" variant="ghost">
              {t("common.cancel")}
            </Button>
          ) : null}
          <Button disabled={pending || !changed} type="submit">
            {pending ? <Spinner /> : null}
            {saveLabel}
          </Button>
        </div>
      </form>
    </Section>
  );
};

/** The parts of the Parameters, for a page that lists what is on it — and which are the Owner's, so the list does not
 *  offer the Manager a jump to a part that is not drawn for them. */
export const PARAMETER_SECTIONS = GROUPS.map(({ id, title, owner }) => ({
  id,
  title,
  owner: owner ?? false,
}));

/** One group of Parameters, saved on its own: only what was changed in it goes to the farm. */
const ParameterGroup = ({
  group,
  saved,
}: {
  group: (typeof GROUPS)[number];
  saved: Values;
}) => {
  const t = useT();
  const refused = useRefused();
  const [draft, setDraft] = useState<Draft | null>(null);
  const save = useMutation(
    orpc.farm.setParameters.mutationOptions({
      onSuccess: () => {
        toast.success(t("params.saved"));
        setDraft(null);
      },
      onError: refused,
    })
  );
  const values = draft ?? {};
  const changes = changesOf(values, saved);
  const changed = Object.keys(changes).length > 0;

  return (
    <SettingsSection
      changed={changed}
      description={t(group.hint)}
      id={group.id}
      onReset={() => setDraft(null)}
      onSubmit={() => save.mutate(changes as Parameters<typeof save.mutate>[0])}
      pending={save.isPending}
      saveLabel={t("params.save")}
      title={t(group.title)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {group.fields.map((field) => {
          const id = `param-${field.key}`;
          return (
            <div className="flex flex-col gap-1.5" key={field.key}>
              <Label htmlFor={id}>
                {t(field.label)}
                {field.unit ? (
                  <span className="text-muted-foreground font-normal">
                    {" "}
                    · {t(field.unit)}
                  </span>
                ) : null}
              </Label>
              <Input
                id={id}
                inputMode={field.unit ? "numeric" : undefined}
                max={field.max}
                min={field.min}
                onChange={(event) =>
                  setDraft({ ...values, [field.key]: event.target.value })
                }
                placeholder={field.key === "digestTimes" ? "18:00" : undefined}
                required
                type={inputTypeOf(field)}
                value={values[field.key] ?? saved[field.key]}
              />
            </div>
          );
        })}
      </div>
    </SettingsSection>
  );
};

/**
 * How the farm is tuned: when people are told, how far a reading may drift, how long a record stays open to
 * correction, and the breeding calendar the Playbook times its work from — a group at a time, each saved on its own.
 * The Owner's or the Manager's to turn.
 */
export const FarmParameters = () => {
  const t = useT();
  const isOwner = useIsOwner();
  const farm = useQuery(orpc.farm.current.queryOptions());

  if (!farm.data) {
    return null;
  }
  const record = farm.data as unknown as Record<Key, unknown>;
  const saved = Object.fromEntries(
    GROUPS.flatMap((group) => group.fields).map((field) => [
      field.key,
      asText(record[field.key]),
    ])
  ) as Values;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 pt-2">
        <h2 className="inline-flex items-center gap-2 text-base font-semibold tracking-tight">
          <SlidersHorizontal
            aria-hidden
            className="text-muted-foreground size-5"
          />
          {t("params.title")}
        </h2>
        <p className="text-muted-foreground text-sm">{t("params.why")}</p>
      </div>
      {GROUPS.filter((group) => !group.owner || isOwner).map((group) => (
        <ParameterGroup group={group} key={group.id} saved={saved} />
      ))}
    </div>
  );
};
