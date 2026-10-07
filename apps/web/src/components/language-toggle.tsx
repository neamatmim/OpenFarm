import { Button } from "@OpenFarm/ui/components/button";

import { useLanguage } from "@/i18n/language-provider";

/** Flips between Bangla and English. Persisted on the user when signed in. Its name is the word on it, in that word's
 *  own language, so a voice saying "English" presses it and a screen reader says it rightly (WCAG 2.5.3, 3.1.2);
 *  what it does is its description. */
const LanguageToggle = () => {
  const { language, setLanguage, t } = useLanguage();
  const next = language === "bn" ? "en" : "bn";

  return (
    <Button
      // As wide in one language as the other, so the bar does not shift when it is pressed.
      className="w-24"
      variant="ghost"
      title={t("language.switch")}
      onClick={() => setLanguage(next)}
    >
      <span lang={next}>
        {t(next === "bn" ? "language.bn" : "language.en")}
      </span>
    </Button>
  );
};

export default LanguageToggle;
