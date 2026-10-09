import { timeInDigits } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useState } from "react";

import { FarmShareNote } from "@/components/feed/farm-gains";
import { useIsOwner } from "@/components/money";
import { Loaded, Section } from "@/components/page";
import { useLanguage, useT } from "@/i18n/language-provider";
import type { FieldSpec, ParameterKey } from "@/lib/parameter-groups";
import { PARAMETER_GROUPS, boundsOf } from "@/lib/parameter-groups";
import {
  digestTimesOf,
  parameterFigure,
  parameterProblem,
} from "@/lib/parameter-typed";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

type Values = Record<ParameterKey, string>;
/** What has been typed into a group so far: only the fields somebody touched. */
type Draft = Partial<Values>;

/** A time box the browser draws for the quiet hours; every other box is text the farm reads, Bangla digits and all —
 *  a number box read "৩০" and "1.5" as nothing and answered in the browser's own language. */
const inputTypeOf = (field: FieldSpec) => (field.time ? "time" : "text");

const asText = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return value === null || value === undefined ? "" : String(value);
};

/** Only what was changed goes to the farm, so saving one number never rewrites the rest. */
const changesOf = (draft: Draft, saved: Values): Record<string, unknown> => {
  const changes: Record<string, unknown> = {};
  for (const key of Object.keys(draft) as ParameterKey[]) {
    const typed = draft[key] ?? "";
    if (typed.trim() === saved[key].trim()) {
      continue;
    }
    if (key === "digestTimes") {
      changes[key] = digestTimesOf(typed);
    } else if (key === "quietFrom" || key === "quietUntil") {
      changes[key] = typed.trim();
    } else {
      changes[key] = parameterFigure(typed);
    }
  }
  return changes;
};

/** The range a setting takes, said under its box in the reader's digits — and, typed outside it or not a whole
 *  number, that in its place. */
const FieldRange = ({
  field,
  id,
  problem,
}: {
  field: FieldSpec;
  id: string;
  problem: "notAWholeFigure" | "outOfRange" | null;
}) => {
  const t = useT();
  const bounds = boundsOf(field.key);
  const range = t("params.range", {
    min: bounds?.min ?? 0,
    max: bounds?.max ?? 0,
  });
  if (problem === null) {
    return (
      <p className="text-muted-foreground text-xs" id={id}>
        {range}
      </p>
    );
  }
  return (
    <p className="text-destructive text-xs" id={id}>
      {problem === "notAWholeFigure" ? t("params.notAWholeFigure") : range}
    </p>
  );
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

/** One group of Parameters, saved on its own: only what was changed in it goes to the farm. */
const ParameterGroup = ({
  group,
  saved,
}: {
  group: (typeof PARAMETER_GROUPS)[number];
  saved: Values;
}) => {
  const { t, language } = useLanguage();
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
  // What is wrong with a figure typed, said under its box: saved only once every one the farm would refuse is right.
  const problemOf = (field: FieldSpec) =>
    field.unit && values[field.key] !== undefined
      ? parameterProblem(values[field.key] ?? "", boundsOf(field.key) ?? {})
      : null;
  const allRight = group.fields.every((field) => problemOf(field) === null);
  const changed = Object.keys(changes).length > 0 && allRight;

  return (
    <SettingsSection
      changed={changed}
      description={
        group.sourced ? (
          <>
            {t(group.hint)}{" "}
            <Link
              className="text-primary underline-offset-4 hover:underline"
              to="/standards"
            >
              {t("standards.link")}
            </Link>
          </>
        ) : (
          t(group.hint)
        )
      }
      id={group.id}
      onReset={() => setDraft(null)}
      onSubmit={() => save.mutate(changes as Parameters<typeof save.mutate>[0])}
      pending={save.isPending}
      saveLabel={t("params.save")}
      title={t(group.title)}
    >
      <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
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
                aria-describedby={field.unit ? `${id}-range` : undefined}
                aria-invalid={problemOf(field) ? true : undefined}
                id={id}
                inputMode={field.unit ? "numeric" : undefined}
                onChange={(event) =>
                  setDraft({ ...values, [field.key]: event.target.value })
                }
                placeholder={
                  field.key === "digestTimes"
                    ? timeInDigits("18:00", language)
                    : undefined
                }
                type={inputTypeOf(field)}
                value={values[field.key] ?? saved[field.key]}
              />
              {field.unit ? (
                <FieldRange
                  field={field}
                  id={`${id}-range`}
                  problem={problemOf(field)}
                />
              ) : null}
              {field.farmsOwn ? <FarmShareNote kind={field.farmsOwn} /> : null}
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
  const isOwner = useIsOwner();
  const farm = useQuery(orpc.farm.current.queryOptions());
  if (!farm.data) {
    // The settings' place held under the page's header while the farm is asked, or why it could not answer.
    return (
      <Loaded
        query={farm}
        skeleton={<Skeleton aria-hidden className="h-64 rounded-xl" />}
      >
        {null}
      </Loaded>
    );
  }
  const record = farm.data as unknown as Record<ParameterKey, unknown>;
  const saved = Object.fromEntries(
    PARAMETER_GROUPS.flatMap((group) => group.fields).map((field) => [
      field.key,
      asText(record[field.key]),
    ])
  ) as Values;

  return (
    <div className="flex flex-col gap-6">
      {PARAMETER_GROUPS.filter((group) => !group.owner || isOwner).map(
        (group) => (
          <ParameterGroup group={group} key={group.id} saved={saved} />
        )
      )}
    </div>
  );
};
