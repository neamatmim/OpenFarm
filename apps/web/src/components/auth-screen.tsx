import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  BookOpenCheck,
  LogOut,
  ShieldCheck,
  Smartphone,
  Sprout,
  UserPlus,
  WifiOff,
} from "lucide-react";
import type { ReactNode } from "react";

import { DoorLinks, DoorRow, DoorScreen } from "@/components/door-screen";
import { PublicHeader } from "@/components/public-header";
import { useT } from "@/i18n/language-provider";
import { useFarmName, useNoFarmYet } from "@/lib/farm-name";
import { signOutOfThisPhone } from "@/lib/sign-out";

/**
 * The door into the farm: its promise on one side — the Playbook, the record, working without signal — and the
 * form on the other, with the other ways in under it — an invited account, a Shed Phone. On a phone the promise folds away and the form comes
 * first.
 */
export const AuthScreen = ({
  children,
  onOpenAccount,
}: {
  children: ReactNode;
  /** Where the form is the sign-in: the way to the card an invited person opens their account on. */
  onOpenAccount?: () => void;
}) => {
  const t = useT();
  const farmName = useFarmName();
  const firstFarm = useNoFarmYet();
  return (
    <DoorScreen
      header={<PublicHeader brandOnPhoneOnly />}
      home="/"
      subtitle={farmName ?? undefined}
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
      {/* The other ways in, now the farm's address has no front page of its own, on one card under the form: an
          account somebody was invited to open, and a phone set up for a shed. */}
      <DoorLinks>
        {onOpenAccount ? (
          // On the first run nobody has invited anybody yet: whoever opens the first account sets the farm up.
          <DoorRow
            hint={t(
              firstFarm ? "auth.firstFarmRowHint" : "auth.openAccountHint"
            )}
            icon={firstFarm ? Sprout : UserPlus}
            onClick={onOpenAccount}
            title={t(firstFarm ? "auth.firstFarmRow" : "auth.needAccount")}
          />
        ) : null}
        <DoorRow
          hint={t("auth.shedPhoneHint")}
          icon={Smartphone}
          title={t("auth.shedPhone")}
          to="/device"
        />
      </DoorLinks>
    </DoorScreen>
  );
};

/**
 * The door for somebody signed in with nothing behind it yet: an invite still to take up, or a farm still to set up.
 * Drawn as the sign-in they have just come through, not in the farm's menus — there is nothing on those menus for them
 * yet, and a menu of links that all lead back here is a maze. Signing out is under the card, where the menu's would be.
 */
export const SignedInDoor = ({ children }: { children: ReactNode }) => {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const farmName = useFarmName();
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
      subtitle={farmName ?? undefined}
    >
      {children}
      <DoorLinks>
        <DoorRow
          hint={t("auth.signOutHint")}
          icon={LogOut}
          onClick={async () => {
            await signOutOfThisPhone(queryClient);
            await navigate({ to: "/login" });
          }}
          title={t("auth.signOut")}
        />
      </DoorLinks>
    </DoorScreen>
  );
};
