import type { MessageKey, MessageParams } from "@OpenFarm/i18n";

type Translate = (key: MessageKey, params?: MessageParams) => string;

const STEP = /^steps\[(?<index>\d+)\]/u;

/** Where in the procedure a problem is, as the editor names its parts: a Step by its number, the trigger, the name. */
const whereOf = (path: string, t: Translate): string => {
  const step = STEP.exec(path)?.groups?.index;
  if (step !== undefined) {
    return t("sop.stepNumber", { number: Number(step) + 1 });
  }
  if (path.startsWith("triggers")) {
    return t("sop.triggers");
  }
  if (path.startsWith("name")) {
    return t("sop.name");
  }
  if (path.startsWith("purpose")) {
    return t("sop.purpose");
  }
  if (path === "assignedRole" || path === "checkerRole") {
    return t("sop.assignedRole");
  }
  return t("sop.blocker.whole");
};

/**
 * What stops a procedure being published, as the editor says it: where it is and what to do, in the reader's words —
 * the problems the farm finds are written for developers, a path and English, and were shown on a Bangla page as they
 * came. Missing Bangla and no steps at all are said as what to do; anything else as where it is.
 */
export const blockerSaid = (blocker: string, t: Translate): string => {
  const [path = "", ...rest] = blocker.split(": ");
  const problem = rest.join(": ");
  if (problem === "Bangla is required") {
    return t("sop.blocker.bangla", { where: whereOf(path, t) });
  }
  if (path === "steps") {
    return t("sop.blocker.noSteps");
  }
  return t("sop.blocker.other", { where: whereOf(path, t) });
};
