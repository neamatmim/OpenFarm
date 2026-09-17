import type {
  EvidenceType,
  SopContent,
  Step,
  StepEffect,
} from "@OpenFarm/domain";
import { EVIDENCE_TYPES, STEP_EFFECT_KINDS } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { ArrowDown, ArrowUp, ListOrdered, Plus, Trash2 } from "lucide-react";

import { EmptyState, Section } from "@/components/page";
import { FormField, NativeSelect } from "@/components/page-kit";
import { useLanguage, useT } from "@/i18n/language-provider";
import {
  emptyStep,
  fromBilingualList,
  fromChoices,
  needsChoices,
  needsUnit,
  toBilingualList,
  toChoices,
  withEffect,
  withProduct,
} from "@/lib/sop-draft";

/** A Pen a moving Step may walk an animal to, and a product a campaign may give. */
interface Pen {
  id: string;
  name: string;
}
interface Product {
  id: string;
  name: string;
  vaccine: boolean;
}

/** What a Step records, and for a number its unit and range, or for a choice what may be chosen. */
const EvidenceFields = ({
  step,
  onChange,
}: {
  step: Step;
  onChange: (step: Step) => void;
}) => {
  const t = useT();
  const evidence = step.evidence[0] ?? {
    type: "tick" as EvidenceType,
    required: true,
  };
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <FormField id={`${step.id}-evidence`} label={t("sop.evidence")}>
        <NativeSelect
          disabled={Boolean(step.effect)}
          id={`${step.id}-evidence`}
          onChange={(e) =>
            onChange({
              ...step,
              evidence: [{ ...evidence, type: e.target.value as EvidenceType }],
            })
          }
          value={evidence.type}
        >
          {EVIDENCE_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`sop.evidence.${type}`)}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      {needsChoices(step) ? (
        <FormField
          className="sm:col-span-1 lg:col-span-3"
          hint={t("sop.choicesHelp")}
          id={`${step.id}-choices`}
          label={t("sop.choices")}
        >
          <Input
            id={`${step.id}-choices`}
            onChange={(e) =>
              onChange({
                ...step,
                evidence: [
                  {
                    ...evidence,
                    type: "choice",
                    choices: toChoices(e.target.value, evidence.choices),
                  },
                ],
              })
            }
            placeholder={t("sop.choicesHelp")}
            value={fromChoices(evidence.choices)}
          />
        </FormField>
      ) : null}
      {needsUnit(evidence.type) ? (
        <>
          <FormField id={`${step.id}-unit`} label={t("sop.unit")}>
            <Input
              id={`${step.id}-unit`}
              onChange={(e) =>
                onChange({
                  ...step,
                  evidence: [{ ...evidence, unit: { bn: e.target.value } }],
                })
              }
              value={evidence.unit?.bn ?? ""}
            />
          </FormField>
          <FormField id={`${step.id}-min`} label={t("sop.min")}>
            <Input
              id={`${step.id}-min`}
              onChange={(e) =>
                onChange({
                  ...step,
                  evidence: [{ ...evidence, min: Number(e.target.value) }],
                })
              }
              type="number"
              value={evidence.min ?? 0}
            />
          </FormField>
          <FormField id={`${step.id}-max`} label={t("sop.max")}>
            <Input
              id={`${step.id}-max`}
              onChange={(e) =>
                onChange({
                  ...step,
                  evidence: [{ ...evidence, max: Number(e.target.value) }],
                })
              }
              type="number"
              value={evidence.max ?? 0}
            />
          </FormField>
        </>
      ) : null}
    </div>
  );
};

/** What a Step writes into the farm's records besides its evidence, and for a dose, which product. */
const EffectFields = ({
  step,
  pens,
  products,
  onChange,
}: {
  step: Step;
  pens: Pen[];
  products: Product[];
  onChange: (step: Step) => void;
}) => {
  const t = useT();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField id={`${step.id}-effect`} label={t("sop.effect")}>
        <NativeSelect
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
        </NativeSelect>
      </FormField>
      {step.effect?.kind === "treatment" ? (
        <FormField id={`${step.id}-product`} label={t("sop.effect.product")}>
          <NativeSelect
            id={`${step.id}-product`}
            onChange={(e) =>
              onChange(
                withProduct(
                  step,
                  products.find((product) => product.id === e.target.value) ??
                    null
                )
              )
            }
            value={step.effect.productId ?? ""}
          >
            {/* Blank is the farm's one Treatment procedure, whose doses a Prescription names
                one at a time. Anything else is a campaign over a Pen. */}
            <option value="">{t("sop.effect.prescriptionNames")}</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      ) : null}
    </div>
  );
};

