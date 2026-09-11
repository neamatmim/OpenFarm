import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { useT } from "@/i18n/language-provider";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

import LanguageToggle from "./language-toggle";
import UserMenu from "./user-menu";

const Header = () => {
  const t = useT();
  const { data: session } = authClient.useSession();
  const me = useQuery({
    ...orpc.people.me.queryOptions(),
    enabled: Boolean(session),
  });
  const roles = me.data?.roles ?? [];
  const runsTheFarm = roles.includes("owner") || roles.includes("manager");
  const links = [
    { to: "/", label: t("nav.home") },
    { to: "/dashboard", label: t("nav.dashboard") },
    ...(session ? [{ to: "/today", label: t("nav.today") }] : []),
    ...(session ? [{ to: "/animals", label: t("nav.animals") }] : []),
    ...(session ? [{ to: "/settings", label: t("nav.settings") }] : []),
    ...(runsTheFarm
      ? [
          { to: "/home", label: t("nav.theDay") },
          { to: "/observations", label: t("nav.observations") },
          { to: "/admin/sign-off", label: t("nav.signOff") },
          { to: "/admin/sops", label: t("nav.sops") },
          { to: "/admin/herd", label: t("nav.herd") },
          { to: "/admin/feed", label: t("nav.feed") },
          { to: "/admin/devices", label: t("nav.devices") },
          { to: "/admin/people", label: t("nav.people") },
          { to: "/admin/audit", label: t("nav.audit") },
          { to: "/admin/backups", label: t("nav.backups") },
        ]
      : []),
    ...(session
      ? [{ to: "/admin/audit", label: t("nav.audit") }].filter(
          () => !runsTheFarm
        )
      : []),
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
