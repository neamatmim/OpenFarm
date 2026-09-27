import {
  BookOpenCheck,
  ShieldCheck,
  Smartphone,
  UserPlus,
  WifiOff,
} from "lucide-react";
import type { ReactNode } from "react";

import { DoorLinks, DoorRow, DoorScreen } from "@/components/door-screen";
import { PublicHeader } from "@/components/public-header";
import { useT } from "@/i18n/language-provider";
import { useFarmName } from "@/lib/farm-name";

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
          <DoorRow
            hint={t("auth.openAccountHint")}
            icon={UserPlus}
            onClick={onOpenAccount}
            title={t("auth.needAccount")}
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
