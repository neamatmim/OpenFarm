import { Link } from "@tanstack/react-router";
import { BookOpenCheck, ShieldCheck, Sprout, WifiOff } from "lucide-react";
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
        className="relative hidden overflow-hidden bg-[oklch(0.27_0.045_162)] px-10 text-[oklch(0.95_0.015_150)] lg:flex lg:flex-col xl:px-14"
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
        {/* The same height as the bar across the form, so the name and the bar sit on one line. */}
        <Link
          className="relative flex h-16 w-fit items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          to="/"
        >
          <span className="grid size-9 place-items-center rounded-lg bg-white/10 ring-1 ring-white/20">
            <Sprout aria-hidden className="size-5" />
          </span>
          <span className="text-lg font-semibold tracking-tight">
            {t("app.name")}
          </span>
        </Link>
        <div className="relative flex max-w-xl flex-1 flex-col justify-center gap-8 py-10">
          <p className="text-4xl leading-tight font-semibold tracking-tight text-balance xl:text-[2.75rem]">
            {t("auth.promise.title")}
          </p>
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
        <p className="relative flex h-16 items-center text-sm opacity-60">
          {t("app.tagline")}
        </p>
      </aside>
      <div className="flex flex-col">
        <PublicHeader brandOnPhoneOnly />
        {/* Held off the bottom by the header's own height, so the form is centred on the same line as the promise. */}
        <main
          className="flex flex-1 items-center justify-center px-4 pb-16"
          id="main"
        >
          <div className="w-full max-w-md">{children}</div>
        </main>
      </div>
    </div>
  );
};
