import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@OpenFarm/ui/components/dropdown-menu";
import { Languages } from "lucide-react";
import { useTheme } from "next-themes";

import { THEMES } from "@/components/theme-menu";
import { useLanguage } from "@/i18n/language-provider";

/**
 * The language and the look, in the account menu on a phone: the top bar there is the sync status's, and a language
 * switch one tap away on a Shed Phone several people share was pressed by mistake. On a desk both stay in the bar.
 */
export const PhonePreferences = () => {
  const { language, setLanguage, t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const next = language === "bn" ? "en" : "bn";
  return (
    <div className="md:hidden">
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem onClick={() => setLanguage(next)}>
          <Languages aria-hidden />
          <span lang={next}>
            {t(next === "bn" ? "language.bn" : "language.en")}
          </span>
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuLabel>{t("theme.label")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          onValueChange={(value) => setTheme(String(value))}
          value={theme ?? "light"}
        >
          {THEMES.map(({ value, icon: Icon, label }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon aria-hidden />
              {t(label)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuGroup>
    </div>
  );
};
