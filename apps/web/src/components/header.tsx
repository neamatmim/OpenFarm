import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { useT } from "@/i18n/language-provider";
import { authClient } from "@/lib/auth-client";
import { useInTheBrowser } from "@/lib/in-the-browser";
import { orpc } from "@/utils/orpc";

import LanguageToggle from "./language-toggle";
import UserMenu from "./user-menu";

const Header = () => {
  const t = useT();
  // The server does not know who is signed in; the browser often already does. The links a person's Roles give
  // are drawn once the page is in the browser, so the page the server sent is the page the browser takes over.
  const { data: signedIn } = authClient.useSession();
  const session = useInTheBrowser() ? signedIn : null;
  const me = useQuery({
    ...orpc.people.me.queryOptions(),
    enabled: Boolean(session),
  });
  // What this phone has kept of their Roles is there before the page is taken over, whether or not anyone asked.
  const roles = session ? (me.data?.roles ?? []) : [];
  const runsTheFarm = roles.includes("owner") || roles.includes("manager");
  /** The Vet keeps the Drug List, and is off-site more often than on it. */
  const isVet = roles.includes("vet");
  const links = [
    { to: "/", label: t("nav.home") },
    { to: "/dashboard", label: t("nav.dashboard") },
    ...(session ? [{ to: "/today", label: t("nav.today") }] : []),
    ...(session ? [{ to: "/animals", label: t("nav.animals") }] : []),
    // The Drug List is the Vet's to keep and the Manager's to add to, so it does not live
    // behind the admin screens — a Vet sent there is sent away.
    ...(isVet || runsTheFarm ? [{ to: "/drugs", label: t("nav.drugs") }] : []),
    // The Vet's own screen: what the rounds have seen and nobody has answered. Theirs alone,
    // because a Diagnosis is theirs alone.
    ...(isVet ? [{ to: "/vet", label: t("nav.vet") }] : []),
    // The list of diseases that must be reported: the Vet knows the schedule, the Manager takes
    // the letter, and the Owner answers for the farm.
    ...(isVet || runsTheFarm
      ? [{ to: "/notifiable", label: t("nav.notifiable") }]
      : []),
    ...(session ? [{ to: "/settings", label: t("nav.settings") }] : []),
    // The Owner's own screen, and only the Owner's: a Manager sent there is sent to a
    // refusal.
    ...(roles.includes("owner") ? [{ to: "/farm", label: t("nav.farm") }] : []),
    ...(runsTheFarm
      ? [
          { to: "/home", label: t("nav.theDay") },
          { to: "/observations", label: t("nav.observations") },
          { to: "/admin/sign-off", label: t("nav.signOff") },
          { to: "/admin/sops", label: t("nav.sops") },
          { to: "/admin/herd", label: t("nav.herd") },
          // Taking a bought-in animal in: the Manager's act, at the lorry.
          { to: "/admin/intake", label: t("nav.intake") },
          // The fattening side at a glance: who will make their weight by their window.
          { to: "/fattening", label: t("nav.fattening") },
          // What the farm thinks is ready to sell, for the Manager to decide on.
          { to: "/ready", label: t("nav.ready") },
          // Eid morning: the one gate that stops a farm selling meat it cannot say is safe.
          { to: "/sale", label: t("nav.sale") },
          // Milk leaving the farm, and the records a processor or BFSA asks for.
          { to: "/milk", label: t("nav.milk") },
          // The farm's money, from its own records, and what waits for the Owner.
          { to: "/money", label: t("nav.money") },
          { to: "/admin/feed", label: t("nav.feed") },
          { to: "/admin/devices", label: t("nav.devices") },
          { to: "/admin/people", label: t("nav.people") },
          { to: "/admin/audit", label: t("nav.audit") },
          { to: "/admin/backups", label: t("nav.backups") },
          // The one screen shown to a DLS inspector.
          { to: "/inspector", label: t("nav.inspector") },
          // What the farm is, as every paper leaving it prints it.
          { to: "/admin/farm", label: t("nav.identity") },
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
