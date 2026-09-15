import type { DoseRoute } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";

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
}

/** A Prescription as a screen reads it: what was ordered, and how the course is going. */
export interface Course {
  id: string;
  dose: string;
  route: DoseRoute;
  productNameBn: string;
  productNameEn: string | null;
  doses: Dose[];
}

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
    </>
  );
};

/** A dose of a course: due when, and given by whom — or still owed. */
export const DoseLine = ({ dose }: { dose: Dose }) => {
  const t = useT();
  const { language } = useLanguage();
  const what = () => {
    if (dose.givenAt) {
      return t("prescribe.given", { name: dose.givenByName ?? "" });
    }
    if (dose.state === "called_off") {
      return t("prescribe.calledOff");
    }
    return dose.state === "missed"
      ? t("prescribe.missed")
      : t("prescribe.owed");
  };
  return (
    <li className="text-muted-foreground text-xs">
      {formatNumber(dose.number, language)}.{" "}
      {formatDate(new Date(dose.dueAt), language, "dateTime")} · {what()}
    </li>
  );
};
