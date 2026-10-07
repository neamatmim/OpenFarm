import type { Step } from "@OpenFarm/domain";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Plus, Trash2 } from "lucide-react";

import { useT } from "@/i18n/language-provider";
import {
  ADDABLE_ANSWERS,
  answersFixed,
  withAnswerAdded,
  withAnswerAt,
  withLabel,
  withoutAnswer,
} from "@/lib/sop-draft";

/**
 * Every answer a Step asks after its first, with its words and whether it must be given: the editor drew only the
 * first, so a service turned milk record still asked for a straw number nobody could see. A note or a photograph may
 * be added — the cash count's figure and note, a tick and a photo — and taken out again; a Step whose effect asks its
 * own answers shows them as they are.
 */
export const StepAnswers = ({
  step,
  onChange,
}: {
  step: Step;
  onChange: (step: Step) => void;
}) => {
  const t = useT();
  const fixed = answersFixed(step);
  const rest = step.evidence.slice(1);
  return (
    <div className="flex flex-col gap-2">
      {rest.length > 0 ? (
        <>
          <h4 className="text-sm font-medium">{t("sop.moreAnswers")}</h4>
          <ul className="flex flex-col gap-2">
            {rest.map((answer, index) => {
              const at = index + 1;
              return (
                <li
                  className="flex flex-wrap items-center gap-3 rounded-md border p-2"
                  key={`${step.id}-answer-${at}`}
                >
                  <span className="text-sm font-medium">
                    {t(`sop.evidence.${answer.type}`)}
                  </span>
                  {fixed ? (
                    <span className="text-muted-foreground min-w-0 flex-1 text-sm">
                      {answer.label?.bn ?? ""}
                    </span>
                  ) : (
                    <Input
                      aria-label={t("sop.answerLabel")}
                      className="min-w-40 flex-1"
                      onChange={(event) =>
                        onChange(
                          withAnswerAt(
                            step,
                            at,
                            withLabel(answer, event.target.value)
                          )
                        )
                      }
                      placeholder={t("sop.answerLabel")}
                      value={answer.label?.bn ?? ""}
                    />
                  )}
                  <label className="inline-flex min-h-11 items-center gap-2 text-sm md:min-h-0">
                    <input
                      checked={answer.required}
                      className="size-4"
                      disabled={fixed}
                      onChange={(event) =>
                        onChange(
                          withAnswerAt(step, at, {
                            ...answer,
                            required: event.target.checked,
                          })
                        )
                      }
                      type="checkbox"
                    />
                    {t("sop.required")}
                  </label>
                  {fixed ? null : (
                    <Button
                      aria-label={t("sop.removeAnswer")}
                      onClick={() => onChange(withoutAnswer(step, at))}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
      {fixed ? null : (
        <div className="flex flex-wrap gap-2">
          {ADDABLE_ANSWERS.map((type) => (
            <Button
              key={type}
              onClick={() => onChange(withAnswerAdded(step, type))}
              size="sm"
              type="button"
              variant="outline"
            >
              <Plus aria-hidden data-icon="inline-start" />
              {t(`sop.addAnswer.${type}`)}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
};
