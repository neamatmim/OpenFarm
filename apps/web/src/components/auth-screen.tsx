import { BookOpenCheck, ShieldCheck, WifiOff } from "lucide-react";
import type { ReactNode } from "react";

import { PublicHeader } from "@/components/public-header";
import { useT } from "@/i18n/language-provider";

/**
 * The door into the farm: its promise on one side — the Playbook, the record, working without signal — and the
 * form on the other. On a phone the promise folds away and the form comes first.
 */
export const AuthScreen = ({ children }: { children: ReactNode }) => {
  const t = useT();
  const promises = [
    { icon: BookOpenCheck, text: t("auth.promise.playbook") },
    { icon: ShieldCheck, text: t("auth.promise.record") },
    { icon: WifiOff, text: t("auth.promise.offline") },
  ];
  return (
    <div className="grid min-h-svh lg:grid-cols-[1.05fr_1fr]">
      <aside
        className="relative hidden overflow-hidden bg-[oklch(0.27_0.045_162)] p-10 text-[oklch(0.95_0.015_150)] lg:flex lg:flex-col lg:justify-between"
        data-app-chrome
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-90 [background:radial-gradient(60rem_40rem_at_-10%_-10%,oklch(0.42_0.09_155/.55),transparent_60%),radial-gradient(40rem_30rem_at_110%_110%,oklch(0.55_0.1_85/.35),transparent_60%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 [background-image:linear-gradient(oklch(1_0_0)_1px,transparent_1px),linear-gradient(90deg,oklch(1_0_0)_1px,transparent_1px)] [background-size:44px_44px] opacity-[0.07]"
        />
        <p className="relative text-sm font-medium tracking-wide opacity-80">
          {t("app.name")}
        </p>
        <div className="relative flex max-w-lg flex-col gap-8">
          <h1 className="text-4xl leading-tight font-semibold tracking-tight">
            {t("auth.promise.title")}
          </h1>
          <ul className="flex flex-col gap-4">
            {promises.map(({ icon: Icon, text }) => (
              <li className="flex items-start gap-3" key={text}>
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <Icon aria-hidden className="size-5" />
                </span>
                <span className="pt-1.5 text-base/relaxed opacity-90">
                  {text}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm opacity-60">{t("app.tagline")}</p>
      </aside>
      <div className="flex flex-col">
        <PublicHeader />
        <main
          className="flex flex-1 items-center justify-center px-4 pb-12"
          id="main"
        >
          <div className="w-full max-w-md">{children}</div>
        </main>
      </div>
    </div>
  );
};
