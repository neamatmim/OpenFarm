import type { MessageKey } from "@OpenFarm/i18n";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Archive,
  BookOpen,
  BookOpenCheck,
  BriefcaseBusiness,
  Building2,
  ChartColumn,
  ClipboardCheck,
  ClipboardList,
  Eye,
  FileBadge,
  HandCoins,
  Handshake,
  HeartPulse,
  House,
  LayoutDashboard,
  HeartHandshake,
  ListX,
  Milk,
  PawPrint,
  Pill,
  ScrollText,
  ShieldAlert,
  Stethoscope,
  Store,
  TrendingUp,
  Truck,
  Warehouse,
  Wheat,
} from "lucide-react";

/** The Roles a person can hold. A person may hold several; what they see is the union. */
export type Role = "owner" | "manager" | "staff" | "vet";

/** Who a destination is for. */
export type Audience =
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
  /** How many wait there, in the reader's own digits, drawn on the phone's bar; nothing for none. */
  count?: string;
  /** Whether any of them is new to the reader, which sets the count in the brand's colour. */
  fresh?: boolean;
}

export interface NavGroup {
  label: MessageKey;
  items: NavItem[];
}

/**
 * Every destination, grouped the way the farm's work is: the day, the herd, its health, milk and feed, money,
 * what an inspector asks for, and running the farm's own system — its identity and parameters among it. Filtered by
 * the Roles a person holds — a filter for finding things, never the permission itself; every screen and procedure
 * still checks.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "nav.group.today",
    items: [
      {
        to: "/overview",
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
        to: "/work",
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
        to: "/review-queue",
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
        icon: PawPrint,
        audience: "anyone",
      },
      {
        to: "/sheds",
        label: "nav.herd",
        icon: Warehouse,
        audience: "runsTheFarm",
      },
      {
        to: "/intakes",
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
        to: "/ready-for-sale",
        label: "nav.ready",
        icon: Activity,
        audience: "runsTheFarm",
      },
      { to: "/sales", label: "nav.sale", icon: Store, audience: "runsTheFarm" },
      {
        to: "/fertility",
        label: "nav.fertility",
        icon: HeartHandshake,
        audience: "vetOrRunsTheFarm",
      },
      {
        to: "/cull-list",
        label: "nav.culling",
        icon: ListX,
        audience: "owner",
      },
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
        to: "/notifiable-diseases",
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
        to: "/feed",
        label: "nav.feed",
        icon: Wheat,
        audience: "runsTheFarm",
      },
      {
        to: "/standards",
        label: "nav.standards",
        icon: BookOpen,
        audience: "vetOrRunsTheFarm",
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
      {
        to: "/monthly-report",
        label: "nav.months",
        icon: ChartColumn,
        audience: "owner",
      },
      {
        to: "/returns",
        label: "nav.returns",
        icon: TrendingUp,
        audience: "owner",
      },
      {
        to: "/ventures",
        label: "nav.ventures",
        icon: Handshake,
        audience: "owner",
      },
      {
        to: "/investors",
        label: "nav.investors",
        icon: BriefcaseBusiness,
        audience: "owner",
      },
    ],
  },
  {
    label: "nav.group.compliance",
    items: [
      {
        to: "/inspector-view",
        label: "nav.inspector",
        icon: FileBadge,
        audience: "runsTheFarm",
      },
      {
        to: "/audit",
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
        to: "/farm",
        label: "nav.identity",
        icon: Building2,
        audience: "runsTheFarm",
      },
      {
        to: "/sops",
        label: "nav.sops",
        icon: BookOpenCheck,
        audience: "runsTheFarm",
      },
      {
        to: "/backups",
        label: "nav.backups",
        icon: Archive,
        audience: "runsTheFarm",
      },
    ],
  },
];

/** Whether a destination is for somebody holding these Roles. */
export const isFor = (audience: Audience, roles: readonly Role[]): boolean => {
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

/** The groups and destinations a person holding these Roles works from, empty groups left out. Somebody holding no
 *  Role yet has only the invitation code to enter, so nothing is offered. */
export const navFor = (roles: readonly Role[]): NavGroup[] =>
  roles.length === 0
    ? []
    : NAV_GROUPS.map((group) => ({
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
      to: "/overview",
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
      to: "/sops",
      label: "nav.sops",
      icon: BookOpenCheck,
      audience: "runsTheFarm",
    },
  ],
  manager: [
    { to: "/home", label: "nav.theDay", icon: House, audience: "runsTheFarm" },
    {
      to: "/review-queue",
      label: "nav.signOff",
      icon: ClipboardCheck,
      audience: "runsTheFarm",
    },
    {
      to: "/animals",
      label: "nav.animals",
      icon: PawPrint,
      audience: "anyone",
    },
  ],
  vet: [
    { to: "/vet", label: "nav.vet", icon: HeartPulse, audience: "vet" },
    {
      to: "/animals",
      label: "nav.animals",
      icon: PawPrint,
      audience: "anyone",
    },
    {
      to: "/drugs",
      label: "nav.drugs",
      icon: Pill,
      audience: "vetOrRunsTheFarm",
    },
  ],
  staff: [
    {
      to: "/work",
      label: "nav.today",
      icon: ClipboardList,
      audience: "anyone",
    },
    {
      to: "/animals",
      label: "nav.animals",
      icon: PawPrint,
      audience: "anyone",
    },
  ],
};

/** Where each Role lands when it opens the app. */
export const LANDING: Record<Role, "/overview" | "/home" | "/vet" | "/work"> = {
  owner: "/overview",
  manager: "/home",
  vet: "/vet",
  staff: "/work",
};
