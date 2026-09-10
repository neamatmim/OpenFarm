import { Link } from "@tanstack/react-router";

import { useT } from "@/i18n/language-provider";

import LanguageToggle from "./language-toggle";
import UserMenu from "./user-menu";

const Header = () => {
  const t = useT();
  const links = [
    { to: "/", label: t("nav.home") },
    { to: "/dashboard", label: t("nav.dashboard") },
  ] as const;

  return (
    <div>
      <div className="flex flex-row items-center justify-between px-2 py-1">
        <nav className="flex gap-4 text-lg">
          {links.map(({ to, label }) => (
            <Link key={to} to={to}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <LanguageToggle />
          <UserMenu />
        </div>
      </div>
      <hr />
    </div>
  );
};

export default Header;
