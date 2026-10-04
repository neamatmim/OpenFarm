import type { MessageKey } from "@OpenFarm/i18n";
import { Link } from "@tanstack/react-router";
import { ChevronRight, ListChecks } from "lucide-react";

import { Notice } from "@/components/page";
import { useT } from "@/i18n/language-provider";

/** One step of setting the farm up, as the server names it. */
type SetupStep =
  | "identity"
  | "registration"
  | "sheds"
  | "people"
  | "shedPhone"
  | "register"
  | "playbook";

/** Each step's words, and the page it is done on. */
const STEP: Record<SetupStep, { words: MessageKey; to: string }> = {
  identity: { words: "setupLeft.step.identity", to: "/farm" },
  registration: { words: "setupLeft.step.registration", to: "/farm" },
  sheds: { words: "setupLeft.step.sheds", to: "/sheds" },
  people: { words: "setupLeft.step.people", to: "/farm/people" },
  shedPhone: { words: "setupLeft.step.shedPhone", to: "/farm/shed-phones" },
  register: { words: "setupLeft.step.register", to: "/sheds" },
  playbook: { words: "setupLeft.step.playbook", to: "/sops" },
};

/**
 * What is left to set the farm up, each step a link to the page it is done on — on the Owner's overview until the farm's
 * records say every one is done. A farm set up this morning opens on empty figures, and the steps were otherwise found
 * by knowing where each lives.
 */
export const SetupLeft = ({ steps }: { steps: readonly string[] }) => {
  const t = useT();
  const known = steps.filter((step): step is SetupStep => step in STEP);
  if (known.length === 0) {
    return null;
  }
  return (
    <Notice icon={ListChecks} title={t("setupLeft.title")} tone="info">
      <p className="text-muted-foreground mb-2 text-sm">
        {t("setupLeft.hint")}
      </p>
      <ul className="flex flex-col gap-1 text-sm">
        {known.map((step) => (
          <li key={step}>
            <Link
              className="text-primary inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
              to={STEP[step].to}
            >
              {t(STEP[step].words)}
              <ChevronRight aria-hidden className="size-4" />
            </Link>
          </li>
        ))}
      </ul>
    </Notice>
  );
};
