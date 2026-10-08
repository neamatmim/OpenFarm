import type { DoseRoute } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";

import type { Tone } from "@/components/page";
import { StatusBadge } from "@/components/page";
import { useLanguage, useT } from "@/i18n/language-provider";

/** One dose of a Prescription, as a screen reads it. */
export interface Dose {
  id: string;
  number: number;
  dueAt: Date;
  givenAt: Date | null;
  givenByName: string | null;
  /** The state of the work raised for it, so a dose nobody gave can say so. */
  state: string;
  /** Why it was not given, for a dose skipped. Missing from an answer cached before the farm said it. */
  skippedBecause?: string | null;
}

/** A Prescription as a screen reads it: what was ordered, and how the course is going. */
export interface Course {
  id: string;
  dose: string;
  route: DoseRoute;
  productNameBn: string;
  productNameEn: string | null;
  doses: Dose[];
  /** When the Vet gave the course up and why; missing from an answer cached before the farm said it. */
  stopped?: { reason: string | null } | null;
}

/** Whether a dose is still to be given: not given, not skipped, and its work neither called off nor missed. */
export const stillOwed = (dose: Dose) =>
  dose.givenAt === null &&
  !dose.skippedBecause &&
  dose.state !== "called_off" &&
  dose.state !== "missed";

/** The product in the reader's language — the label is in Bangla, so that is what is kept. */
const productName = (course: Course, english: boolean) =>
  english && course.productNameEn ? course.productNameEn : course.productNameBn;

/**
 * What was ordered and how far it has got: "Oxytetracycline · 10 ml · intramuscular · 3 of 6
 * given". Shared by the Vet's own screen and the animal's page, because it is the same
 * sentence about the same course and it should not read two ways.
 */
export const CourseLine = ({ course }: { course: Course }) => {
  const t = useT();
  const { language } = useLanguage();
  const given = course.doses.filter((one) => one.givenAt !== null).length;
  return (
    <>
      {productName(course, language === "en")} · {course.dose} ·{" "}
      {t(`route.${course.route}`)} ·{" "}
      {t("prescribe.progress", {
        given: formatNumber(given, language),
        of: formatNumber(course.doses.length, language),
      })}
      {course.stopped ? ` · ${t("prescribe.stopped")}` : null}
    </>
  );
};

/** A dose of a course: due when, and given by whom — or still owed — as a word with its color. */
export const DoseLine = ({ dose }: { dose: Dose }) => {
  const t = useT();
  const { language } = useLanguage();
  const standing = (): { tone: Tone; word: string } => {
    if (dose.givenAt) {
      return {
        tone: "success",
        word: t("prescribe.given", { name: dose.givenByName ?? "" }),
      };
    }
    // Skipped, its work closes as done; said as skipped and why, so the Vet can prescribe again.
    if (dose.skippedBecause) {
      return {
        tone: "warning",
        word: t("prescribe.skipped", { reason: dose.skippedBecause }),
      };
    }
    if (dose.state === "called_off") {
      return { tone: "neutral", word: t("prescribe.calledOff") };
    }
    return dose.state === "missed"
      ? { tone: "danger", word: t("prescribe.missed") }
      : { tone: "info", word: t("prescribe.owed") };
  };
  const { tone, word } = standing();
  return (
    <li className="text-muted-foreground flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
      <span className="tabular-nums">
        {formatNumber(dose.number, language)}.{" "}
        {formatDate(new Date(dose.dueAt), language, "dateTime")}
      </span>
      <StatusBadge tone={tone}>{word}</StatusBadge>
    </li>
  );
};
