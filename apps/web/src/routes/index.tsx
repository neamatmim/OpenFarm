import { Button } from "@OpenFarm/ui/components/button";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { BookOpenCheck, ShieldCheck, Smartphone, WifiOff } from "lucide-react";

import { PublicHeader } from "@/components/public-header";
import { useT } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/** The front door for anybody who is not signed in: what OpenFarm is, the way in for a person, and the way in for
 *  a Shed Phone — and, quietly, whether the farm's server is answering. */
const HomeComponent = () => {
  const t = useT();
  const healthCheck = useQuery(orpc.healthCheck.queryOptions());
  let healthWord = t("home.disconnected");
  if (healthCheck.isLoading) {
    healthWord = t("home.checking");
  } else if (healthCheck.data) {
    healthWord = t("home.connected");
  }
  const promises = [
    { icon: BookOpenCheck, text: t("auth.promise.playbook") },
    { icon: ShieldCheck, text: t("auth.promise.record") },
    { icon: WifiOff, text: t("auth.promise.offline") },
  ];

  return (
    <div className="flex min-h-svh flex-col">
      <PublicHeader />
      <main
        className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-10 px-4 py-10 md:px-8"
        id="main"
      >
        <div className="flex max-w-3xl flex-col gap-5">
          <p className="text-primary text-sm font-semibold">{t("app.name")}</p>
          <h1 className="text-3xl leading-tight font-semibold tracking-tight md:text-5xl">
            {t("auth.promise.title")}
          </h1>
          <p className="text-muted-foreground text-lg">{t("app.tagline")}</p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button
              className="h-12 px-6 text-base"
              render={<Link to="/login" />}
            >
              {t("auth.signIn")}
            </Button>
            <Button
              className="h-12 px-6 text-base"
              render={<Link to="/device" />}
              variant="outline"
            >
              <Smartphone data-icon="inline-start" />
              {t("home.shedPhone")}
            </Button>
          </div>
        </div>
        <ul className="grid gap-4 md:grid-cols-3">
          {promises.map(({ icon: Icon, text }) => (
            <li className="surface flex flex-col gap-3 p-5" key={text}>
              <span className="bg-secondary text-secondary-foreground grid size-10 place-items-center rounded-lg">
                <Icon aria-hidden className="size-5" />
              </span>
              <p className="text-sm">{text}</p>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <span
            aria-hidden
            className={cn(
              "size-2 rounded-full",
              healthCheck.data ? "bg-success" : "bg-danger"
            )}
          />
          {healthWord}
        </p>
      </main>
    </div>
  );
};

export const Route = createFileRoute("/")({
  component: HomeComponent,
});
