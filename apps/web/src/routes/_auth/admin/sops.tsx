import type {
  EvidenceType,
  SopContent,
  Step,
  StepEffect,
} from "@OpenFarm/domain";
import {
  EVIDENCE_TYPES,
  FARM_EVENTS,
  STEP_EFFECT_KINDS,
  LIVE_STATES,
  MAX_TRIGGER_OFFSET_DAYS,
  ROLES,
  findPublishBlockers,
} from "@OpenFarm/domain";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { useT } from "@/i18n/language-provider";
import type { HappeningTrigger } from "@/lib/sop-draft";
import {
  emptyHappening,
  emptySop,
  emptyStep,
  fromChoices,
  happeningTriggers,
  needsChoices,
  toChoices,
  fromBilingualList,
  needsUnit,
  scheduleTimes,
  splitList,
  toBilingualList,
  withEffect,
  withHappeningTriggers,
  withScheduleTimes,
} from "@/lib/sop-draft";
import { orpc } from "@/utils/orpc";

const SopsPage = () => {
  const t = useT();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<{
    content: SopContent;
    definitionId: string | null;
  } | null>(null);

  const me = useQuery(orpc.people.me.queryOptions());
  // The Pens a moving Step may walk an animal to, named as the farm names them.
  const sheds = useQuery(orpc.herd.list.queryOptions());
  const pens = (sheds.data ?? []).flatMap((shed) =>
    shed.pens.map((pen) => ({
      id: pen.id,
      name: `${shed.name} / ${pen.name}`,
    }))
  );
  const sops = useQuery(orpc.sops.list.queryOptions());
  const proposals = useQuery(orpc.sops.proposals.queryOptions());
  const isOwner = me.data?.roles.includes("owner") ?? false;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: orpc.sops.key() });
  };
  const onError = (error: Error) =>
    toast.error(error.message || t("common.error"));
  const onPublished = (result: { number: number }) => {
    toast.success(t("sop.published", { number: result.number }));
    setDraft(null);
    refresh();
  };

  const create = useMutation(
    orpc.sops.create.mutationOptions({ onSuccess: onPublished, onError })
  );
  const publish = useMutation(
    orpc.sops.publish.mutationOptions({ onSuccess: onPublished, onError })
  );
  const propose = useMutation(
    orpc.sops.propose.mutationOptions({
      onSuccess: () => {
        toast.success(t("sop.proposed"));
        setDraft(null);
        refresh();
      },
      onError,
    })
  );
  const approve = useMutation(
    orpc.sops.approveProposal.mutationOptions({
      onSuccess: onPublished,
      onError,
    })
  );
  const reject = useMutation(
    orpc.sops.rejectProposal.mutationOptions({ onSuccess: refresh, onError })
  );

  const save = () => {
    if (!draft) {
      return;
    }
    if (!isOwner) {
      if (draft.definitionId) {
        propose.mutate({
          definitionId: draft.definitionId,
          content: draft.content,
        });
      }
      return;
    }
    if (draft.definitionId) {
      publish.mutate({
        definitionId: draft.definitionId,
        content: draft.content,
      });
    } else {
      create.mutate({ content: draft.content });
    }
  };

  if (draft) {
    const blockers = findPublishBlockers(draft.content);
    return (
      <SopEditor
        content={draft.content}
        blockers={blockers}
        canPublish={isOwner}
        pens={pens}
        onChange={(content) => setDraft({ ...draft, content })}
        onSave={save}
        onCancel={() => setDraft(null)}
      />
    );
  }

  return (
    <div className="container mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("sop.title")}</h1>
        {isOwner ? (
          <Button
            onClick={() =>
              setDraft({ content: emptySop(), definitionId: null })
            }
          >
            {t("sop.new")}
          </Button>
        ) : null}
      </div>

      {sops.data?.length ? (
        <ul className="space-y-2">
          {sops.data.map((sop) => {
            const content = sop.currentVersion?.content as
              | SopContent
              | undefined;
            return (
              <li
                key={sop.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div>
                  <p className="font-medium">{content?.name.bn ?? "—"}</p>
                  <p className="text-muted-foreground text-sm">
                    {t("sop.version", {
                      number: sop.currentVersion?.number ?? 0,
                    })}{" "}
                    · {content?.steps.length ?? 0} {t("sop.steps")}
                  </p>
                </div>
                {content ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDraft({ content, definitionId: sop.id })}
                  >
                    {isOwner ? t("sop.edit") : t("sop.propose")}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t("sop.none")}</p>
      )}

      <section className="space-y-2">
        <h2 className="font-medium">{t("sop.proposals")}</h2>
        {proposals.data?.length ? (
          <ul className="space-y-2">
            {proposals.data.map((proposal) => (
              <li key={proposal.id} className="space-y-2 rounded-lg border p-3">
                <p className="text-sm">
                  {(proposal.content as SopContent).name.bn} ·{" "}
                  {t("sop.proposalBy", { name: proposal.proposer?.name ?? "" })}
                </p>
                {proposal.note ? (
                  <p className="text-muted-foreground text-sm">
                    {proposal.note}
                  </p>
                ) : null}
                {isOwner ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => approve.mutate({ id: proposal.id })}
                    >
                      {t("sop.approve")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        reject.mutate({
                          id: proposal.id,
                          note: t("sop.rejectReason"),
                        })
                      }
                    >
                      {t("sop.reject")}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">
            {t("sop.noProposals")}
          </p>
        )}
      </section>
    </div>
  );
};

/** What raises this work besides the clock: a Move, an arrival, or a cow reaching a State.
 *  Only what the farm actually records can be picked, because a Trigger nobody writes is
 *  work that never arrives. */
const TriggerFields = ({
  content,
  onChange,
}: {
  content: SopContent;
  onChange: (next: SopContent) => void;
}) => {
  const t = useT();
  const happenings = happeningTriggers(content);
  const replace = (index: number, next: HappeningTrigger | null) =>
    onChange(
      withHappeningTriggers(
        content,
        next === null
          ? happenings.filter((_, at) => at !== index)
          : happenings.map((current, at) => (at === index ? next : current))
      )
    );

  return (
    <fieldset className="space-y-2">
      <legend className="text-muted-foreground text-sm">
        {t("sop.triggers")}
      </legend>
      {happenings.map((happening, index) => (
        <div
          className="flex flex-wrap items-end gap-2"
          key={`${happening.kind}-${index}`}
        >
          <select
            aria-label={t("sop.triggers")}
            className="bg-background h-9 rounded-md border px-2 text-sm"
            onChange={(e) =>
              replace(
                index,
                e.target.value === "event"
                  ? { kind: "event", event: "move", offsetDays: happening.offsetDays }
                  : {
                      kind: "state",
                      state: "dry",
                      offsetDays: happening.offsetDays,
                    }
              )
            }
            value={happening.kind}
          >
            <option value="event">{t("sop.trigger.event")}</option>
            <option value="state">{t("sop.trigger.state")}</option>
          </select>
          {happening.kind === "event" ? (
            <select
              aria-label={t("sop.trigger.event")}
              className="bg-background h-9 rounded-md border px-2 text-sm"
              onChange={(e) =>
                replace(index, { ...happening, event: e.target.value as never })
              }
              value={happening.event}
            >
              {FARM_EVENTS.map((event) => (
                <option key={event} value={event}>
                  {t(`event.${event}`)}
                </option>
              ))}
            </select>
          ) : (
            <select
              aria-label={t("sop.trigger.state")}
              className="bg-background h-9 rounded-md border px-2 text-sm"
              onChange={(e) =>
                replace(index, { ...happening, state: e.target.value as never })
              }
              value={happening.state}
            >
              {LIVE_STATES.map((state) => (
                <option key={state} value={state}>
                  {t(`state.${state}`)}
                </option>
              ))}
            </select>
          )}
          <div className="space-y-1">
            <Label htmlFor={`after-${index}`}>{t("sop.trigger.after")}</Label>
            <Input
              className="w-24"
              id={`after-${index}`}
              max={MAX_TRIGGER_OFFSET_DAYS}
              min={0}
              onChange={(e) =>
                replace(index, {
                  ...happening,
                  offsetDays: Number(e.target.value) || 0,
                })
              }
              type="number"
              value={happening.offsetDays ?? 0}
            />
          </div>
          <Button
            onClick={() => replace(index, null)}
            type="button"
            variant="ghost"
          >
            {t("sop.trigger.remove")}
          </Button>
        </div>
      ))}
      <Button
        onClick={() =>
          onChange(
            withHappeningTriggers(content, [...happenings, emptyHappening()])
          )
        }
        type="button"
        variant="outline"
      >
        {t("sop.trigger.add")}
      </Button>
    </fieldset>
  );
};

const SopEditor = ({
  content,
  blockers,
  canPublish,
  pens,
  onChange,
  onSave,
  onCancel,
}: {
  content: SopContent;
  blockers: string[];
  canPublish: boolean;
  pens: { id: string; name: string }[];
  onChange: (content: SopContent) => void;
  onSave: () => void;
  onCancel: () => void;
}) => {
  const t = useT();
  const setStep = (index: number, step: Step) => {
    const steps = [...content.steps];
    steps[index] = step;
    onChange({ ...content, steps });
  };

  return (
    <form
      className="container mx-auto max-w-3xl space-y-5 px-4 py-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="name-bn">{`${t("sop.name")} — ${t("sop.bangla")}`}</Label>
          <Input
            id="name-bn"
            value={content.name.bn}
            onChange={(e) =>
              onChange({
                ...content,
                name: { ...content.name, bn: e.target.value },
              })
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="name-en">{`${t("sop.name")} — ${t("sop.english")}`}</Label>
          <Input
            id="name-en"
            value={content.name.en ?? ""}
            onChange={(e) =>
              onChange({
                ...content,
                name: { ...content.name, en: e.target.value },
              })
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="purpose-bn">{`${t("sop.purpose")} — ${t("sop.bangla")}`}</Label>
          <Input
            id="purpose-bn"
            value={content.purpose.bn}
            onChange={(e) =>
              onChange({
                ...content,
                purpose: { ...content.purpose, bn: e.target.value },
              })
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="times">{t("sop.times")}</Label>
          <Input
            id="times"
            value={scheduleTimes(content).join(", ")}
            placeholder={t("sop.timesHelp")}
            onChange={(e) =>
              onChange(withScheduleTimes(content, splitList(e.target.value)))
            }
          />
        </div>
        <TriggerFields content={content} onChange={onChange} />
        <div className="space-y-1">
          <Label htmlFor="assigned">{t("sop.assignedRole")}</Label>
          <select
            id="assigned"
            value={content.assignedRole}
            onChange={(e) =>
              onChange({
                ...content,
                assignedRole: e.target.value as SopContent["assignedRole"],
              })
            }
            className="bg-background h-9 w-full rounded-md border px-2 text-sm"
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {t(`role.${role}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="checker">{t("sop.checkerRole")}</Label>
          <select
            id="checker"
            value={content.checkerRole ?? ""}
            onChange={(e) =>
              onChange({
                ...content,
                checkerRole: (e.target.value ||
                  null) as SopContent["checkerRole"],
              })
            }
            className="bg-background h-9 w-full rounded-md border px-2 text-sm"
          >
            <option value="">{t("sop.checkerNone")}</option>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {t(`role.${role}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="grace">{t("sop.grace")}</Label>
          <Input
            id="grace"
            type="number"
            min={0}
            value={content.graceMinutes}
            onChange={(e) =>
              onChange({ ...content, graceMinutes: Number(e.target.value) })
            }
          />
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">{t("sop.steps")}</h2>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              onChange({
                ...content,
                steps: [
                  ...content.steps,
                  emptyStep(`step-${content.steps.length + 1}`),
                ],
              })
            }
          >
            {t("sop.addStep")}
          </Button>
        </div>
        {content.steps.map((step, index) => (
          <StepEditor
            key={step.id}
            pens={pens}
            step={step}
            onChange={(next) => setStep(index, next)}
            onRemove={() =>
              onChange({
                ...content,
                steps: content.steps.filter((_, i) => i !== index),
              })
            }
          />
        ))}
      </section>

      {blockers.length > 0 ? (
        <div className="rounded-lg border border-amber-500 p-3 text-sm">
          <p className="font-medium text-amber-400">{t("sop.cannotPublish")}</p>
          <ul className="text-muted-foreground">
            {blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={blockers.length > 0}>
          {canPublish ? t("sop.publish") : t("sop.propose")}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
};

const StepEditor = ({
  step,
  pens,
  onChange,
  onRemove,
}: {
  step: Step;
  /** The Pens a moving Step may walk an animal to — the farm's own, never typed. */
  pens: { id: string; name: string }[];
  onChange: (step: Step) => void;
  onRemove: () => void;
}) => {
  const t = useT();
  const evidence = step.evidence[0] ?? {
    type: "tick" as EvidenceType,
    required: true,
  };

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label
            htmlFor={`${step.id}-text`}
          >{`${t("sop.stepText")} — ${t("sop.bangla")}`}</Label>
          <Input
            id={`${step.id}-text`}
            value={step.text.bn}
            onChange={(e) =>
              onChange({ ...step, text: { ...step.text, bn: e.target.value } })
            }
          />
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
          {t("sop.removeStep")}
        </Button>
      </div>

      <div className="space-y-1">
        <Label htmlFor={`${step.id}-effect`}>{t("sop.effect")}</Label>
        <select
          className="bg-background h-9 w-full rounded-md border px-2 text-sm"
          id={`${step.id}-effect`}
          onChange={(e) =>
            onChange(
              withEffect(step, e.target.value as StepEffect["kind"] | "", pens)
            )
          }
          value={step.effect?.kind ?? ""}
        >
          <option value="">{t("sop.effect.none")}</option>
          {STEP_EFFECT_KINDS.map((kind) => (
            <option
              disabled={kind === "move" && pens.length === 0}
              key={kind}
              value={kind}
            >
              {kind === "move" && pens.length === 0
                ? `${t("sop.effect.move")} — ${t("sop.effect.needsPens")}`
                : t(`sop.effect.${kind}`)}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          checked={step.repeatPerAnimal}
          disabled={Boolean(step.effect)}
          onChange={(e) =>
            onChange({ ...step, repeatPerAnimal: e.target.checked })
          }
          type="checkbox"
        />
        {t("sop.repeatPerAnimal")}
      </label>

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor={`${step.id}-evidence`}>{t("sop.evidence")}</Label>
          <select
            disabled={Boolean(step.effect)}
            id={`${step.id}-evidence`}
            value={evidence.type}
            onChange={(e) =>
              onChange({
                ...step,
                evidence: [
                  { ...evidence, type: e.target.value as EvidenceType },
                ],
              })
            }
            className="bg-background h-9 rounded-md border px-2 text-sm disabled:opacity-60"
          >
            {EVIDENCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`sop.evidence.${type}`)}
              </option>
            ))}
          </select>
        </div>
        {needsChoices(step) ? (
          <div className="flex-1 space-y-1">
            <Label htmlFor={`${step.id}-choices`}>{t("sop.choices")}</Label>
            <Input
              id={`${step.id}-choices`}
              onChange={(e) =>
                onChange({
                  ...step,
                  evidence: [
                    { ...evidence, type: "choice", choices: toChoices(e.target.value) },
                    ...step.evidence.slice(1),
                  ],
                })
              }
              placeholder={t("sop.choicesHelp")}
              value={fromChoices(evidence.choices)}
            />
          </div>
        ) : null}
        {needsUnit(evidence.type) ? (
          <>
            <div className="space-y-1">
              <Label htmlFor={`${step.id}-unit`}>{t("sop.unit")}</Label>
              <Input
                id={`${step.id}-unit`}
                className="w-24"
                value={evidence.unit?.bn ?? ""}
                onChange={(e) =>
                  onChange({
                    ...step,
                    evidence: [{ ...evidence, unit: { bn: e.target.value } }],
                  })
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${step.id}-min`}>{t("sop.min")}</Label>
              <Input
                id={`${step.id}-min`}
                type="number"
                className="w-20"
                value={evidence.min ?? 0}
                onChange={(e) =>
                  onChange({
                    ...step,
                    evidence: [{ ...evidence, min: Number(e.target.value) }],
                  })
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${step.id}-max`}>{t("sop.max")}</Label>
              <Input
                id={`${step.id}-max`}
                type="number"
                className="w-20"
                value={evidence.max ?? 0}
                onChange={(e) =>
                  onChange({
                    ...step,
                    evidence: [{ ...evidence, max: Number(e.target.value) }],
                  })
                }
              />
            </div>
          </>
        ) : null}
      </div>

      {step.repeatPerAnimal ? (
        <div className="space-y-1">
          <Label htmlFor={`${step.id}-skip`}>{t("sop.skipReasons")}</Label>
          <Input
            id={`${step.id}-skip`}
            placeholder={t("sop.skipHelp")}
            value={fromBilingualList(step.skipReasons)}
            onChange={(e) =>
              onChange({
                ...step,
                skipReasons: toBilingualList(e.target.value),
              })
            }
          />
        </div>
      ) : null}
    </div>
  );
};

export const Route = createFileRoute("/_auth/admin/sops")({
  component: SopsPage,
});
