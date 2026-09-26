import { formatDate } from "@OpenFarm/i18n";

import { useLanguage } from "@/i18n/language-provider";

/**
 * When the figures on a portal page were read from the farm, on the farm's clock: an answer this phone kept, or one
 * read before the farm last weighed, is older than it looks, and an Investor is owed the age of what they are reading.
 * Nothing while there is no answer yet.
 */
export const FiguresAsAt = ({
  readAt,
}: {
  /** When the page's answer came back, in milliseconds (a query's `dataUpdatedAt`); 0 for none yet. */
  readAt: number;
}) => {
  const { t, language } = useLanguage();
  if (readAt === 0) {
    return null;
  }
  return (
    <span>
      {t("portal.figuresAsAt", {
        time: formatDate(new Date(readAt), language, "dateTime"),
      })}
    </span>
  );
};
