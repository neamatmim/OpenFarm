import type { MessageKey } from "@OpenFarm/i18n";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight, ListChecks } from "lucide-react";

import { Notice } from "@/components/page";
import { useT } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/** One step of setting the farm up, as the server names it. */
type SetupStep =
  | "identity"
  | "registration"
  | "manager"
  | "vet"
  | "vetDays"
  | "sheds"
  | "people"
  | "shedPhone"
  | "backup"
  | "register"
  | "playbook";

/** Whose a step is: the Owner's or the Manager's alike, the Owner's alone, or the Vet's. */
type Whose = "either" | "owner" | "vet";

/** Each step's words, the page it is done on, and whose it is to do. */
const STEP: Record<SetupStep, { words: MessageKey; to: string; whose: Whose }> =
  {
    identity: {
      words: "setupLeft.step.identity",
      to: "/farm",
      whose: "either",
    },
    registration: {
      words: "setupLeft.step.registration",
      to: "/farm",
      whose: "either",
    },
    manager: {
      words: "setupLeft.step.manager",
      to: "/farm/people",
      whose: "owner",
    },
    vet: { words: "setupLeft.step.vet", to: "/farm/people", whose: "owner" },
    vetDays: { words: "setupLeft.step.vetDays", to: "/drugs", whose: "vet" },
    sheds: { words: "setupLeft.step.sheds", to: "/sheds", whose: "either" },
    people: {
      words: "setupLeft.step.people",
      to: "/farm/people",
      whose: "either",
    },
    shedPhone: {
      words: "setupLeft.step.shedPhone",
      to: "/farm/shed-phones",
      whose: "either",
    },
    backup: {
      words: "setupLeft.step.backup",
      to: "/farm/backups",
      whose: "owner",
    },
    register: {
      words: "setupLeft.step.register",
      to: "/farm/going-live",
      whose: "either",
    },
    playbook: { words: "setupLeft.step.playbook", to: "/sops", whose: "owner" },
  };

const WHOSE_WORDS: Record<Exclude<Whose, "either">, MessageKey> = {
  owner: "setupLeft.whose.owner",
  vet: "setupLeft.whose.vet",
};

/** Whether the reader is the one to do a step: the Owner opens every step, the Manager the steps that are theirs too. */
const forTheReader = (whose: Whose, reader: "owner" | "manager") =>
  reader === "owner" || whose === "either";

/**
 * What is left to set the farm up, each step a link to the page it is done on — on the Owner's overview and the
 * Manager's day, until the farm's records say every one is done. A step that is somebody else's says whose, rather
 * than leading the Manager to a page that would refuse them; the last line leads to everything left before going live.
 */
export const SetupLeft = ({ reader }: { reader: "owner" | "manager" }) => {
  const t = useT();
  const live = useQuery(orpc.goingLive.get.queryOptions());
  // Missing from an answer kept from before the farm said what was left.
  const steps = live.data?.left ?? [];
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
        {known.map((step) => {
          const { words, to, whose } = STEP[step];
          return (
            <li key={step}>
              {forTheReader(whose, reader) ? (
                <Link
                  className="text-primary inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
                  to={to}
                >
                  {t(words)}
                  <ChevronRight aria-hidden className="size-4" />
                </Link>
              ) : (
                <span className="text-foreground/80">{t(words)}</span>
              )}
              {whose === "either" ? null : (
                <span className="text-muted-foreground ms-2 text-xs">
                  {t(WHOSE_WORDS[whose])}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <Link
        className="text-primary mt-3 inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
        to="/farm/going-live"
      >
        {t("setupLeft.all")}
        <ChevronRight aria-hidden className="size-4" />
      </Link>
    </Notice>
  );
};
