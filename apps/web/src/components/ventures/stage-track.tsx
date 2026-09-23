import { cn } from "@OpenFarm/ui/lib/utils";
import { Check, XCircle } from "lucide-react";

import { useLanguage } from "@/i18n/language-provider";
import type { Venture } from "@/lib/ventures";

/** The road a Venture takes, in order. Called off is not on it: it is where a run leaves the road. */
const STAGES = ["open", "buying", "fattening", "selling", "settled"] as const;

/**
 * Where one Venture is on its road: the stages behind it ticked, the one it is on marked, the rest ahead.
 *
 * A run called off is drawn as far as it got — it can only ever have been Open — and then the stage it
 * ended on, so the track says both how far it went and that it stopped.
 */
export const StageTrack = ({ state }: { state: Venture["state"] }) => {
  const { t } = useLanguage();
  const calledOff = state === "cancelled";
  const here = calledOff ? 0 : STAGES.indexOf(state);
  const shown = calledOff ? STAGES.slice(0, 1) : STAGES;
  return (
    <ol
      aria-label={t("ventures.stages")}
      className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm"
    >
      {shown.map((stage, at) => {
        const passed = calledOff || at < here;
        const current = !calledOff && at === here;
        return (
          <li className="flex items-center gap-1" key={stage}>
            {at === 0 ? null : (
              <span aria-hidden className="bg-border mx-1 h-px w-4 sm:w-8" />
            )}
            <span
              aria-current={current ? "step" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1",
                current &&
                  "border-primary bg-primary text-primary-foreground font-medium",
                passed && "text-foreground",
                !(current || passed) && "text-muted-foreground border-dashed"
              )}
            >
              {passed ? (
                <Check aria-hidden className="text-success size-3.5" />
              ) : null}
              {t(`ventures.state.${stage}`)}
            </span>
          </li>
        );
      })}
      {calledOff ? (
        <li className="flex items-center gap-1">
          <span aria-hidden className="bg-border mx-1 h-px w-4 sm:w-8" />
          <span
            aria-current="step"
            className="border-danger/40 text-danger flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium"
          >
            <XCircle aria-hidden className="size-3.5" />
            {t("ventures.state.cancelled")}
          </span>
        </li>
      ) : null}
    </ol>
  );
};
