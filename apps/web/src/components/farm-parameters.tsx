import type { MessageKey } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useT } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

type NumberKey =
  | "milkTolerancePercent"
  | "feedTolerancePercent"
  | "escalationMinutes"
  | "staffCorrectionHours"
  | "managerCorrectionDays"
  | "registrationRenewalLeadDays"
  | "fatteningTargetWeightKg"
  | "aiWindowStartHours"
  | "aiWindowEndHours"
  | "pregnancyCheckAfterDays"
  | "gestationDays"
  | "dryOffLeadDays"
  | "calvingPrepLeadDays"
  | "repeatBreederThreshold"
  | "approvalThresholdBdt";
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

/** The Parameters in the groups a Manager thinks of them in, each with the bounds the farm will accept. */
const GROUPS: { title: MessageKey; fields: FieldSpec[] }[] = [
  {
    title: "params.alerts",
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
    ],
  },
  {
    title: "params.records",
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
    title: "params.breeding",
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
    title: "params.fatteningAndPapers",
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
const changesOf = (draft: Values, saved: Values): Record<string, unknown> => {
  const changes: Record<string, unknown> = {};
  for (const key of Object.keys(draft) as Key[]) {
    if (draft[key].trim() === saved[key].trim()) {
      continue;
    }
    if (key === "digestTimes") {
      changes[key] = draft[key]
        .split(",")
        .map((time) => time.trim())
        .filter(Boolean);
    } else if (key === "quietFrom" || key === "quietUntil") {
      changes[key] = draft[key].trim();
    } else {
      changes[key] = Number(draft[key]);
    }
  }
  return changes;
};

/**
 * How the farm is tuned: when people are told, how far a reading may drift, how long a record stays open to
 * correction, and the breeding calendar the Playbook times its work from. The Owner's or the Manager's to turn.
 */
export const FarmParameters = () => {
  const t = useT();
  const queryClient = useQueryClient();
  const farm = useQuery(orpc.farm.current.queryOptions());
  const [draft, setDraft] = useState<Values | null>(null);

  const save = useMutation(
    orpc.farm.setParameters.mutationOptions({
      onSuccess: async () => {
        toast.success(t("params.saved"));
        setDraft(null);
        await queryClient.invalidateQueries({ queryKey: orpc.farm.key() });
        await queryClient.invalidateQueries({ queryKey: orpc.people.me.key() });
      },
      onError: (error) => toast.error(error.message || t("common.error")),
    })
  );

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
  const values = draft ?? saved;
  const changes = changesOf(values, saved);
  const changed = Object.keys(changes).length > 0;

  return (
    <form
      className="surface flex flex-col gap-6 p-4 md:p-6"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(changes as Parameters<typeof save.mutate>[0]);
      }}
    >
      <div className="flex flex-col gap-1">
        <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
          <SlidersHorizontal
            aria-hidden
            className="text-muted-foreground size-5"
          />
          {t("params.title")}
        </h2>
        <p className="text-muted-foreground text-sm">{t("params.why")}</p>
      </div>
      {GROUPS.map((group) => (
        <fieldset className="flex flex-col gap-3" key={group.title}>
          <legend className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
            {t(group.title)}
          </legend>
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
                    placeholder={
                      field.key === "digestTimes" ? "18:00" : undefined
                    }
                    required
                    type={inputTypeOf(field)}
                    value={values[field.key]}
                  />
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={save.isPending || !changed} type="submit">
          {save.isPending ? <Spinner /> : null}
          {t("params.save")}
        </Button>
        {changed ? (
          <Button onClick={() => setDraft(null)} type="button" variant="ghost">
            {t("common.cancel")}
          </Button>
        ) : null}
      </div>
    </form>
  );
};
