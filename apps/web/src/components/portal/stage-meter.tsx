import { formatNumber } from "@OpenFarm/i18n";
import { cn } from "@OpenFarm/ui/lib/utils";

import { useLanguage } from "@/i18n/language-provider";
import type { Venture } from "@/lib/ventures";

/** The road a Venture takes, in order, as the full stage track has it. */
const STAGES = ["open", "buying", "fattening", "selling", "settled"] as const;

/**
 * How far along its road a Venture is, small enough for a card: five steps, those behind it and the one it is on
 * filled, and in words which step of five it is. A Venture called off says so rather than showing a road it left.
 */
export const StageMeter = ({ state }: { state: Venture["state"] }) => {
  const { t, language } = useLanguage();
  const calledOff = state === "cancelled";
  const here = calledOff ? -1 : STAGES.indexOf(state);
  const said = calledOff
    ? t("ventures.state.cancelled")
    : t("portal.stageOf", {
        at: formatNumber(here + 1, language),
        of: formatNumber(STAGES.length, language),
        stage: t(`ventures.state.${state}`),
      });
  return (
    <div className="flex flex-col gap-1.5">
      <div aria-hidden className="flex gap-1">
        {STAGES.map((stage, at) => (
          <span
            className={cn(
              "h-1.5 flex-1 rounded-full",
              at <= here ? "bg-primary" : "bg-muted",
              calledOff && "bg-danger/30"
            )}
            key={stage}
          />
        ))}
      </div>
      <span
        className={cn(
          "text-xs",
          calledOff ? "text-danger" : "text-muted-foreground"
        )}
      >
        {said}
      </span>
    </div>
  );
};