/** One Step in its place in the order: what to do, what it records, and the way to move it up, down or out. */
const StepEditor = ({
  step,
  position,
  count,
  pens,
  products,
  onChange,
  onMove,
  onRemove,
}: {
  step: Step;
  position: number;
  count: number;
  /** The Pens a moving Step may walk an animal to — the farm's own, never typed. */
  pens: Pen[];
  products: Product[];
  onChange: (step: Step) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) => {
  const { t, language } = useLanguage();
  return (
    <li className="bg-card flex flex-col gap-4 rounded-xl border p-4">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="bg-primary text-primary-foreground grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold tabular-nums"
        >
          {formatNumber(position + 1, language)}
        </span>
        <h3 className="min-w-0 flex-1 font-semibold">
          {t("sop.stepNumber", { number: position + 1 })}
        </h3>
        <div className="flex shrink-0 gap-0.5">
          <Button
            aria-label={t("sop.moveUp")}
            disabled={position === 0}
            onClick={() => onMove(-1)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ArrowUp aria-hidden />
          </Button>
          <Button
            aria-label={t("sop.moveDown")}
            disabled={position === count - 1}
            onClick={() => onMove(1)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ArrowDown aria-hidden />
          </Button>
          <Button
            aria-label={t("sop.removeStepNumber", { number: position + 1 })}
            className="text-danger"
            onClick={onRemove}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 md:pl-11">
        <FormField
          id={`${step.id}-text`}
          label={`${t("sop.stepText")} — ${t("sop.bangla")}`}
        >
          <Input
            id={`${step.id}-text`}
            onChange={(e) =>
              onChange({ ...step, text: { ...step.text, bn: e.target.value } })
            }
            value={step.text.bn}
          />
        </FormField>
        <EffectFields
          onChange={onChange}
          pens={pens}
          products={products}
          step={step}
        />

        <label className="inline-flex min-h-11 items-center gap-2 self-start text-sm md:min-h-0">
          <input
            checked={step.repeatPerAnimal}
            className="size-4"
            disabled={Boolean(step.effect)}
            onChange={(e) =>
              onChange({ ...step, repeatPerAnimal: e.target.checked })
            }
            type="checkbox"
          />
          {t("sop.repeatPerAnimal")}
        </label>

        <EvidenceFields onChange={onChange} step={step} />

        {step.repeatPerAnimal ? (
          <FormField
            hint={t("sop.skipHelp")}
            id={`${step.id}-skip`}
            label={t("sop.skipReasons")}
          >
            <Input
              id={`${step.id}-skip`}
              onChange={(e) =>
                onChange({
                  ...step,
                  skipReasons: toBilingualList(e.target.value),
                })
              }
              placeholder={t("sop.skipHelp")}
              value={fromBilingualList(step.skipReasons)}
            />
          </FormField>
        ) : null}
      </div>
    </li>
  );
};

/** A name for a new Step no Step in the procedure already has, so two Steps are never taken for one. */
const freshStepId = (steps: Step[]): string => {
  const taken = new Set(steps.map((step) => step.id));
  let number = steps.length + 1;
  while (taken.has(`step-${number}`)) {
    number += 1;
  }
  return `step-${number}`;
};

/** The Steps in the order they are done: each moved up or down, taken out, or a new one added at the end. */
export const StepsSection = ({
  content,
  pens,
  products,
  onChange,
}: {
  content: SopContent;
  pens: Pen[];
  products: Product[];
  onChange: (content: SopContent) => void;
}) => {
  const { t, language } = useLanguage();
  const { steps } = content;
  const setStep = (index: number, step: Step) =>
    onChange({
      ...content,
      steps: steps.map((current, at) => (at === index ? step : current)),
    });
  const move = (index: number, by: -1 | 1) => {
    const next = [...steps];
    const [moved] = next.splice(index, 1);
    next.splice(index + by, 0, moved);
    onChange({ ...content, steps: next });
  };
  const add = () =>
    onChange({ ...content, steps: [...steps, emptyStep(freshStepId(steps))] });

  return (
    <Section
      action={
        <span className="text-muted-foreground text-sm tabular-nums">
          {formatNumber(steps.length, language)} {t("sop.steps")}
        </span>
      }
      description={t("sop.editor.stepsHint")}
      id="sop-steps"
      plain
      title={t("sop.steps")}
    >
      {steps.length === 0 ? (
        <EmptyState icon={ListOrdered} title={t("sop.editor.noSteps")} />
      ) : (
        <ol className="flex flex-col gap-3">
          {steps.map((step, index) => (
            <StepEditor
              count={steps.length}
              key={step.id}
              onChange={(next) => setStep(index, next)}
              onMove={(by) => move(index, by)}
              onRemove={() =>
                onChange({
                  ...content,
                  steps: steps.filter((_, at) => at !== index),
                })
              }
              pens={pens}
              position={index}
              products={products}
              step={step}
            />
          ))}
        </ol>
      )}
      <Button
        className="h-12 w-full border-dashed"
        onClick={add}
        type="button"
        variant="outline"
      >
        <Plus aria-hidden data-icon="inline-start" />
        {t("sop.addStep")}
      </Button>
    </Section>
  );
};
