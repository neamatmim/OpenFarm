import { Button } from "@OpenFarm/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@OpenFarm/ui/components/dropdown-menu";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { useT } from "@/i18n/language-provider";
import { useInTheBrowser } from "@/lib/in-the-browser";

const THEMES = [
  { value: "light", icon: Sun, label: "theme.light" },
  { value: "dark", icon: Moon, label: "theme.dark" },
  { value: "system", icon: Monitor, label: "theme.system" },
] as const;

/** Light for the sunlit shed and the office, dark for the evening, or whatever this device is set to. */
export const ThemeMenu = () => {
  const t = useT();
  const { theme, resolvedTheme, setTheme } = useTheme();
  // The server cannot know what this device chose, so the icon waits for the browser.
  const Current = useInTheBrowser() && resolvedTheme === "dark" ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={t("theme.label")}
            size="icon"
            title={t("theme.label")}
            variant="ghost"
          />
        }
      >
        <Current />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("theme.label")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            onValueChange={(value) => setTheme(String(value))}
            value={theme ?? "light"}
          >
            {THEMES.map(({ value, icon: Icon, label }) => (
              <DropdownMenuRadioItem key={value} value={value}>
                <Icon />
                {t(label)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
