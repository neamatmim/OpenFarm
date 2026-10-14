import { bodyConditionWords } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import type { Language } from "@OpenFarm/i18n";
import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";

import type { AnimalDetail } from "@/components/animal/animal-types";
import { RecordList, RecordRow, Section } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { conditionChange } from "@/lib/body-condition";

/** One judgment of her Body Condition, as her page is told it. */
type Reading = AnimalDetail["bodyCondition"][number];
/** Her latest, as a list of animals is told it beside each. */
type Latest = Pick<Reading, "score" | "judgedAt">;

/** The score in the reader's words, the scale's own — "3 — moderate" — as the phone that asked it said them. */
const scoreWords = (score: Reading["score"], language: Language): string =>
  bodyConditionWords(score)[language];

/** The day she was judged. */
const dayJudged = (reading: Latest, language: Language): string =>
  formatDate(new Date(reading.judgedAt), language, "date");

/** The procedure that asked it, in the reader's language where the farm wrote it in theirs. */
const procedureWords = (
  procedure: Reading["procedure"],
  language: Language
): string => (language === "en" && procedure.en ? procedure.en : procedure.bn);

const CHANGE_ICON = { up: ArrowUp, down: ArrowDown, same: ArrowRight };

/**
 * Her latest Body Condition with the day it was judged, and whether she has put flesh on or lost it since the judgment
 * before: one fact of her overview. Nothing where nobody has judged her.
 */
export const LatestBodyCondition = ({
  readings,
}: {
  /** Latest first. Missing from an answer this phone kept from before her page said them. */
  readings: readonly Reading[] | undefined;
}) => {
  const { t, language } = useLanguage();
  const [latest, before] = readings ?? [];
  if (!latest) {
    return null;
  }
  const change = conditionChange(readings);
  const Icon = change ? CHANGE_ICON[change] : null;
  return (
    <span className="flex flex-col gap-0.5">
      <span>
        {scoreWords(latest.score, language)}
        <span className="text-muted-foreground font-normal">
          {` · ${dayJudged(latest, language)}`}
        </span>
      </span>
      {change && Icon && before ? (
        <span className="text-muted-foreground inline-flex items-center gap-1 text-xs font-normal">
          <Icon aria-hidden className="size-3" />
          {change === "same"
            ? t("bodyCondition.same")
            : t(change === "up" ? "bodyCondition.up" : "bodyCondition.down", {
                score: formatNumber(before.score, language),
              })}
        </span>
      ) : null}
    </span>
  );
};

/** Each judgment of her Body Condition, the latest first, with the day and the procedure that asked it. */
export const BodyConditionReadings = ({
  readings,
}: {
  readings: readonly Reading[] | undefined;
}) => {
  const { t, language } = useLanguage();
  if (!readings || readings.length === 0) {
    return null;
  }
  return (
    <Section
      description={t("bodyCondition.hint")}
      title={t("bodyCondition.title")}
    >
      <RecordList>
        {readings.map((reading) => (
          <RecordRow
            key={`${String(reading.judgedAt)}-${reading.score}`}
            meta={`${dayJudged(reading, language)} · ${procedureWords(
              reading.procedure,
              language
            )}`}
            title={scoreWords(reading.score, language)}
          />
        ))}
      </RecordList>
    </Section>
  );
};

/** An animal's latest Body Condition as one small line beside her in a list: "Condition 3 · 16 Feb". Nothing where
 *  nobody has judged her. */
export const BodyConditionLine = ({
  reading,
}: {
  /** Missing from an answer this phone kept from before the list said it. */
  reading: Latest | null | undefined;
}) => {
  const { t, language } = useLanguage();
  if (!reading) {
    return null;
  }
  return (
    <span className="text-muted-foreground text-xs whitespace-nowrap">
      {`${t("bodyCondition.short", {
        score: formatNumber(reading.score, language),
      })} · ${dayJudged(reading, language)}`}
    </span>
  );
};
