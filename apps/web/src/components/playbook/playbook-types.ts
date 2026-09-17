import type { SopContent } from "@OpenFarm/domain";

import type { useLanguage } from "@/i18n/language-provider";
import {
  happeningTriggers,
  scheduleEveryOtherWeek,
  scheduleTimes,
  scheduleWeekdays,
} from "@/lib/sop-draft";
import type { HappeningTrigger } from "@/lib/sop-draft";
import type { orpc } from "@/utils/orpc";

/** A procedure in the Playbook, with the Version in force. */
export type Sop = Awaited<ReturnType<typeof orpc.sops.list.call>>[number];

/** A change somebody proposed to a procedure, waiting for the Owner. */
export type Proposal = Awaited<
  ReturnType<typeof orpc.sops.proposals.call>
>[number];

type Translate = ReturnType<typeof useLanguage>["t"];

/** What a procedure's Version in force says, where it has one. */
export const contentOf = (sop: Sop): SopContent | undefined =>
  sop.currentVersion?.content as SopContent | undefined;

/** Nothing raises it — no time of day and nothing that happens — so the Manager raises it the day the farm does it. */
export const raisedByHand = (content: SopContent): boolean =>
  scheduleTimes(content).length === 0 &&
  happeningTriggers(content).length === 0;

/** A thing that happens, in the farm's words for it. */
const happeningWord = (happening: HappeningTrigger, t: Translate): string => {
  switch (happening.kind) {
    case "event": {
      return t(`event.${happening.event}`);
    }
    case "state": {
      return t(`state.${happening.state}`);
    }
    case "prescription": {
      return t("sop.trigger.prescription");
    }
    case "notifiable_disease": {
      return t("sop.trigger.notifiable");
    }
    case "before_calving": {
      return t(`calvingLead.${happening.lead}`);
    }
    default: {
      return t("sop.trigger.registrationRenewal");
    }
  }
};

/**
 * When a procedure's work comes up, in a few words each: its times of day with the days they fall on, and each thing
 * that happens that raises it. Nothing at all is work raised by hand.
 */
export const whenWords = (content: SopContent, t: Translate): string[] => {
  const words: string[] = [];
  const times = scheduleTimes(content);
  if (times.length > 0) {
    const days = scheduleWeekdays(content)
      .map((day) => t(`sop.weekday.${day}` as "sop.weekday.0"))
      .join(", ");
    const fortnightly = scheduleEveryOtherWeek(content)
      ? ` · ${t("sop.everyOtherWeek")}`
      : "";
    words.push(
      days ? `${times.join(", ")} · ${days}${fortnightly}` : times.join(", ")
    );
  }
  for (const happening of happeningTriggers(content)) {
    words.push(happeningWord(happening, t));
  }
  return words;
};
