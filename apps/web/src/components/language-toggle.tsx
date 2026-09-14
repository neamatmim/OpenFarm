import { Button } from "@OpenFarm/ui/components/button";

import { useLanguage } from "@/i18n/language-provider";

/** Flips between Bangla and English. Persisted on the user when signed in. */
const LanguageToggle = () => {
  const { language, setLanguage, t } = useLanguage();
  const next = language === "bn" ? "en" : "bn";

  return (
    <Button
      // As wide in one language as the other, so the bar does not shift when it is pressed.
      className="w-24"
      variant="ghost"
      aria-label={t("language.switch")}
      title={t("language.switch")}
      onClick={() => setLanguage(next)}
    >
      {t(next === "bn" ? "language.bn" : "language.en")}
    </Button>
  );
};

export default LanguageToggle;
