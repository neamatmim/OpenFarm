import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@OpenFarm/ui/components/dialog";
import { useMutation } from "@tanstack/react-query";
import { DoorClosed, DoorOpen, KeyRound, UserX } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { Tone } from "@/components/page";
import { Section, StatusBadge } from "@/components/page";
import { ConfirmDialog } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

import type { Investor } from "./investor-types";

/** Why the farm would not invite somebody to the portal, in the Owner's words. */
const REFUSALS = {
  phone_not_mobile: "portal.refused.phoneNotMobile",
  phone_has_portal: "portal.refused.phoneHasPortal",
  investor_retired: "portal.refused.retired",
} as const;

/** Where an Investor stands with the portal, as a word with its colour. */
const STANDING = {
  none: { word: "portal.standing.none", tone: "neutral" },
  invited: { word: "portal.standing.invited", tone: "info" },
  in: { word: "portal.standing.in", tone: "success" },
  taken_away: { word: "portal.standing.takenAway", tone: "neutral" },
} as const satisfies Record<Investor["portal"], { word: string; tone: Tone }>;

/** Where an Investor stands with the portal. */
export const PortalStandingBadge = ({ investor }: { investor: Investor }) => {
  const { t } = useLanguage();
  // A list cached before the portal existed has no such field: nobody on it was invited.
  const standing = STANDING[investor.portal ?? "none"];
  return <StatusBadge tone={standing.tone}>{t(standing.word)}</StatusBadge>;
};

/**
 * The portal, open or shut for the whole farm (ADR 0007). Opening it is asked about first, because it is the Owner's
 * decision taken before the lawyer answered whether the portal makes the farm a platform — and shutting it is how the
 * farm answers a lawyer who says so, with nobody's access lost.
 */
export const PortalSwitch = ({ open }: { open: boolean }) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [asking, setAsking] = useState(false);
  const turning = useMutation(
    orpc.investors.setPortalOpen.mutationOptions({
      onError: refused,
      onSuccess: (done) => {
        setAsking(false);
        toast.success(t(done.open ? "portal.opened" : "portal.shut"));
      },
    })
  );
  return (
    <Section
      action={
        open ? (
          <Button
            disabled={turning.isPending}
            onClick={() => turning.mutate({ open: false })}
            type="button"
            variant="outline"
          >
            <DoorClosed aria-hidden data-icon="inline-start" />
            {t("portal.shutIt")}
          </Button>
        ) : (
          <Button
            onClick={() => setAsking(true)}
            type="button"
            variant="outline"
          >
            <DoorOpen aria-hidden data-icon="inline-start" />
            {t("portal.openIt")}
          </Button>
        )
      }
      description={t(open ? "portal.openHint" : "portal.shutHint")}
      title={
        <span className="flex flex-wrap items-center gap-2">
          {t("portal.title")}
          <StatusBadge tone={open ? "success" : "neutral"}>
            {t(open ? "portal.isOpen" : "portal.isShut")}
          </StatusBadge>
        </span>
      }
    >
      <ConfirmDialog
        confirmLabel={t("portal.openIt")}
        description={t("portal.openWhy")}
        onConfirm={() => turning.mutate({ open: true })}
        onOpenChange={setAsking}
        open={asking}
        pending={turning.isPending}
        title={t("portal.openTitle")}
      />
    </Section>
  );
};

/** The code, shown once, to hand over in person with the address it is taken up at. */
const CodeDialog = ({
  given,
  onClose,
}: {
  given: { code: string; expiresAt: Date } | null;
  onClose: () => void;
}) => {
  const { t, language } = useLanguage();
  const where =
    typeof window === "undefined"
      ? "/portal/join"
      : `${window.location.origin}/portal/join`;
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open={given !== null}
    >
      <DialogContent closeLabel={t("common.close")}>
        <DialogHeader>
          <DialogTitle>{t("portal.codeTitle")}</DialogTitle>
          <DialogDescription>{t("portal.codeHint")}</DialogDescription>
        </DialogHeader>
        <p className="bg-muted rounded-lg py-4 text-center font-mono text-3xl font-semibold tracking-[0.3em]">
          {given?.code}
        </p>
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">{t("portal.codeWhere")}</dt>
            <dd className="font-mono break-all">{where}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">{t("portal.codeUntil")}</dt>
            <dd>
              {given
                ? formatDate(new Date(given.expiresAt), language, "dateTime")
                : null}
            </dd>
          </div>
        </dl>
      </DialogContent>
    </Dialog>
  );
};

/**
 * One Investor's way into the portal, in their record: where they stand, inviting them or giving a new code — for a
 * forgotten password too — and taking their access away.
 */
export const PortalAccess = ({
  investor,
  portalOpen,
}: {
  investor: Investor;
  portalOpen: boolean;
}) => {
  const { t } = useLanguage();
  const refused = useRefused(REFUSALS);
  const [given, setGiven] = useState<{ code: string; expiresAt: Date } | null>(
    null
  );
  const [asking, setAsking] = useState(false);
  const inviting = useMutation(
    orpc.investors.inviteToPortal.mutationOptions({
      onError: refused,
      onSuccess: setGiven,
    })
  );
  const takingAway = useMutation(
    orpc.investors.takePortalAway.mutationOptions({
      onError: refused,
      onSuccess: () => {
        setAsking(false);
        toast.success(t("portal.takenAway"));
      },
    })
  );
  const standing = investor.portal ?? "none";
  const inviteWord = standing === "none" ? "portal.invite" : "portal.newCode";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <PortalStandingBadge investor={investor} />
        {portalOpen ? null : (
          <span className="text-muted-foreground text-xs">
            {t("portal.shutForAll")}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={Boolean(investor.retiredAt) || inviting.isPending}
          onClick={() => inviting.mutate({ id: investor.id })}
          size="sm"
          type="button"
          variant="outline"
        >
          <KeyRound aria-hidden data-icon="inline-start" />
          {t(inviteWord)}
        </Button>
        {standing === "in" || standing === "invited" ? (
          <Button
            onClick={() => setAsking(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            <UserX aria-hidden data-icon="inline-start" />
            {t("portal.takeAway")}
          </Button>
        ) : null}
      </div>
      <CodeDialog given={given} onClose={() => setGiven(null)} />
      <ConfirmDialog
        confirmLabel={t("portal.takeAway")}
        description={t("portal.takeAwayWhy")}
        onConfirm={() => takingAway.mutate({ id: investor.id })}
        onOpenChange={setAsking}
        open={asking}
        pending={takingAway.isPending}
        title={t("portal.takeAwayTitle", { name: investor.name })}
      />
    </div>
  );
};
