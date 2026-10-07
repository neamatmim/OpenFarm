import type {
  EvidenceType,
  SopContent,
  Step,
  StepEffect,
} from "@OpenFarm/domain";
import { EVIDENCE_TYPES, STEP_EFFECT_KINDS, maySkip } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { ArrowDown, ArrowUp, ListOrdered, Plus, Trash2 } from "lucide-react";

import { EmptyState, Section } from "@/components/page";
import { FormField, NativeSelect } from "@/components/page-kit";
import { FigureBox } from "@/components/playbook/figure-box";
import { ListInput } from "@/components/playbook/list-input";
import { StepAnswers } from "@/components/playbook/step-answers";
import { StepMeanings } from "@/components/playbook/step-meanings";
import { useLanguage, useT } from "@/i18n/language-provider";
import {
  emptyStep,
  freshStepId,
  fromBilingualList,
  fromChoices,
  needsChoices,
  needsUnit,
  reworded,
  toBilingualList,
  toChoices,
  withFirstEvidence,
  withEffect,
  withProduct,
} from "@/lib/sop-draft";

/** Where a Step stands on the editor's page, for a line that says what is wrong with it to take the Owner there. */
export const stepAnchor = (position: number): string =>
  `sop-step-${position + 1}`;

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
              ...withFirstEvidence(step, {
                ...evidence,
                type: e.target.value as EvidenceType,
              }),
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
          <ListInput
            id={`${step.id}-choices`}
            onTyped={(typed) =>
              onChange(
                withFirstEvidence(step, {
                  ...evidence,
                  type: "choice",
                  choices: toChoices(typed, evidence.choices),
                })
              )
            }
            placeholder={t("sop.choicesHelp")}
            shown={fromChoices(evidence.choices)}
          />
        </FormField>
      ) : null}
      {needsUnit(evidence.type) ? (
        <>
          <FormField id={`${step.id}-unit`} label={t("sop.unit")}>
            <Input
              id={`${step.id}-unit`}
              onChange={(e) =>
                onChange(
                  withFirstEvidence(step, {
                    ...evidence,
                    unit: reworded(evidence.unit, e.target.value),
                  })
                )
              }
              value={evidence.unit?.bn ?? ""}
            />
          </FormField>
          <FormField
            hint={t("sop.noLimit")}
            id={`${step.id}-min`}
            label={t("sop.min")}
          >
            <FigureBox
              id={`${step.id}-min`}
              onFigure={(min) =>
                onChange(withFirstEvidence(step, { ...evidence, min }))
              }
              value={evidence.min}
            />
          </FormField>
          <FormField
            hint={t("sop.noLimit")}
            id={`${step.id}-max`}
            label={t("sop.max")}
          >
            <FigureBox
              id={`${step.id}-max`}
              onFigure={(max) =>
                onChange(withFirstEvidence(step, { ...evidence, max }))
              }
              value={evidence.max}
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
  before,
  position,
  count,
  pens,
  products,
  onChange,
  onMove,
  onRemove,
}: {
  step: Step;
  /** The Step as it was when the editing began, whose meanings are to be kept; none for a Step new in this draft. */
  before: Step | undefined;
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
    <li
      className="surface flex scroll-mt-20 flex-col gap-4 p-4"
      id={stepAnchor(position)}
    >
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
              onChange({ ...step, text: reworded(step.text, e.target.value) })
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
        <StepAnswers onChange={onChange} step={step} />

        {/* A dose or a service may be skipped too, walked or not: its reasons are shown wherever it may be. */}
        {maySkip(step) ? (
          <FormField
            hint={t("sop.skipHelp")}
            id={`${step.id}-skip`}
            label={t("sop.skipReasons")}
          >
            <ListInput
              id={`${step.id}-skip`}
              onTyped={(typed) =>
                onChange({
                  ...step,
                  skipReasons: toBilingualList(typed, step.skipReasons),
                })
              }
              placeholder={t("sop.skipHelp")}
              shown={fromBilingualList(step.skipReasons)}
            />
          </FormField>
        ) : null}
        <StepMeanings before={before} onChange={onChange} step={step} />
      </div>
    </li>
  );
};

/** The Steps in the order they are done: each moved up or down, taken out, or a new one added at the end. */
export const StepsSection = ({
  content,
  startedFrom,
  pens,
  products,
  onChange,
}: {
  content: SopContent;
  /** The procedure as it was when the editing began. */
  startedFrom: SopContent;
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
              before={startedFrom.steps.find((one) => one.id === step.id)}
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
        className="h-12 w-full border-dashed md:h-12"
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
