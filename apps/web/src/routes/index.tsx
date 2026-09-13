import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { useT } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

const HomeComponent = () => {
  const t = useT();
  const healthCheck = useQuery(orpc.healthCheck.queryOptions());

  const status = () => {
    if (healthCheck.isLoading) {
      return t("home.checking");
    }
    return healthCheck.data ? t("home.connected") : t("home.disconnected");
  };

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-3xl font-bold">{t("app.name")}</h1>
      <p className="text-muted-foreground mb-6">{t("app.tagline")}</p>
      <div className="grid gap-6">
        <section className="rounded-lg border p-4">
          <h2 className="mb-2 font-medium">{t("home.apiStatus")}</h2>
          <div className="flex items-center gap-2">
            <div
              className={`h-2 w-2 rounded-full ${healthCheck.data ? "bg-success" : "bg-danger"}`}
            />
            <span className="text-muted-foreground text-sm">{status()}</span>
          </div>
        </section>
      </div>
    </div>
  );
};

export const Route = createFileRoute("/")({
  component: HomeComponent,
});
