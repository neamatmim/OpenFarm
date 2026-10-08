import type { PaperDocument } from "@OpenFarm/domain";
import { farmDayOf, mobileNumberOf } from "@OpenFarm/domain";
import type { Language } from "@OpenFarm/i18n";
import { formatDate, formatDigits } from "@OpenFarm/i18n";
import { Button, buttonVariants } from "@OpenFarm/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@OpenFarm/ui/components/dialog";
import { Input } from "@OpenFarm/ui/components/input";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  DoorClosed,
  DoorOpen,
  Eye,
  EyeOff,
  FileSignature,
  KeyRound,
  Printer,
  Send,
  TrendingUp,
  UserX,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { flushSync } from "react-dom";

import type { Tone } from "@/components/page";
import { StatusBadge } from "@/components/page";
import {
  ConfirmDialog,
  FormDialog,
  FormField,
  NativeSelect,
} from "@/components/page-kit";
import { TO_THE_KEEPERS } from "@/components/templates/data-keepers";
import {
  PaperDialog,
  PaperLanguageSwitch,
} from "@/components/ventures/paper-dialog";
import { useLanguage } from "@/i18n/language-provider";
import { useWordsIn } from "@/i18n/words-in";
import { portalAddress } from "@/lib/portal-address";
import { printAlone } from "@/lib/print-alone";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import type { client } from "@/utils/orpc";
import { orpc } from "@/utils/orpc";

import type { Investor } from "./investor-types";
import type { GivenCode, HandedOverPaper } from "./welcome-letter";
import { CODE_PAPER, HANDED_OVER_ID, inFours } from "./welcome-letter";

/** Why the farm would not invite somebody to the portal, in the Owner's words. */
const REFUSALS = {
  phone_not_mobile: "portal.refused.phoneNotMobile",
  phone_has_portal: "portal.refused.phoneHasPortal",
  investor_retired: "portal.refused.retired",
  no_consent: "portal.refused.noConsent",
  consent_in_force: "portal.refused.consentInForce",
  notice_unwritten: "portal.refused.noticeUnwritten",
  no_code_to_hand_over: "portal.refused.noCodeToHandOver",
  no_consent_to_withdraw: "portal.refused.noConsentToWithdraw",
  withdrawn_in_the_future: "portal.refused.withdrawnInTheFuture",
  withdrawn_before_signed: "portal.refused.withdrawnBeforeSigned",
  letter_handed_over: "portal.refused.letterHandedOver",
  portal_closed: "portal.refused.inviteWhileShut",
  first_code_in_person: "portal.refused.firstCodeInPerson",
  access_taken_away: "portal.refused.accessTakenAway",
  no_way_to_send_a_code: "portal.refused.noWayToSend",
  code_not_sent: "portal.refused.codeNotSent",
  code_sent_just_now: "portal.refused.codeSentJustNow",
} as const;

/** Where an Investor stands with the portal, as a word with its color, in the order the list sorts them. */
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

/** Why their access was taken away, in a line: for a withdrawn consent, the day they asked and how. */
const takenAwayLine = (
  takenAway: NonNullable<Investor["portalTakenAway"]>,
  { t, language }: Pick<ReturnType<typeof useLanguage>, "t" | "language">
) => {
  if (takenAway.why !== "withdrew_consent") {
    return t(`portal.takenAwayLine.${takenAway.why}`);
  }
  const { withdrawnOn, withdrawnHow } = takenAway;
  if (!(withdrawnOn && withdrawnHow)) {
    return t("portal.takenAwayLine.withdrewUndated");
  }
  return t("portal.takenAwayLine.withdrew_consent", {
    day: formatDate(new Date(`${withdrawnOn}T00:00:00Z`), language),
    how: t(`portal.howLine.${withdrawnHow}`),
  });
};

/** Where a sent code went, each way in a word, as the Owner is told it. */
const sentWays = (
  sent: { bySms: string | null; byEmail: string | null },
  t: ReturnType<typeof useLanguage>["t"]
) =>
  [
    sent.bySms ? t("portal.codeSentBySms", { to: sent.bySms }) : null,
    sent.byEmail ? t("portal.codeSentByEmail", { to: sent.byEmail }) : null,
  ]
    .filter(Boolean)
    .join(", ");

