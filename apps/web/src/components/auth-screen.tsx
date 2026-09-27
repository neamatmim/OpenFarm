import { Link } from "@tanstack/react-router";
import {
  BookOpenCheck,
  ChevronRight,
  ShieldCheck,
  Smartphone,
  WifiOff,
} from "lucide-react";
import type { ReactNode } from "react";

import { DoorScreen } from "@/components/door-screen";
import { PublicHeader } from "@/components/public-header";
import { useT } from "@/i18n/language-provider";

/**
 * The door into the farm: its promise on one side — the Playbook, the record, working without signal — and the
 * form on the other, with the way in for a Shed Phone under it. On a phone the promise folds away and the form comes
 * first.
 */
export const AuthScreen = ({ children }: { children: ReactNode }) => {
  const t = useT();
  return (
    <DoorScreen
      header={<PublicHeader brandOnPhoneOnly />}
      home="/"
      promise={{
        title: t("auth.promise.title"),
        points: [
          { icon: BookOpenCheck, text: t("auth.promise.playbook") },
          { icon: ShieldCheck, text: t("auth.promise.record") },
          { icon: WifiOff, text: t("auth.promise.offline") },
        ],
        foot: t("app.tagline"),
      }}
    >
      {children}
      {/* The other way in, now the farm's address has no front page of its own: a phone set up for a shed. A card
          of its own under the form, the whole of it the link, saying what the phone is for — a milker's PIN, or
          the Manager's code for a new one. */}
      <Link
        className="surface hover:bg-muted/50 focus-visible:ring-ring flex items-center gap-3 p-4 transition-colors duration-150 outline-none focus-visible:ring-2"
        to="/device"
      >
        <span className="bg-secondary text-secondary-foreground grid size-10 shrink-0 place-items-center rounded-lg">
          <Smartphone aria-hidden className="size-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-medium">{t("auth.shedPhone")}</span>
          <span className="text-muted-foreground text-sm">
            {t("auth.shedPhoneHint")}
          </span>
        </span>
        <ChevronRight
          aria-hidden
          className="text-muted-foreground size-4 shrink-0"
        />
      </Link>
    </DoorScreen>
  );
};
