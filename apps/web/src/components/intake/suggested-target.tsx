import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";

import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

import type { IntakeFields } from "./intake-fields";

/**
 * What the farm's Rations say the animal being taken in should weigh when her Target Window opens, low and high — asked
 * of the server as soon as she has a weight, because it is the server that saves the low end when nobody types a target
 * of their own. Nothing while she has no weight, or while no Ration says what an animal her weight should gain.
 */
export const useSuggestedTarget = (fields: IntakeFields) => {
  const weightKg = Number(fields.weightKg);
  const input = {
    weightKg,
    sex: fields.sex,
    ...(fields.breedId ? { breedId: fields.breedId } : {}),
    // A Venture's animal is aimed at the Venture's window, which the server knows and the form does not ask.
    ...(fields.ventureId ? { ventureId: fields.ventureId } : {}),
    ...(fields.targetWindowStart && !fields.ventureId
      ? { targetWindowStart: fields.targetWindowStart }
      : {}),
  };
  const suggested = useQuery(
    orpc.intake.suggestTarget.queryOptions({
      input,
      enabled: weightKg > 0,
    })
  );
  return weightKg > 0 ? (suggested.data ?? null) : null;
};

/**
 * The line under the target weight box: what the Rations say, what an empty box will save, and a button to write the
 * low end in — or, where no Ration says, that the farm's own target weight is used.
 */
export const SuggestedTarget = ({
  fields,
  onUse,
}: {
  fields: IntakeFields;
  onUse: (kg: string) => void;
}) => {
  const { t, language } = useLanguage();
  const suggested = useSuggestedTarget(fields);
  if (!suggested) {
    return (
      <p className="text-muted-foreground text-xs">
        {t("intake.targetWeightNote")}
      </p>
    );
  }
  const low = formatNumber(suggested.lowKg, language);
  const typed = Number(fields.targetWeightKg) > 0;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <p className="text-muted-foreground text-xs">
        {t("intake.suggested", {
          low,
          high: formatNumber(suggested.highKg, language),
        })}
        {typed ? "" : ` ${t("intake.suggestedUsed", { kg: low })}`}
      </p>
      {typed ? (
        <Button
          onClick={() => onUse(String(suggested.lowKg))}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Sparkles aria-hidden data-icon="inline-start" />
          {t("intake.useSuggested", { kg: low })}
        </Button>
      ) : null}
    </div>
  );
};
