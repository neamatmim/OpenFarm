import { buttonVariants } from "@OpenFarm/ui/components/button";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  BookOpenCheck,
  LogIn,
  ShieldCheck,
  Smartphone,
  WifiOff,
} from "lucide-react";

import { PublicHeader } from "@/components/public-header";
import { useT } from "@/i18n/language-provider";
import { useInTheBrowser } from "@/lib/in-the-browser";
import { orpc } from "@/utils/orpc";

/** The front door for anybody who is not signed in: what OpenFarm is, the way in for a person, and the way in for
 *  a Shed Phone — and, quietly, whether the farm's server is answering. */
const HomeComponent = () => {
  const t = useT();
  const inTheBrowser = useInTheBrowser();
  const healthCheck = useQuery({
    ...orpc.healthCheck.queryOptions(),
    enabled: inTheBrowser,
  });
  const checkingHealth = !inTheBrowser || healthCheck.isLoading;
  let healthWord = t("home.disconnected");
  if (checkingHealth) {
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
        className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-8 px-4 py-8 outline-none md:gap-12 md:px-8 md:py-12"
        id="main"
        tabIndex={-1}
      >
        <div className="flex max-w-3xl flex-col gap-5">
          <h1 className="text-3xl font-semibold tracking-tight text-balance md:text-5xl">
            {t("auth.promise.title")}
          </h1>
          <p className="text-muted-foreground text-lg">{t("app.tagline")}</p>
          <div className="grid gap-3 pt-2 sm:flex sm:flex-wrap">
            <Link
              className={buttonVariants({
                className: "h-12 px-6 text-base",
              })}
              to="/login"
            >
              <LogIn data-icon="inline-start" />
              {t("auth.signIn")}
            </Link>
            <Link
              className={buttonVariants({
                className: "h-12 px-6 text-base",
                variant: "outline",
              })}
              to="/device"
            >
              <Smartphone data-icon="inline-start" />
              {t("home.shedPhone")}
            </Link>
          </div>
        </div>
        <ul className="grid gap-4 md:grid-cols-3">
          {promises.map(({ icon: Icon, text }) => (
            <li
              className="surface flex items-start gap-3 p-4 md:flex-col md:p-5"
              key={text}
            >
              <span className="bg-secondary text-secondary-foreground grid size-10 shrink-0 place-items-center rounded-lg">
                <Icon aria-hidden className="size-5" />
              </span>
              <p className="text-sm">{text}</p>
            </li>
          ))}
        </ul>
        <output
          aria-live="polite"
          className="text-muted-foreground bg-card inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-sm"
        >
          <span
            aria-hidden
            className={cn(
              "size-2 rounded-full",
              checkingHealth && "bg-muted-foreground animate-pulse",
              !checkingHealth && (healthCheck.data ? "bg-success" : "bg-danger")
            )}
          />
          {t("home.apiStatus")}: {healthWord}
        </output>
      </main>
    </div>
  );
};

export const Route = createFileRoute("/")({
  component: HomeComponent,
});
