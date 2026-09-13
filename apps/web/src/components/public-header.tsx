import { cn } from "@OpenFarm/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { Sprout } from "lucide-react";

import LanguageToggle from "@/components/language-toggle";
import { ThemeMenu } from "@/components/theme-menu";
import { useT } from "@/i18n/language-provider";

/** The bar over the pages anybody can reach before signing in: the farm's name, and the reader's own settings.
 *  `brandOnPhoneOnly` where a wider screen already shows the name beside it, so it is never said twice. */
export const PublicHeader = ({
  brandOnPhoneOnly = false,
}: {
  brandOnPhoneOnly?: boolean;
}) => {
  const t = useT();
  return (
    <header
      className="flex h-16 items-center justify-between px-4 md:px-8"
      data-app-chrome
    >
      <Link
        className={cn(
          "focus-visible:ring-ring flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2",
          brandOnPhoneOnly && "lg:hidden"
        )}
        to="/"
      >
        <span className="bg-primary text-primary-foreground grid size-9 place-items-center rounded-lg shadow-sm">
          <Sprout aria-hidden className="size-5" />
        </span>
        <span className="text-lg font-semibold tracking-tight">
          {t("app.name")}
        </span>
      </Link>
      <div className="ms-auto flex items-center gap-1">
        <LanguageToggle />
        <ThemeMenu />
      </div>
    </header>
  );
};
