import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { useT } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/dashboard")({
  component: RouteComponent,
});

function RouteComponent() {
  const { session } = Route.useRouteContext();
  const t = useT();

  const privateData = useQuery(orpc.privateData.queryOptions());

  return (
    <div>
      <h1>{t("dashboard.title")}</h1>
      <p>{t("dashboard.welcome", { name: session?.user.name ?? "" })}</p>
      <p>{t("dashboard.api", { message: privateData.data?.message ?? "" })}</p>
    </div>
  );
}
