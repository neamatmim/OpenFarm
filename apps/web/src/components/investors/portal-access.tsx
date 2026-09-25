import type { PaperDocument } from "@OpenFarm/domain";
import { mobileNumberOf } from "@OpenFarm/domain";
import { formatDate, formatDigits } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@OpenFarm/ui/components/dialog";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  DoorClosed,
  DoorOpen,
  Eye,
  KeyRound,
  Printer,
  UserX,
} from "lucide-react";
import { useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";

import type { Tone } from "@/components/page";
import { Section, StatusBadge } from "@/components/page";
import { ConfirmDialog } from "@/components/page-kit";
import { PaperDialog } from "@/components/ventures/paper-dialog";
import { useLanguage } from "@/i18n/language-provider";
import { portalAddress } from "@/lib/portal-address";
import { printAlone } from "@/lib/print-alone";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

import type { Investor } from "./investor-types";
import type { GivenCode, HandedOverPaper } from "./welcome-letter";
import {
  CodeSlip,
  HANDED_OVER_ID,
  LETTER_PAGE,
  SLIP_PAGE,
  WelcomeLetter,
  inFours,
} from "./welcome-letter";

/** Why the farm would not invite somebody to the portal, in the Owner's words. */
const REFUSALS = {
  phone_not_mobile: "portal.refused.phoneNotMobile",
  phone_has_portal: "portal.refused.phoneHasPortal",
  investor_retired: "portal.refused.retired",
  no_consent: "portal.refused.noConsent",
  consent_in_force: "portal.refused.consentInForce",
  notice_unwritten: "portal.refused.noticeUnwritten",
  no_code_to_hand_over: "portal.refused.noCodeToHandOver",
} as const;

/** Where an Investor stands with the portal, as a word with its colour, in the order the list sorts them. */
export const STANDING = {
  in: { word: "portal.standing.in", tone: "success" },
  invited: { word: "portal.standing.invited", tone: "info" },
  code_ran_out: { word: "portal.standing.codeRanOut", tone: "warning" },
  taken_away: { word: "portal.standing.takenAway", tone: "neutral" },
  none: { word: "portal.standing.none", tone: "neutral" },
} as const satisfies Record<Investor["portal"], { word: string; tone: Tone }>;

export type PortalStanding = keyof typeof STANDING;

/** Where an Investor stands with the portal; a list cached before the portal existed has no such field, and nobody
 *  on it was invited. */
export const standingOf = (investor: Investor): PortalStanding =>
  investor.portal ?? "none";

/** Whether the portal is anything to this farm yet: open, or somebody already invited. Until then a column of "not
 *  invited" on every row says nothing. */
export const portalInUse = (open: boolean, people: Investor[]) =>
  open || people.some((one) => standingOf(one) !== "none");

/** Where an Investor stands with the portal. */
export const PortalStandingBadge = ({ investor }: { investor: Investor }) => {
  const { t } = useLanguage();
  const standing = STANDING[standingOf(investor)];
  return <StatusBadge tone={standing.tone}>{t(standing.word)}</StatusBadge>;
};

/**
 * What goes with where they stand: until when their code can be taken up, that it ran out and wants another, or when
 * they were last in. Nothing for somebody never invited or whose access was taken away.
 */
export const PortalStandingLine = ({ investor }: { investor: Investor }) => {
  const { t, language } = useLanguage();
  const standing = standingOf(investor);
  // Cached before these were answered, they are missing rather than null.
  const codeUntil = investor.portalCodeUntil ?? null;
  const lastSeenAt = investor.portalLastSeenAt ?? null;
  const consent = investor.portalConsent ?? null;
  const said: string[] = [];
  if (consent) {
    said.push(
      t("portal.consent.signed", {
        when: formatDate(new Date(`${consent.signedOn}T00:00:00Z`), language),
        version: formatDigits(consent.version, language),
      })
    );
  }
  if (standing === "in") {
    said.push(
      lastSeenAt
        ? t("portal.lastIn", {
            when: formatDate(new Date(lastSeenAt), language),
          })
        : t("portal.notInYet")
    );
  }
  if (standing === "code_ran_out") {
    said.push(t("portal.codeRanOut"));
  }
  if (codeUntil && standing !== "taken_away") {
    said.push(
      t("portal.codeGoodUntil", {
        when: formatDate(new Date(codeUntil), language),
      })
    );
  }
  if (said.length === 0) {
    return null;
  }
  return (
    <span className="text-muted-foreground text-xs">{said.join(" · ")}</span>
  );
};

/** Why the Owner cannot invite somebody, said before she tries: retired, or a phone that is not a mobile they could
 *  sign in with. The same words the farm refuses with. */
const whyNoInvite = (investor: Investor) => {
  if (investor.retiredAt) {
    return REFUSALS.investor_retired;
  }
  if (!mobileNumberOf(investor.phone)) {
    return REFUSALS.phone_not_mobile;
  }
  return null;
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

/** What the code dialog holds: the code, until when it can be taken up, and whether it is their first invitation. */
type Given = GivenCode & { first: boolean };

/**
 * The code, shown once, to hand over in person with the address it is taken up at — and the paper it goes out with,
 * printed while it is on the screen: the Welcome Letter with a first invitation, the Code Slip alone with every code
 * after. Neither can be printed once this closes, since the farm keeps only the code's hash.
 */
const CodeDialog = ({
  investorId,
  given,
  onClose,
}: {
  investorId: string;
  given: Given | null;
  onClose: () => void;
}) => {
  const { t, language } = useLanguage();
  const refused = useRefused(REFUSALS);
  // The paper laid out round the code, set off the screen to print alone.
  const [laidOut, setLaidOut] = useState<HandedOverPaper | null>(null);
  const handing = useMutation(
    orpc.investors.handOver.mutationOptions({
      onError: refused,
      onSuccess: (laid, asked) => {
        // Set on the page first, then printed from there.
        flushSync(() => setLaidOut(laid));
        const shown = document.querySelector<HTMLElement>(`#${HANDED_OVER_ID}`);
        if (shown) {
          void printAlone(
            shown,
            asked.paper === "welcome_letter" ? LETTER_PAGE : SLIP_PAGE
          );
        }
      },
    })
  );
  const paper = given?.first ? "welcome_letter" : "code_slip";
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          setLaidOut(null);
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
          {given ? inFours(given.code) : null}
        </p>
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">{t("portal.codeWhere")}</dt>
            <dd className="font-mono break-all">{portalAddress("/join")}</dd>
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
        <div className="flex flex-col gap-2">
          <Button
            disabled={handing.isPending}
            onClick={() => handing.mutate({ id: investorId, paper })}
            type="button"
          >
            {handing.isPending ? (
              <Spinner />
            ) : (
              <Printer aria-hidden data-icon="inline-start" />
            )}
            {t(given?.first ? "portal.printLetter" : "portal.printSlip")}
          </Button>
          <p className="text-muted-foreground text-xs">
            {t(
              given?.first ? "portal.printLetterHint" : "portal.printSlipHint"
            )}
          </p>
        </div>
        {given && laidOut ? (
          <div className="hidden">
            {paper === "welcome_letter" ? (
              <WelcomeLetter given={given} paper={laidOut} />
            ) : (
              <CodeSlip given={given} paper={laidOut} />
            )}
          </div>
        ) : null}
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
  const [given, setGiven] = useState<Given | null>(null);
  const [asking, setAsking] = useState(false);
  // The consent sheet on screen to print, before any code: nothing while the Investor has signed one already.
  const [sheet, setSheet] = useState<PaperDocument | null>(null);
  const inviting = useMutation(
    orpc.investors.inviteToPortal.mutationOptions({
      onError: refused,
      onSuccess: setGiven,
    })
  );
  const printing = useMutation(
    orpc.investors.consentSheet.mutationOptions({
      onError: refused,
      onSuccess: ({ document }) => setSheet(document),
    })
  );
  const consenting = useMutation(
    orpc.investors.recordConsent.mutationOptions({
      onError: refused,
      onSuccess: () => {
        setSheet(null);
        inviting.mutate({ id: investor.id });
      },
    })
  );
  // No code before consent: somebody who has not signed one is handed the sheet first.
  const hasConsent = (investor.portalConsent ?? null) !== null;
  const invite = () =>
    hasConsent
      ? inviting.mutate({ id: investor.id })
      : printing.mutate({ id: investor.id });
  const takingAway = useMutation(
    orpc.investors.takePortalAway.mutationOptions({
      onError: refused,
      onSuccess: () => {
        setAsking(false);
        toast.success(t("portal.takenAway"));
      },
    })
  );
  const standing = standingOf(investor);
  const inviteWord = standing === "none" ? "portal.invite" : "portal.newCode";
  const whyNot = whyNoInvite(investor);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <PortalStandingBadge investor={investor} />
        <PortalStandingLine investor={investor} />
        {portalOpen ? null : (
          <span className="text-muted-foreground text-xs">
            {t("portal.shutForAll")}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={whyNot !== null || inviting.isPending || printing.isPending}
          onClick={invite}
          size="sm"
          type="button"
          variant="outline"
        >
          <KeyRound aria-hidden data-icon="inline-start" />
          {t(inviteWord)}
        </Button>
        <Button
          render={
            <Link
              params={{ investorId: investor.id }}
              to="/investors/$investorId/as-they-see-it"
            />
          }
          size="sm"
          title={t("portal.preview.seeAsTheyDoHint")}
          variant="outline"
        >
          <Eye aria-hidden data-icon="inline-start" />
          {t("portal.preview.seeAsTheyDo")}
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
      {whyNot ? (
        <p className="text-muted-foreground text-sm">{t(whyNot)}</p>
      ) : null}
      <PaperDialog
        action={
          <Button
            disabled={consenting.isPending}
            onClick={() => consenting.mutate({ id: investor.id })}
            type="button"
            variant="outline"
          >
            {consenting.isPending ? <Spinner /> : null}
            {t("portal.consent.signedToday")}
          </Button>
        }
        description={t("portal.consent.sheetHint")}
        onClose={() => setSheet(null)}
        paper={sheet}
        title={t("portal.consent.sheetTitle")}
        wording={null}
      />
      <CodeDialog
        given={given}
        investorId={investor.id}
        onClose={() => setGiven(null)}
      />
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
