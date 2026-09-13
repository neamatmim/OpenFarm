import type { MessageKey } from "@OpenFarm/i18n";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Archive,
  BookOpenCheck,
  Building2,
  ClipboardCheck,
  ClipboardList,
  Eye,
  FileBadge,
  HandCoins,
  HeartPulse,
  House,
  LayoutDashboard,
  Milk,
  Pill,
  ScrollText,
  ShieldAlert,
  Smartphone,
  Stethoscope,
  Store,
  Tractor,
  TrendingUp,
  Truck,
  Users,
  Warehouse,
  Wheat,
} from "lucide-react";

/** The Roles a person can hold. A person may hold several; what they see is the union. */
export type Role = "owner" | "manager" | "staff" | "vet";

/** Who a destination is for. */
type Audience =
  | "anyone"
  | "owner"
  | "runsTheFarm"
  | "vet"
  | "vetOrRunsTheFarm"
  | "notRunningTheFarm";

export interface NavItem {
  to: string;
  label: MessageKey;
  icon: LucideIcon;
  audience: Audience;
}

export interface NavGroup {
  label: MessageKey;
  items: NavItem[];
}

/**
 * Every destination, grouped the way the farm's work is: the day, the herd, its health, milk and feed, money,
 * what an inspector asks for, and running the farm's own system. Filtered by the Roles a person holds — a filter for
 * finding things, never the permission itself; every screen and procedure still checks.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "nav.group.today",
    items: [
      {
        to: "/farm",
        label: "nav.farm",
        icon: LayoutDashboard,
        audience: "owner",
      },
      {
        to: "/home",
        label: "nav.theDay",
        icon: House,
        audience: "runsTheFarm",
      },
      {
        to: "/today",
        label: "nav.today",
        icon: ClipboardList,
        audience: "anyone",
      },
      {
        to: "/observations",
        label: "nav.observations",
        icon: Eye,
        audience: "runsTheFarm",
      },
      {
        to: "/admin/sign-off",
        label: "nav.signOff",
        icon: ClipboardCheck,
        audience: "runsTheFarm",
      },
    ],
  },
  {
    label: "nav.group.herd",
    items: [
      {
        to: "/animals",
        label: "nav.animals",
        icon: Tractor,
        audience: "anyone",
      },
      {
        to: "/admin/herd",
        label: "nav.herd",
        icon: Warehouse,
        audience: "runsTheFarm",
      },
      {
        to: "/admin/intake",
        label: "nav.intake",
        icon: Truck,
        audience: "runsTheFarm",
      },
      {
        to: "/fattening",
        label: "nav.fattening",
        icon: TrendingUp,
        audience: "runsTheFarm",
      },
      {
        to: "/ready",
        label: "nav.ready",
        icon: Activity,
        audience: "runsTheFarm",
      },
      { to: "/sale", label: "nav.sale", icon: Store, audience: "runsTheFarm" },
    ],
  },
  {
    label: "nav.group.health",
    items: [
      { to: "/vet", label: "nav.vet", icon: Stethoscope, audience: "vet" },
      {
        to: "/drugs",
        label: "nav.drugs",
        icon: Pill,
        audience: "vetOrRunsTheFarm",
      },
      {
        to: "/notifiable",
        label: "nav.notifiable",
        icon: ShieldAlert,
        audience: "vetOrRunsTheFarm",
      },
    ],
  },
  {
    label: "nav.group.milkFeed",
    items: [
      { to: "/milk", label: "nav.milk", icon: Milk, audience: "runsTheFarm" },
      {
        to: "/admin/feed",
        label: "nav.feed",
        icon: Wheat,
        audience: "runsTheFarm",
      },
    ],
  },
  {
    label: "nav.group.money",
    items: [
      {
        to: "/money",
        label: "nav.money",
        icon: HandCoins,
        audience: "runsTheFarm",
      },
    ],
  },
  {
    label: "nav.group.compliance",
    items: [
      {
        to: "/inspector",
        label: "nav.inspector",
        icon: FileBadge,
        audience: "runsTheFarm",
      },
      {
        to: "/admin/farm",
        label: "nav.identity",
        icon: Building2,
        audience: "runsTheFarm",
      },
      {
        to: "/admin/audit",
        label: "nav.audit",
        icon: ScrollText,
        audience: "anyone",
      },
    ],
  },
  {
    label: "nav.group.admin",
    items: [
      {
        to: "/admin/sops",
        label: "nav.sops",
        icon: BookOpenCheck,
        audience: "runsTheFarm",
      },
      {
        to: "/admin/people",
        label: "nav.people",
        icon: Users,
        audience: "runsTheFarm",
      },
      {
        to: "/admin/devices",
        label: "nav.devices",
        icon: Smartphone,
        audience: "runsTheFarm",
      },
      {
        to: "/admin/backups",
        label: "nav.backups",
        icon: Archive,
        audience: "runsTheFarm",
      },
    ],
  },
];

/** Whether a destination is for somebody holding these Roles. */
const isFor = (audience: Audience, roles: readonly Role[]): boolean => {
  const runsTheFarm = roles.includes("owner") || roles.includes("manager");
  const isVet = roles.includes("vet");
  switch (audience) {
    case "anyone": {
      return true;
    }
    case "owner": {
      return roles.includes("owner");
    }
    case "runsTheFarm": {
      return runsTheFarm;
    }
    case "vet": {
      return isVet;
    }
    case "vetOrRunsTheFarm": {
      return isVet || runsTheFarm;
    }
    default: {
      return !runsTheFarm;
    }
  }
};

