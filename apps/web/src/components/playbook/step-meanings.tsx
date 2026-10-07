import type { SkipMeaning, Step } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { Badge } from "@OpenFarm/ui/components/badge";
import { Button } from "@OpenFarm/ui/components/button";
import { useState } from "react";

import { Notice } from "@/components/page";
import { NativeSelect } from "@/components/page-kit";
import { useT } from "@/i18n/language-provider";
import type { ChoiceMeaning, LostMeaning } from "@/lib/sop-meanings";
import {
  choiceMeaningOf,
  lostMeaningsOf,
  takersOf,
  withMeaningGiven,
} from "@/lib/sop-meanings";

/** What each meaning the farm acts on does, in the Owner's words. */
const MEANING_WORDS: Record<ChoiceMeaning | SkipMeaning, MessageKey> = {
  heat: "sop.meaning.heat",
  urgent: "sop.meaning.urgent",
  not_found: "sop.meaning.notFound",
  unwell: "sop.meaning.unwell",
  nothing_to_note: "sop.meaning.nothingToNote",
};

/** One meaning left behind, and the new words it may be given to — the Owner saying they are the same thing. */
const LostOne = ({
  before,
  step,
  lost,
  onChange,
}: {
  before: Step | undefined;
  step: Step;
  lost: LostMeaning;
  onChange: (step: Step) => void;
}) => {
  const t = useT();
  const takers = takersOf(before, step, lost);
  const [chosen, setChosen] = useState("");
  const index = takers.find((one) => String(one.index) === chosen)?.index;
  return (
    <Notice
      title={t("sop.meaningLost", {
        was: lost.was.bn,
        means: t(MEANING_WORDS[lost.means]),
      })}
      tone="warning"
    >
      {takers.length === 0 ? (
        <p>{t("sop.meaningLostWrite")}</p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <NativeSelect
            aria-label={t("sop.meaningGiveTo")}
            className="w-auto"
            onChange={(event) => setChosen(event.target.value)}
            value={chosen}
          >
            <option value="">{t("sop.meaningGiveTo")}</option>
            {takers.map((one) => (
              <option key={one.index} value={String(one.index)}>
                {one.words.bn}
              </option>
            ))}
          </NativeSelect>
          <Button
            disabled={index === undefined}
            onClick={() => {
              if (index !== undefined) {
                onChange(withMeaningGiven(step, lost, index));
                setChosen("");
              }
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("sop.meaningGive")}
          </Button>
        </div>
      )}
    </Notice>
  );
};

/**
 * What the Step's choices and skip reasons mean to the farm, beside their words — "গরম হয়েছে → the breeding work" —
 * and any meaning it had when the editing began that nothing on it holds now, to be given back to new words. A typo
 * fixed in "পশু পাওয়া যায়নি" stopped the round opening Missing, and nothing on the screen said so.
 */
export const StepMeanings = ({
  before,
  step,
  onChange,
}: {
  before: Step | undefined;
  step: Step;
  onChange: (step: Step) => void;
}) => {
  const t = useT();
  const held = [
    ...(step.evidence[0]?.choices ?? []).flatMap((choice) => {
      const means = choiceMeaningOf(step, choice.value);
      return means ? [{ words: choice.label.bn, means }] : [];
    }),
    ...step.skipReasons.flatMap((reason) =>
      reason.means ? [{ words: reason.bn, means: reason.means }] : []
    ),
  ];
  const lost = lostMeaningsOf(before, step);
  if (held.length === 0 && lost.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2">
      {held.length > 0 ? (
        <ul aria-label={t("sop.meanings")} className="flex flex-wrap gap-1.5">
          {held.map((one) => (
            <li key={`${one.means}-${one.words}`}>
              <Badge variant="outline">
                {one.words} → {t(MEANING_WORDS[one.means])}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
      {lost.map((one) => (
        <LostOne
          before={before}
          key={`${one.kind}-${one.means}-${one.was.bn}`}
          lost={one}
          onChange={onChange}
          step={step}
        />
      ))}
    </div>
  );
};
