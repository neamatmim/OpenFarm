import type { BodyConditionScore } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import type { Language } from "@OpenFarm/i18n";
import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";

import { RecordList, RecordRow, Section } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { conditionChange } from "@/lib/body-condition";

/** One judgment of her Body Condition, as her page and the board are told it. */
interface Reading {
  score: BodyConditionScore;
  judgedAt: Date | string;
  procedure?: { bn: string; en?: string };
}

/** The score in the reader's words: "3 — moderate". */
const ScoreWords = ({ score }: { score: BodyConditionScore }) => {
  const { t } = useLanguage();
  return <>{t(`bodyCondition.score.${score}`)}</>;
};

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
        <ScoreWords score={latest.score} />
        <span className="text-muted-foreground font-normal">
          {" · "}
          {formatDate(new Date(latest.judgedAt), language, "date")}
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

/** The procedure that asked it, in the reader's language where the farm wrote it in theirs. */
const procedureWords = (
  procedure: Reading["procedure"],
  language: Language
): string | null => {
  if (!procedure) {
    return null;
  }
  return language === "en" && procedure.en ? procedure.en : procedure.bn;
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
        {readings.map((reading) => {
          const procedure = procedureWords(reading.procedure, language);
          const day = formatDate(new Date(reading.judgedAt), language, "date");
          return (
            <RecordRow
              key={`${String(reading.judgedAt)}-${reading.score}`}
              meta={procedure ? `${day} · ${procedure}` : day}
              title={<ScoreWords score={reading.score} />}
            />
          );
        })}
      </RecordList>
    </Section>
  );
};

/** Her latest Body Condition as one small line under her weight on the Fattening board: "Condition 3 · 16 Feb". */
export const BoardBodyCondition = ({
  reading,
}: {
  /** Missing from an answer this phone kept from before the board said it. */
  reading: Reading | null | undefined;
}) => {
  const { t, language } = useLanguage();
  if (!reading) {
    return null;
  }
  return (
    <span className="text-muted-foreground text-xs whitespace-nowrap">
      {`${t("bodyCondition.short", {
        score: formatNumber(reading.score, language),
      })} · ${formatDate(new Date(reading.judgedAt), language, "date")}`}
    </span>
  );
};