/** The groups and destinations a person holding these Roles works from, empty groups left out. */
export const navFor = (roles: readonly Role[]): NavGroup[] =>
  NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => isFor(item.audience, roles)),
  })).filter((group) => group.items.length > 0);

/** The one Role a person holding several lands as: the widest view of the farm they have. */
export const primaryRole = (roles: readonly Role[]): Role => {
  if (roles.includes("owner")) {
    return "owner";
  }
  if (roles.includes("manager")) {
    return "manager";
  }
  return roles.includes("vet") ? "vet" : "staff";
};

/** The phone's bottom bar for the Role a person lands as: the few places they go all day, and More for the rest. */
export const BOTTOM_BAR: Record<Role, NavItem[]> = {
  owner: [
    {
      to: "/farm",
      label: "nav.overview",
      icon: LayoutDashboard,
      audience: "owner",
    },
    {
      to: "/money",
      label: "nav.money",
      icon: HandCoins,
      audience: "runsTheFarm",
    },
    {
      to: "/admin/sops",
      label: "nav.sops",
      icon: BookOpenCheck,
      audience: "runsTheFarm",
    },
  ],
  manager: [
    { to: "/home", label: "nav.theDay", icon: House, audience: "runsTheFarm" },
    {
      to: "/admin/sign-off",
      label: "nav.signOff",
      icon: ClipboardCheck,
      audience: "runsTheFarm",
    },
    { to: "/animals", label: "nav.animals", icon: Tractor, audience: "anyone" },
  ],
  vet: [
    { to: "/vet", label: "nav.vet", icon: HeartPulse, audience: "vet" },
    { to: "/animals", label: "nav.animals", icon: Tractor, audience: "anyone" },
    {
      to: "/drugs",
      label: "nav.drugs",
      icon: Pill,
      audience: "vetOrRunsTheFarm",
    },
  ],
  staff: [
    {
      to: "/today",
      label: "nav.today",
      icon: ClipboardList,
      audience: "anyone",
    },
    { to: "/animals", label: "nav.animals", icon: Tractor, audience: "anyone" },
  ],
};

/** Where each Role lands when it opens the app. */
export const LANDING: Record<Role, "/farm" | "/home" | "/vet" | "/today"> = {
  owner: "/farm",
  manager: "/home",
  vet: "/vet",
  staff: "/today",
};
