import { Outlet, createFileRoute } from "@tanstack/react-router";

import { SettingsNav } from "@/components/settings-nav";
import { onlyFor } from "@/lib/guard";

/** The farm's settings: its parts listed beside the one open, which draws its own page. */
const FarmSettings = () => (
  <div className="flex min-w-0 flex-1 flex-col lg:flex-row">
    <SettingsNav />
    <div className="min-w-0 flex-1">
      <Outlet />
    </div>
  </div>
);

export const Route = createFileRoute("/_authenticated/farm")({
  /** For those who run the farm: the Owner and the Farm Managers. A part that is the Owner's says so itself. */
  beforeLoad: onlyFor("runsTheFarm"),
  component: FarmSettings,
});