/** When their open code was sent rather than handed over, and where it went; nothing for one handed over. */
const sentLine = (
  investor: Investor,
  {
    t,
    language,
  }: { t: ReturnType<typeof useLanguage>["t"]; language: Language }
) => {
  // Cached before it was answered, it is missing rather than null.
  const sent = investor.portalCodeSent ?? null;
  if (!sent || standingOf(investor) === "taken_away") {
    return null;
  }
  return t("portal.codeSentLine", {
    when: formatDate(new Date(sent.at), language, "dateTime"),
    ways: sentWays(sent, t),
  });
};

/** Whether a new code may be sent rather than handed over: to somebody invited in person before, whose access stands. */
const maySendCode = (standing: PortalStanding) =>
  standing === "in" || standing === "invited" || standing === "code_ran_out";

/**
 * What goes with where they stand: until when their code can be taken up, that it ran out and wants another, or when
 * they were last in. Nothing for somebody never invited or whose access was taken away.
 */
export const PortalStandingLine = ({
  investor,
  brief = false,
}: {
  investor: Investor;
  /** A list's row: leave the consent to their own page, where it is read. */
  brief?: boolean;
}) => {
  const { t, language } = useLanguage();
  const standing = standingOf(investor);
  // Cached before these were answered, they are missing rather than null.
  const codeUntil = investor.portalCodeUntil ?? null;
  const lastSeenAt = investor.portalLastSeenAt ?? null;
  const consent = investor.portalConsent ?? null;
  const takenAway = investor.portalTakenAway ?? null;
  const said: string[] = [];
  if (takenAway && standing === "taken_away") {
    said.push(takenAwayLine(takenAway, { t, language }));
  }
  if (consent && !brief) {
    said.push(
      t("portal.consent.signed", {
        when: formatDate(new Date(`${consent.signedOn}T00:00:00Z`), language),
        version: formatDigits(consent.version, language),
      })
    );
    // An answer cached before consents said it has no such field, and is said nothing of.
    if (consent.signsInApp === false) {
      said.push(t("portal.consent.noSigningClause"));
    }
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
  const sent = brief ? null : sentLine(investor, { t, language });
  if (sent) {
    said.push(sent);
  }
  if (said.length === 0) {
    return null;
  }
  return (
    <span className="text-muted-foreground text-xs">{said.join(" · ")}</span>
  );
};

/** Why the Owner cannot invite somebody, said before she tries: retired, a phone that is not a mobile they could sign
 *  in with, or the portal shut for everybody. The same words the farm refuses with. */
const whyNoInvite = (investor: Investor, portalOpen: boolean) => {
  if (investor.retiredAt) {
    return REFUSALS.investor_retired;
  }
  if (!mobileNumberOf(investor.phone)) {
    return REFUSALS.phone_not_mobile;
  }
  // A code given while the portal is shut could not be taken up, and would only run out in their hand.
  if (!portalOpen) {
    return REFUSALS.portal_closed;
  }
  return null;
};

/** One thing the Owner switches for invited Investors, as a row of the card that holds them all: what it is and where
 *  it stands, what that means, and the act that switches it. */
const SwitchRow = ({
  title,
  badge,
  hint,
  action,
  children,
}: {
  title: string;
  badge: ReactNode;
  hint: string;
  action: ReactNode;
  children: ReactNode;
}) => (
  <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
    <div className="flex min-w-0 flex-col gap-1">
      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
        {title}
        {badge}
      </p>
      <p className="text-muted-foreground max-w-prose text-sm">{hint}</p>
    </div>
    <div className="shrink-0">{action}</div>
    {children}
  </div>
);

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
    <SwitchRow
      action={
        open ? (
          <Button
            disabled={turning.isPending}
            onClick={() => turning.mutate({ open: false })}
            size="sm"
            type="button"
            variant="outline"
          >
            <DoorClosed aria-hidden data-icon="inline-start" />
            {t("portal.shutIt")}
          </Button>
        ) : (
          <Button
            onClick={() => setAsking(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            <DoorOpen aria-hidden data-icon="inline-start" />
            {t("portal.openIt")}
          </Button>
        )
      }
      badge={
        <StatusBadge tone={open ? "success" : "neutral"}>
          {t(open ? "portal.isOpen" : "portal.isShut")}
        </StatusBadge>
      }
      hint={t(open ? "portal.openHint" : "portal.shutHint")}
      title={t("portal.title")}
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
    </SwitchRow>
  );
};

/** Which of the farm's two ways a Signing Code goes by, said as what in-app agreeing still needs (ADR 0022). */
const WAYS_SAID = {
  both: "agreeInApp.ways.both",
  sms: "agreeInApp.ways.smsOnly",
  email: "agreeInApp.ways.emailOnly",
  none: "agreeInApp.ways.none",
} as const;

/** The ways the farm can send a Signing Code, as one word for what the screens say. */
export const waysOf = (codesBy: { sms: boolean; email: boolean }) => {
  if (codesBy.sms && codesBy.email) {
    return "both";
  }
  if (codesBy.sms) {
    return "sms";
  }
  return codesBy.email ? "email" : "none";
};

/**
 * How the farm sends the codes that seal a paper agreed in the app — a text gateway, an email sender — and what in-app
 * agreeing still needs where it has neither. Set at deploy, not here; said under the switch so turning it on is not a
 * surprise. Nothing on an answer cached before the farm said.
 */
export const SigningCodeWays = ({
  codesBy,
}: {
  codesBy: { sms: boolean; email: boolean } | undefined;
}) => {
  const { t } = useLanguage();
  if (!codesBy) {
    return null;
  }
  return (
    <p className="text-muted-foreground py-3 text-sm">
      {t(WAYS_SAID[waysOf(codesBy)])}
    </p>
  );
};

/**
 * Whether one Investor can agree to a paper in the app now, said only while the farm's switch is on and they are in the
 * portal: their consent carries the signing clause, and a code has a way to reach them — or what is missing.
 */
export const AgreeingReadiness = ({ investor }: { investor: Investor }) => {
  const { t } = useLanguage();
  const consent = investor.portalConsent ?? null;
  const { codesBy } = investor;
  if (standingOf(investor) !== "in" || !consent || !codesBy) {
    return null;
  }
  const ways = waysOf(codesBy);
  let said: string;
  if (consent.signsInApp === false) {
    said = t("agreeInApp.ready.noClause");
  } else if (ways === "none") {
    said = t("agreeInApp.ready.noWay");
  } else {
    said = t(`agreeInApp.ready.${ways}`);
  }
  return <p className="text-muted-foreground text-sm">{said}</p>;
};

/** One thing the Owner shows invited Investors or keeps from them, each behind the advisers: its words, and the act
 *  that switches it. */
const SHOWN = {
  projections: {
    set: orpc.investors.setProjectionsShown,
    title: "projection.switch.title",
    show: "projection.switch.show",
    hide: "projection.switch.hide",
    shownHint: "projection.switch.shownHint",
    hiddenHint: "projection.switch.hiddenHint",
    confirmTitle: "projection.switch.confirmTitle",
    confirmWhy: "projection.switch.confirmWhy",
    shownDone: "projection.switch.shownDone",
    hiddenDone: "projection.switch.hiddenDone",
  },
  agreements: {
    set: orpc.investors.setAgreementsInApp,
    title: "agreeInApp.switch.title",
    show: "agreeInApp.switch.show",
    hide: "agreeInApp.switch.hide",
    shownHint: "agreeInApp.switch.shownHint",
    hiddenHint: "agreeInApp.switch.hiddenHint",
    confirmTitle: "agreeInApp.switch.confirmTitle",
    confirmWhy: "agreeInApp.switch.confirmWhy",
    shownDone: "agreeInApp.switch.shownDone",
    hiddenDone: "agreeInApp.switch.hiddenDone",
  },
  returns: {
    set: orpc.investors.setReturnsShown,
    title: "returns.switch.title",
    show: "returns.switch.show",
    hide: "returns.switch.hide",
    shownHint: "returns.switch.shownHint",
    hiddenHint: "returns.switch.hiddenHint",
    confirmTitle: "returns.switch.confirmTitle",
    confirmWhy: "returns.switch.confirmWhy",
    shownDone: "returns.switch.shownDone",
    hiddenDone: "returns.switch.hiddenDone",
  },
  payInNotes: {
    set: orpc.investors.setPayInNotes,
    title: "payInNote.switch.title",
    show: "payInNote.switch.show",
    hide: "payInNote.switch.hide",
    shownHint: "payInNote.switch.shownHint",
    hiddenHint: "payInNote.switch.hiddenHint",
    confirmTitle: "payInNote.switch.confirmTitle",
    confirmWhy: "payInNote.switch.confirmWhy",
    shownDone: "payInNote.switch.shownDone",
    hiddenDone: "payInNote.switch.hiddenDone",
  },
} as const;

type Shown = keyof typeof SHOWN;

/**
 * Whether invited Investors are shown each Venture's **Projection** (ADR 0010), or a settled Venture's **Return on
 * Capital** (ADR 0012). Showing either is asked about first, since the lawyer and the Shariah scholar approved the
 * portal without them; hiding it again takes nothing away. The Owner reads both in the Portal Preview meanwhile.
 */
export const ShownToInvestorsSwitch = ({
  what,
  shown,
}: {
  what: Shown;
  shown: boolean;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const words = SHOWN[what];
  const [asking, setAsking] = useState(false);
  const turning = useMutation(
    words.set.mutationOptions({
      onError: refused,
      onSuccess: (done) => {
        setAsking(false);
        toast.success(t(done.shown ? words.shownDone : words.hiddenDone));
      },
    })
  );
  return (
    <SwitchRow
      action={
        shown ? (
          <Button
            disabled={turning.isPending}
            onClick={() => turning.mutate({ shown: false })}
            size="sm"
            type="button"
            variant="outline"
          >
            <EyeOff aria-hidden data-icon="inline-start" />
            {t(words.hide)}
          </Button>
        ) : (
          <Button
            onClick={() => setAsking(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            <TrendingUp aria-hidden data-icon="inline-start" />
            {t(words.show)}
          </Button>
        )
      }
      badge={
        <StatusBadge tone={shown ? "warning" : "neutral"}>
          {t(shown ? "projection.switch.shown" : "projection.switch.hidden")}
        </StatusBadge>
      }
      hint={t(shown ? words.shownHint : words.hiddenHint)}
      title={t(words.title)}
    >
      <ConfirmDialog
        confirmLabel={t(words.show)}
        description={t(words.confirmWhy)}
        onConfirm={() => turning.mutate({ shown: true })}
        onOpenChange={setAsking}
        open={asking}
        pending={turning.isPending}
        title={t(words.confirmTitle)}
      />
    </SwitchRow>
  );
};

/**
 * The code, shown once, to hand over in person with the address it is taken up at — and the paper it goes out with,
 * printed while it is on the screen: the Welcome Letter until they have been handed one, the Code Slip alone with every
 * code after. Neither can be printed once this closes, since the farm keeps only the code's hash.
 */
const CodeDialog = ({
  investorId,
  given,
  onClose,
}: {
  investorId: string;
  given: GivenCode | null;
  onClose: () => void;
}) => {
  const { t, language } = useLanguage();
  const refused = useRefused(REFUSALS, TO_THE_KEEPERS);
  // The paper laid out round the code, set off the screen to print alone.
  const [laidOut, setLaidOut] = useState<HandedOverPaper | null>(null);
  const [paperLanguage, setPaperLanguage] = useState<Language>(language);
  // The letter names the portal's own buttons in the language it is printed in: those words fetched before it is.
  const wordsHeld = useWordsIn(paperLanguage);
  const handing = useMutation(
    orpc.investors.handOver.mutationOptions({
      onError: refused,
      onSuccess: (laid, asked) => {
        // Set on the page first, then printed from there.
        flushSync(() => setLaidOut(laid));
        const shown = document.querySelector<HTMLElement>(`#${HANDED_OVER_ID}`);
        if (shown) {
          void printAlone(shown, CODE_PAPER[asked.paper].page);
        }
      },
    })
  );
  const printed = CODE_PAPER[given?.paper ?? "code_slip"];
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
            <dd className="font-mono break-all">
              {portalAddress(given?.portalOrigin ?? null, "/join")}
            </dd>
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
          {/* The paper is printed in the language the Investor reads, which the Owner chooses here. */}
          <PaperLanguageSwitch
            language={paperLanguage}
            onChange={setPaperLanguage}
          />
          <Button
            disabled={handing.isPending || !wordsHeld}
            onClick={() =>
              given && handing.mutate({ id: investorId, paper: given.paper })
            }
            type="button"
          >
            {handing.isPending ? (
              <Spinner />
            ) : (
              <Printer aria-hidden data-icon="inline-start" />
            )}
            {t(printed.print)}
          </Button>
          <p className="text-muted-foreground text-xs">{t(printed.hint)}</p>
        </div>
        {given && laidOut ? (
          <div className="hidden">
            <printed.Paper
              given={given}
              language={paperLanguage}
              paper={laidOut}
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

/** Why the Owner takes somebody's access away, as the farm is asked it. */
type TakenAwayWhy = Parameters<
  typeof client.investors.takePortalAway
>[0]["why"];

/** Whether they have access standing to take away: in, invited, or holding a code that ran out. */
const hasAccessToTake = (standing: PortalStanding) =>
  standing === "in" || standing === "invited" || standing === "code_ran_out";

/** Whether a withdrawal can be recorded for them: a consent in force, whatever their access. */
const canWithdraw = (investor: Investor) =>
  (investor.portalConsent ?? null) !== null;

/** Why the Owner takes somebody's access away, in the order the dialog offers them. */
const WHY = [
  "withdrew_consent",
  "lost_phone",
  "owner",
] as const satisfies readonly TakenAwayWhy["reason"][];
type Why = (typeof WHY)[number];

/** How somebody asked to withdraw their consent. */
const HOW = ["letter", "message"] as const satisfies readonly Extract<
  TakenAwayWhy,
  { reason: "withdrew_consent" }
>["how"][];
type How = (typeof HOW)[number];

/**
 * Taking an Investor's access away, saying why. "They withdrew their consent" asks the day they asked and how, and
 * marks the consent withdrawn — so coming back means a new one signed; it is offered only while they have one in
 * force. A lost phone or the Owner's own decision leaves the consent standing.
 */
const TakeAwayDialog = ({
  investor,
  open,
  onOpenChange,
}: {
  investor: Investor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const refused = useRefused(REFUSALS, TO_THE_KEEPERS);
  const [why, setWhy] = useState<Why | "">("");
  const [askedOn, setAskedOn] = useState(() => farmDayOf(new Date()));
  const [how, setHow] = useState<How | "">("");
  // Closed, it forgets what was chosen: the next time it asks afresh.
  const setOpen = (stays: boolean) => {
    if (!stays) {
      setWhy("");
      setHow("");
      setAskedOn(farmDayOf(new Date()));
    }
    onOpenChange(stays);
  };
  const takingAway = useMutation(
    orpc.investors.takePortalAway.mutationOptions({
      onError: refused,
      onSuccess: () => {
        setOpen(false);
        toast.success(t("portal.takenAway"));
      },
    })
  );
  const offered = WHY.filter((one) =>
    one === "withdrew_consent"
      ? canWithdraw(investor)
      : hasAccessToTake(standingOf(investor))
  );
  const withdrew = why === "withdrew_consent";
  const ready = withdrew ? askedOn !== "" && how !== "" : why !== "";
  const submit = () => {
    if (why === "withdrew_consent" && how !== "") {
      takingAway.mutate({
        id: investor.id,
        why: { reason: why, on: askedOn, how },
      });
    } else if (why === "lost_phone" || why === "owner") {
      takingAway.mutate({ id: investor.id, why: { reason: why } });
    }
  };
  return (
    <FormDialog
      description={t("portal.takeAwayWhy")}
      onOpenChange={setOpen}
      onSubmit={submit}
      open={open}
      pending={takingAway.isPending}
      ready={ready}
      submitLabel={t("portal.takeAway")}
      title={t("portal.takeAwayTitle", { name: investor.name })}
    >
      <FormField
        hint={
          why === ""
            ? undefined
            : t(
                withdrew ? "portal.why.withdrawHint" : "portal.why.keepsConsent"
              )
        }
        id="take-away-why"
        label={t("portal.why.label")}
      >
        <NativeSelect
          id="take-away-why"
          onChange={(event) =>
            setWhy(WHY.find((one) => one === event.target.value) ?? "")
          }
          value={why}
        >
          <option disabled value="">
            {t("portal.why.choose")}
          </option>
          {offered.map((one) => (
            <option key={one} value={one}>
              {t(`portal.why.${one}`)}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      {withdrew ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="take-away-on" label={t("portal.withdrawnOn")}>
            <Input
              id="take-away-on"
              max={farmDayOf(new Date())}
              min={investor.portalConsent?.signedOn}
              onChange={(event) => setAskedOn(event.target.value)}
              required
              type="date"
              value={askedOn}
            />
          </FormField>
          <FormField id="take-away-how" label={t("portal.withdrawnHow")}>
            <NativeSelect
              id="take-away-how"
              onChange={(event) =>
                setHow(HOW.find((one) => one === event.target.value) ?? "")
              }
              value={how}
            >
              <option disabled value="">
                {t("portal.why.choose")}
              </option>
              {HOW.map((one) => (
                <option key={one} value={one}>
                  {t(`portal.how.${one}`)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </div>
      ) : null}
    </FormDialog>
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
  const refused = useRefused(REFUSALS, TO_THE_KEEPERS);
  const [given, setGiven] = useState<GivenCode | null>(null);
  const [asking, setAsking] = useState(false);
  // The consent sheet on screen to print, before any code: nothing while the Investor has signed one already.
  const [sheet, setSheet] = useState<PaperDocument | null>(null);
  const inviting = useMutation(
    orpc.investors.inviteToPortal.mutationOptions({
      onError: refused,
      onSuccess: setGiven,
    })
  );
  const sending = useMutation(
    orpc.investors.sendNewCode.mutationOptions({
      onError: refused,
      onSuccess: (sent) =>
        toast.success(t("portal.codeSent", { ways: sentWays(sent, t) })),
    })
  );
  const printing = useMutation(
    orpc.investors.consentSheet.mutationOptions({
      onError: refused,
      onSuccess: ({ document }) => setSheet(document),
    })
  );
  // Signing the new consent in place of one without the signing clause gives no code: their access stands as it was.
  const [replacing, setReplacing] = useState(false);
  const consenting = useMutation(
    orpc.investors.recordConsent.mutationOptions({
      onError: refused,
      onSuccess: () => {
        setSheet(null);
        if (replacing) {
          setReplacing(false);
          toast.success(t("portal.consent.replaced"));
          return;
        }
        inviting.mutate({ id: investor.id });
      },
    })
  );
  // No code before consent: somebody who has not signed one is handed the sheet first.
  const hasConsent = (investor.portalConsent ?? null) !== null;
  const lacksSigningClause = investor.portalConsent?.signsInApp === false;
  const invite = () =>
    hasConsent
      ? inviting.mutate({ id: investor.id })
      : printing.mutate({ id: investor.id });
  const standing = standingOf(investor);
  const inviteWord = standing === "none" ? "portal.invite" : "portal.newCode";
  const whyNot = whyNoInvite(investor, portalOpen);
  // A code that could reach them by no way at all is handed over in person: said beside the button, not pressed into.
  const noWayToSend =
    investor.codesBy !== undefined && waysOf(investor.codesBy) === "none";
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
      {/* One under another, the width of the column they sit in: three buttons of different lengths wrapped two and
          one, which read as two groups where there is one. */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
        <Button
          className="justify-start"
          disabled={whyNot !== null || inviting.isPending || printing.isPending}
          onClick={invite}
          size="sm"
          type="button"
          variant="outline"
        >
          <KeyRound aria-hidden data-icon="inline-start" />
          {t(inviteWord)}
        </Button>
        {maySendCode(standing) ? (
          <Button
            className="justify-start"
            disabled={whyNot !== null || noWayToSend || sending.isPending}
            onClick={() => sending.mutate({ id: investor.id })}
            size="sm"
            title={t("portal.sendCodeHint")}
            type="button"
            variant="outline"
          >
            <Send aria-hidden data-icon="inline-start" />
            {t("portal.sendCode")}
          </Button>
        ) : null}
        <Link
          className={cn(
            buttonVariants({ size: "sm", variant: "outline" }),
            "justify-start"
          )}
          params={{ investorId: investor.id }}
          title={t("portal.preview.seeAsTheyDoHint")}
          to="/investors/$investorId/portal-preview"
        >
          <Eye aria-hidden data-icon="inline-start" />
          {t("portal.preview.seeAsTheyDo")}
        </Link>
        {lacksSigningClause ? (
          <Button
            className="justify-start"
            disabled={printing.isPending}
            onClick={() => {
              setReplacing(true);
              printing.mutate({ id: investor.id });
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            <FileSignature aria-hidden data-icon="inline-start" />
            {t("portal.consent.signNew")}
          </Button>
        ) : null}
        {hasAccessToTake(standing) || canWithdraw(investor) ? (
          <Button
            className="text-danger hover:text-danger justify-start"
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
      {whyNot === null && noWayToSend && maySendCode(standing) ? (
        <p className="text-muted-foreground text-sm">
          {t(REFUSALS.no_way_to_send_a_code)}
        </p>
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
      <TakeAwayDialog
        investor={investor}
        onOpenChange={setAsking}
        open={asking}
      />
    </div>
  );
};
