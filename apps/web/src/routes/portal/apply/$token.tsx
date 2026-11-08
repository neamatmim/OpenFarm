import { farmDayOf } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Checkbox } from "@OpenFarm/ui/components/checkbox";
import { Input } from "@OpenFarm/ui/components/input";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { Textarea } from "@OpenFarm/ui/components/textarea";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Camera,
  Check,
  CircleCheck,
  Clock,
  FileText,
  IdCard,
  Mail,
  MailCheck,
  MessageSquareLock,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { CODE_FIELD } from "@/components/door-screen";
import type { NomineeDraft } from "@/components/investors/nominee-draft";
import {
  draftsProblem,
  nomineesOf,
} from "@/components/investors/nominee-draft";
import { NomineesForm } from "@/components/investors/nominees-form";
import { FLOW_CARD, FlowHead, Notice, Section } from "@/components/page";
import { FormField, InsetPanel } from "@/components/page-kit";
import { PortalDoor } from "@/components/portal/portal-door";
import { PaperDesk } from "@/components/ventures/paper-dialog";
import { PaperDocumentView } from "@/components/ventures/paper-document";
import { useLanguage } from "@/i18n/language-provider";
import type { Photo } from "@/lib/photo";
import { photoProblem, shrink } from "@/lib/photo";
import { sayWhy } from "@/lib/saying";
import { orpc } from "@/utils/orpc";

// Applying by an Application Link (ADR 0034), for somebody the Owner knows and who has never signed in: a code sent to
// the link's email (and its mobile, once the farm can text) opens it; they fill in their own details and photograph
// their NID; they read the Portal Consent laid out from what they wrote and agree it with a tick (the Owner, 2026-11-08).
// Nothing of the portal beyond that.

/** Why the farm would not take a step, in the applicant's words. */
const REFUSALS: Record<string, MessageKey> = {
  link_opens_nothing: "portal.apply.refused.opensNothing",
  sitting_ended: "portal.apply.refused.sittingEnded",
  wrong_code: "portal.refused.wrongCode",
  code_used: "portal.apply.refused.codeUsed",
  code_expired: "portal.apply.refused.codeExpired",
  too_many_codes: "portal.apply.refused.tooManyCodes",
  code_sent_just_now: "portal.apply.refused.sentJustNow",
  code_not_sent: "portal.apply.refused.notSent",
  application_incomplete: "portal.apply.refused.incomplete",
  photos_missing: "portal.apply.refused.photosMissing",
  consent_changed: "portal.apply.refused.consentChanged",
  application_kind_fixed: "portal.apply.refused.kindFixed",
  farm_identity_incomplete: "portal.apply.refused.opensNothing",
};

/** How long after one code another may be asked for: the farm sends one a minute. */
const RESEND_AFTER_MS = 60_000;

/** The sitting's key, kept in this tab alone so a page read afresh need not ask for another code. */
const keyPlace = (token: string) => `openfarm-apply:${token}`;
const keptKey = (token: string): string | null => {
  try {
    return sessionStorage.getItem(keyPlace(token));
  } catch {
    return null;
  }
};
const keepKey = (token: string, key: string | null) => {
  try {
    if (key) {
      sessionStorage.setItem(keyPlace(token), key);
    } else {
      sessionStorage.removeItem(keyPlace(token));
    }
  } catch {
    // A tab that keeps nothing asks for a new code after a reload; nothing else is lost.
  }
};

/** What the person writes about themselves, for either kind: the record sheet's boxes, the mobile left out. */
interface Filled {
  name: string;
  email: string;
  address: string;
  nid: string;
  bankAccount: string;
  tradeLicense: string;
  rjscNumber: string;
  tin: string;
  authority: string;
  authorityOn: string;
  signatoryName: string;
  signatoryNid: string;
  signatoryRole: string;
}

const NOTHING_FILLED: Filled = {
  name: "",
  email: "",
  address: "",
  nid: "",
  bankAccount: "",
  tradeLicense: "",
  rjscNumber: "",
  tin: "",
  authority: "",
  authorityOn: "",
  signatoryName: "",
  signatoryNid: "",
  signatoryRole: "",
};

type Kind = "person" | "organization";

/** One box of the form: the words over it, any help under it or inside it, and how it is typed. */
interface Box {
  field: keyof Filled;
  label: MessageKey;
  hint?: MessageKey;
  placeholder?: MessageKey;
  /** A paragraph rather than a line, across the whole width. */
  long?: boolean;
  /** Across the whole width, though one line. */
  wide?: boolean;
  type?: "email" | "date";
  numeric?: boolean;
  optional?: boolean;
}

/** A part of the form under its own heading; the one that says how they are reached shows their mobile too. */
interface Group {
  title: MessageKey;
  boxes: readonly Box[];
  withMobile?: boolean;
}

/** The boxes each kind fills in, grouped as somebody thinks of them: who they are, how they are reached, where they
 *  are paid — an Organization's own papers and its Signatory's apart. */
const GROUPS: Record<Kind, readonly Group[]> = {
  person: [
    {
      title: "portal.apply.group.who",
      boxes: [
        { field: "name", label: "investors.name" },
        {
          field: "nid",
          label: "investors.nid",
          hint: "portal.apply.hint.nid",
          numeric: true,
        },
      ],
    },
    {
      title: "portal.apply.group.reach",
      withMobile: true,
      boxes: [
        { field: "address", label: "investors.address", long: true },
        {
          field: "email",
          label: "investors.applications.field.email",
          hint: "portal.apply.hint.email",
          type: "email",
        },
      ],
    },
    {
      title: "portal.apply.group.paid",
      boxes: [
        {
          field: "bankAccount",
          label: "investors.bank",
          hint: "portal.apply.hint.bank",
          placeholder: "investors.bankPlaceholder",
          long: true,
        },
      ],
    },
  ],
  organization: [
    {
      title: "portal.apply.group.organization",
      boxes: [
        { field: "name", label: "investors.organizationName", wide: true },
        { field: "tradeLicense", label: "investors.tradeLicense" },
        { field: "rjscNumber", label: "investors.rjscNumber", optional: true },
        { field: "tin", label: "investors.tin", numeric: true, optional: true },
        { field: "address", label: "investors.address", long: true },
      ],
    },
    {
      title: "portal.apply.group.signatory",
      withMobile: true,
      boxes: [
        { field: "signatoryName", label: "investors.signatoryName" },
        {
          field: "signatoryRole",
          label: "investors.signatoryRole",
          placeholder: "investors.signatoryRolePlaceholder",
          optional: true,
        },
        {
          field: "signatoryNid",
          label: "investors.signatoryNid",
          hint: "portal.apply.hint.nid",
          numeric: true,
        },
        {
          field: "authority",
          label: "investors.authority",
          placeholder: "investors.authorityPlaceholder",
        },
        {
          field: "authorityOn",
          label: "investors.authorityOn",
          type: "date",
          optional: true,
        },
        {
          field: "email",
          label: "investors.applications.field.email",
          hint: "portal.apply.hint.email",
          type: "email",
        },
      ],
    },
    {
      title: "portal.apply.group.paid",
      boxes: [
        {
          field: "bankAccount",
          label: "investors.bank",
          hint: "portal.apply.hint.bank",
          placeholder: "investors.bankPlaceholder",
          long: true,
        },
      ],
    },
  ],
};

type PhotoKind = "nid_front" | "nid_back" | "trade_license" | "authority";

const PHOTOS: Record<Kind, readonly PhotoKind[]> = {
  person: ["nid_front", "nid_back"],
  organization: ["nid_front", "nid_back", "trade_license", "authority"],
};

const PHOTO_WORDS: Record<PhotoKind, MessageKey> = {
  nid_front: "investors.applications.photo.nid_front",
  nid_back: "investors.applications.photo.nid_back",
  trade_license: "investors.applications.photo.trade_license",
  authority: "investors.applications.photo.authority",
};

/** What makes a photograph the Owner can check a number against. */
const PHOTO_TIPS: readonly MessageKey[] = [
  "portal.apply.tip.whole",
  "portal.apply.tip.sharp",
  "portal.apply.tip.glare",
];

/** The three parts of the form, each a place on the page to go to. */
const STEPS = [
  { id: "apply-details", label: "portal.apply.step.details" },
  { id: "apply-photos", label: "portal.apply.step.photos" },
  { id: "apply-consent", label: "portal.apply.step.consent" },
] as const satisfies readonly { id: string; label: MessageKey }[];

/** A box's text, or nothing where it is empty, as the farm takes it. */
const given = (text: string) => (text.trim() === "" ? undefined : text.trim());

/** Whether a box has anything in it. */
const has = (text: string) => text.trim() !== "";

/** The record as the farm takes it, for the kind the link was made for. */
const recordOf = (kind: Kind, filled: Filled) =>
  kind === "organization"
    ? {
        kind,
        name: filled.name.trim(),
        email: given(filled.email),
        address: given(filled.address),
        bankAccount: given(filled.bankAccount),
        tradeLicense: given(filled.tradeLicense),
        rjscNumber: given(filled.rjscNumber),
        tin: given(filled.tin),
        authority: filled.authority.trim(),
        authorityOn: given(filled.authorityOn),
        signatoryName: filled.signatoryName.trim(),
        signatoryNid: given(filled.signatoryNid),
        signatoryRole: given(filled.signatoryRole),
      }
    : {
        kind,
        name: filled.name.trim(),
        email: given(filled.email),
        address: given(filled.address),
        nid: given(filled.nid),
        bankAccount: given(filled.bankAccount),
      };

/** Whether a kind's details are all in that the farm asks of somebody it will not meet. */
const detailsIn = (kind: Kind, filled: Filled): boolean => {
  const common =
    has(filled.name) && has(filled.address) && has(filled.bankAccount);
  return kind === "person"
    ? common && has(filled.nid)
    : common &&
        has(filled.tradeLicense) &&
        has(filled.signatoryName) &&
        has(filled.signatoryNid) &&
        has(filled.authority);
};

/** The ways a code goes, mostly hidden: a line each, the email first, since the farm cannot text yet. */
const CodeWays = ({
  ways,
}: {
  ways: { bySms: string | null; byEmail: string | null };
}) => (
  <ul className="flex flex-col gap-2 text-sm">
    {ways.byEmail ? (
      <li className="flex items-center gap-2">
        <Mail aria-hidden className="text-muted-foreground size-4 shrink-0" />
        <span className="font-medium break-all">{ways.byEmail}</span>
      </li>
    ) : null}
    {ways.bySms ? (
      <li className="flex items-center gap-2">
        <Smartphone
          aria-hidden
          className="text-muted-foreground size-4 shrink-0"
        />
        <span className="font-medium tabular-nums">{ways.bySms}</span>
      </li>
    ) : null}
  </ul>
);

/** The code box, the same as the portal's join page draws one. */
const CodeBox = ({
  id,
  code,
  onCode,
}: {
  id: string;
  code: string;
  onCode: (code: string) => void;
}) => {
  const { t } = useLanguage();
  return (
    <FormField id={id} label={t("portal.apply.code")}>
      <Input
        autoComplete="one-time-code"
        className={CODE_FIELD}
        id={id}
        inputMode="numeric"
        maxLength={12}
        onChange={(event) => onCode(event.target.value)}
        value={code}
      />
    </FormField>
  );
};

/** The seconds left before another code may be asked for, counted down while there are any. */
const useWaitToResend = (sentAt: number | null): number => {
  // The clock as last ticked; before its first tick, the moment the code went.
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (sentAt === null) {
      return;
    }
    const ticking = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(ticking);
  }, [sentAt]);
  if (sentAt === null) {
    return 0;
  }
  const at = Math.max(now, sentAt);
  return Math.max(0, Math.ceil((sentAt + RESEND_AFTER_MS - at) / 1000));
};

/** The way to ask for another code: waiting out the minute the farm takes between two, said in seconds. */
const SendAgain = ({
  waitSeconds,
  pending,
  onSend,
}: {
  waitSeconds: number;
  pending: boolean;
  onSend: () => void;
}) => {
  const { t, language } = useLanguage();
  return (
    <Button
      className="w-full"
      disabled={pending || waitSeconds > 0}
      onClick={onSend}
      type="button"
      variant="ghost"
    >
      {waitSeconds > 0
        ? t("portal.apply.sendAgainIn", {
            seconds: formatNumber(waitSeconds, language),
          })
        : t("portal.apply.sendAgain")}
    </Button>
  );
};

/** A tinted square with an icon in it, at the head of a short step's card. */
const StepIcon = ({ children }: { children: ReactNode }) => (
  <span className="bg-primary/10 text-primary grid size-11 place-items-center rounded-lg">
    {children}
  </span>
);

/** The first step: the farm's invitation, where the code goes, and the code that opens the link. */
const Opening = ({
  token,
  onOpened,
}: {
  token: string;
  onOpened: (key: string) => void;
}) => {
  const { t, language } = useLanguage();
  const [code, setCode] = useState("");
  const [refused, setRefused] = useState<string | null>(null);
  const link = useQuery({
    ...orpc.portal.applying.open.queryOptions({ input: { token } }),
    retry: false,
  });
  const send = useMutation(
    orpc.portal.applying.sendCode.mutationOptions({
      onSuccess: () => setRefused(null),
      onError: (error) => setRefused(sayWhy(error, t, REFUSALS)),
    })
  );
  const unlock = useMutation(
    orpc.portal.applying.unlock.mutationOptions({
      onSuccess: (answer) => onOpened(answer.key),
      onError: (error) => setRefused(sayWhy(error, t, REFUSALS)),
    })
  );
  const sendOne = () => send.mutate({ token, purpose: "open", language });
  // When the last code went, as the request that sent it was made: the wait for another counts from it.
  const sentAt = send.isSuccess ? send.submittedAt : null;
  const waitSeconds = useWaitToResend(sentAt);
  if (link.isError) {
    return (
      <div className={FLOW_CARD}>
        <FlowHead title={t("portal.apply.title")} />
        <Notice title={t("portal.apply.refused.opensNothing")} tone="warning">
          {t("portal.apply.askTheFarm")}
        </Notice>
      </div>
    );
  }
  return (
    <form
      className={FLOW_CARD}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (code.trim() === "") {
          setRefused(t("portal.apply.enterTheCode"));
          return;
        }
        unlock.mutate({ token, code });
      }}
    >
      <StepIcon>
        <MailCheck aria-hidden className="size-5" />
      </StepIcon>
      <FlowHead
        hint={
          link.data
            ? t("portal.apply.openIntro", { farm: link.data.farmName })
            : undefined
        }
        title={t("portal.apply.title")}
      />
      {link.data ? (
        <InsetPanel className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs">
            {t("portal.apply.codeGoesTo")}
          </p>
          <CodeWays ways={link.data} />
        </InsetPanel>
      ) : null}
      {refused ? (
        <Notice title={t("portal.apply.refusedTitle")} tone="danger">
          {refused}
        </Notice>
      ) : null}
      {sentAt === null ? (
        <Button
          className="h-12 w-full text-base md:h-10 md:text-sm"
          disabled={send.isPending || !link.data}
          onClick={sendOne}
          type="button"
        >
          {send.isPending ? <Spinner /> : <MessageSquareLock aria-hidden />}
          {t("portal.apply.sendMeACode")}
        </Button>
      ) : (
        <>
          <p className="text-success flex items-center gap-2 text-sm">
            <CircleCheck aria-hidden className="size-4 shrink-0" />
            {t("portal.apply.codeSent", { minutes: 10 })}
          </p>
          <CodeBox code={code} id="apply-open-code" onCode={setCode} />
          <Button
            className="h-12 w-full text-base md:h-10 md:text-sm"
            disabled={unlock.isPending}
            type="submit"
          >
            {unlock.isPending ? <Spinner /> : null}
            {t("portal.apply.open")}
          </Button>
          <SendAgain
            onSend={sendOne}
            pending={send.isPending}
            waitSeconds={waitSeconds}
          />
        </>
      )}
    </form>
  );
};

/**
 * One photograph to take or choose: the tile itself is what is pressed, showing the photograph once taken, with a way
 * to put another in its place.
 */
const PhotoBox = ({
  what,
  photo,
  onPhoto,
}: {
  what: PhotoKind;
  photo: Photo | undefined;
  onPhoto: (photo: Photo) => void;
}) => {
  const { t } = useLanguage();
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = `apply-photo-${what}`;
  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-center gap-1.5 text-sm font-medium">
        {photo ? (
          <CircleCheck aria-hidden className="text-success size-4" />
        ) : null}
        {t(PHOTO_WORDS[what])}
      </span>
      <label
        className={cn(
          "group bg-muted/40 has-[:focus-visible]:ring-ring relative grid aspect-[3/2] cursor-pointer place-items-center overflow-hidden rounded-lg border transition-colors has-[:focus-visible]:ring-2",
          photo
            ? "border-solid"
            : "hover:border-primary hover:bg-primary/5 border-dashed"
        )}
        htmlFor={id}
      >
        {photo ? (
          <img
            alt={t(PHOTO_WORDS[what])}
            className="size-full object-contain"
            src={`data:${photo.contentType};base64,${photo.data}`}
          />
        ) : (
          <span className="text-muted-foreground group-hover:text-primary flex flex-col items-center gap-2 px-4 text-center text-sm">
            {busy ? <Spinner /> : <IdCard aria-hidden className="size-9" />}
            <span className="font-medium">{t("portal.apply.photoAdd")}</span>
          </span>
        )}
        <input
          accept="image/*"
          className="sr-only"
          disabled={busy}
          id={id}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) {
              return;
            }
            setBusy(true);
            const taken = await shrink(file).catch((error: unknown) => error);
            setBusy(false);
            if (taken instanceof Error) {
              setProblem(t(photoProblem(taken)));
              return;
            }
            onPhoto(taken as Photo);
            setProblem(null);
          }}
          type="file"
        />
      </label>
      {photo ? (
        <label
          className="text-primary flex w-fit cursor-pointer items-center gap-1.5 text-sm font-medium hover:underline"
          htmlFor={id}
        >
          <Camera aria-hidden className="size-4" />
          {t("portal.apply.photoChange")}
        </label>
      ) : null}
      {problem ? <p className="text-destructive text-sm">{problem}</p> : null}
    </div>
  );
};

/** One step's mark: a tick once done, its number otherwise, filled where the reader is now. */
const StepMark = ({
  number,
  state,
}: {
  number: number;
  state: "done" | "now" | "later";
}) => {
  const { language } = useLanguage();
  return (
    <span
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums",
        state === "done" && "bg-success text-success-foreground",
        state === "now" && "bg-primary text-primary-foreground",
        state === "later" && "bg-muted text-muted-foreground ring-border ring-1"
      )}
    >
      {state === "done" ? (
        <Check aria-hidden className="size-4" />
      ) : (
        formatNumber(number, language)
      )}
    </span>
  );
};

/** Each step's state: done, the first not done, or still to come. */
const statesOf = (done: readonly boolean[]) => {
  const first = done.indexOf(false);
  return done.map((one, index) => {
    if (one) {
      return "done" as const;
    }
    return index === first ? ("now" as const) : ("later" as const);
  });
};

/**
 * The three steps, each a link to its part of the page: down the side on a desk's screen, beside the form as it is
 * scrolled; across the top on a phone.
 */
const StepList = ({
  done,
  across = false,
}: {
  done: readonly boolean[];
  across?: boolean;
}) => {
  const { t } = useLanguage();
  const states = statesOf(done);
  return (
    <nav aria-label={t("portal.apply.steps")}>
      <ol
        className={cn(
          across ? "flex items-center gap-2" : "flex flex-col gap-1"
        )}
      >
        {STEPS.map((step, index) => (
          <li
            className={cn(across && "flex min-w-0 flex-1 items-center gap-2")}
            key={step.id}
          >
            <a
              aria-current={states[index] === "now" ? "step" : undefined}
              className={cn(
                "hover:bg-muted flex min-w-0 items-center gap-3 rounded-lg p-2 transition-colors",
                states[index] === "now" && !across && "bg-muted"
              )}
              href={`#${step.id}`}
            >
              <StepMark number={index + 1} state={states[index] ?? "later"} />
              <span className="flex min-w-0 flex-col">
                <span
                  className={cn(
                    "truncate text-sm font-medium",
                    states[index] === "later" && "text-muted-foreground"
                  )}
                >
                  {t(step.label)}
                </span>
                {across ? null : (
                  <span className="text-muted-foreground text-xs">
                    {t(`portal.apply.stepState.${states[index] ?? "later"}`)}
                  </span>
                )}
              </span>
            </a>
            {across && index < STEPS.length - 1 ? (
              <span aria-hidden className="bg-border h-px min-w-3 flex-1" />
            ) : null}
          </li>
        ))}
      </ol>
    </nav>
  );
};

/** When the sitting ends, on the farm's clock: the form is open until then, and nothing is kept before it is sent. */
const SittingNote = ({ endsAt }: { endsAt: Date | null }) => {
  const { t, language } = useLanguage();
  return (
    <div className="text-muted-foreground flex flex-col gap-2 text-xs">
      {endsAt ? (
        <p className="flex items-start gap-2">
          <Clock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {t("portal.apply.openUntil", {
            time: formatDate(new Date(endsAt), language, "time"),
          })}
        </p>
      ) : null}
      <p className="flex items-start gap-2">
        <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        {t("portal.apply.nothingKept")}
      </p>
    </div>
  );
};

/** A part's title with its step's mark beside it. */
const PartTitle = ({
  number,
  done,
  label,
}: {
  number: number;
  done: boolean;
  label: string;
}) => (
  <span className="flex items-center gap-2.5">
    <StepMark number={number} state={done ? "done" : "later"} />
    {label}
  </span>
);

/** A field's label, with the word for optional beside one the farm does not need. */
const LabelOf = ({ box }: { box: Box }) => {
  const { t } = useLanguage();
  return (
    <>
      {t(box.label)}
      {box.optional ? (
        <span className="text-muted-foreground ms-1.5 font-normal">
          · {t("portal.apply.optional")}
        </span>
      ) : null}
    </>
  );
};

/** The consent, as laid out from what they wrote, with the moment it was laid out and its fingerprint. */
type Read = Awaited<ReturnType<typeof orpc.portal.applying.consent.call>>;

/** What the form opens on, for a sitting still open. */
type Opened = Awaited<ReturnType<typeof orpc.portal.applying.form.call>>;

/**
 * The sitting's form, once the farm has said what it opens on — or, for a sitting that has ended, the way back to a new
 * code.
 */
const Applying = ({
  token,
  sittingKey,
  onEnded,
  onSent,
}: {
  token: string;
  sittingKey: string;
  onEnded: () => void;
  onSent: () => void;
}) => {
  const { t } = useLanguage();
  const form = useQuery({
    ...orpc.portal.applying.form.queryOptions({
      input: { token, key: sittingKey },
    }),
    retry: false,
  });
  if (form.isError) {
    return (
      <div className="mx-auto w-full max-w-md">
        <div className={FLOW_CARD}>
          <StepIcon>
            <Clock aria-hidden className="size-5" />
          </StepIcon>
          <FlowHead
            hint={t("portal.apply.askForANewCode")}
            title={t("portal.apply.refused.sittingEnded")}
          />
          <Button
            className="h-12 w-full md:h-10"
            onClick={onEnded}
            type="button"
          >
            <MessageSquareLock aria-hidden />
            {t("portal.apply.sendMeACode")}
          </Button>
        </div>
      </div>
    );
  }
  if (!form.data) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner />
      </div>
    );
  }
  return (
    <Filling
      onSent={onSent}
      opened={form.data}
      sittingKey={sittingKey}
      token={token}
    />
  );
};

/**
 * The form, then the consent: their own details in parts as they think of them, starting from what the Owner wrote
 * them down as, the Nominees they would name, the photographs, and — once all of it is there — the Portal Consent laid
 * out from it, to read and agree with a tick. The steps run down the side on a desk's screen.
 */
const Filling = ({
  token,
  sittingKey,
  opened,
  onSent,
}: {
  token: string;
  sittingKey: string;
  opened: Opened;
  onSent: () => void;
}) => {
  const { t, language } = useLanguage();
  const [filled, setFilled] = useState<Filled>(() => ({
    ...NOTHING_FILLED,
    name: opened.name,
    email: opened.email ?? "",
  }));
  const [nominees, setNominees] = useState<NomineeDraft[]>([]);
  const [photos, setPhotos] = useState<Partial<Record<PhotoKind, Photo>>>({});
  const [read, setRead] = useState<Read | null>(null);
  // Their tick on the consent they read: their agreement, in a sitting a code opened (the Owner, 2026-11-08).
  const [agreed, setAgreed] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const say = (error: unknown) => setRefused(sayWhy(error, t, REFUSALS));
  const consent = useMutation(
    orpc.portal.applying.consent.mutationOptions({
      onSuccess: (answer) => {
        setRead(answer);
        setAgreed(false);
        setRefused(null);
      },
      onError: say,
    })
  );
  const send = useMutation(
    orpc.portal.applying.send.mutationOptions({
      onSuccess: onSent,
      onError: say,
    })
  );
  const kind: Kind = opened.kind;
  // The farm's day, which a Nominee's age on the paper is judged on, as the farm judges it.
  const today = farmDayOf(new Date());
  const theForm = {
    token,
    key: sittingKey,
    language,
    record: recordOf(kind, filled),
    nominees: kind === "person" ? nomineesOf(nominees, today) : [],
  };
  const photosMissing = PHOTOS[kind].filter((what) => !photos[what]);
  const nomineesWrong =
    kind === "person" && draftsProblem(nominees, today) !== null;
  const done = [
    detailsIn(kind, filled),
    photosMissing.length === 0,
    read !== null && agreed,
  ];
  const box = (one: Box) => {
    const id = `apply-${one.field}`;
    const props = {
      id,
      onChange: (event: { target: { value: string } }) => {
        setFilled((was) => ({ ...was, [one.field]: event.target.value }));
        // What was laid out from the form before is no longer what it says.
        setRead(null);
      },
      placeholder: one.placeholder ? t(one.placeholder) : undefined,
      value: filled[one.field],
    };
    return (
      <FormField
        className={one.long || one.wide ? "sm:col-span-2" : undefined}
        hint={one.hint ? t(one.hint) : undefined}
        id={id}
        key={one.field}
        label={<LabelOf box={one} />}
      >
        {one.long ? (
          <Textarea maxLength={300} rows={3} {...props} />
        ) : (
          <Input
            inputMode={one.numeric ? "numeric" : undefined}
            maxLength={200}
            type={one.type ?? "text"}
            {...props}
          />
        )}
      </FormField>
    );
  };
  const sayRefused = refused ? (
    <Notice title={t("portal.apply.refusedTitle")} tone="danger">
      {refused}
    </Notice>
  ) : null;
  // Full width on a phone, its own width beside the text on a wider screen.
  const act = "h-11 w-full sm:w-auto sm:self-start";
  return (
    <div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="hidden lg:block">
        <div className="sticky top-6 flex flex-col gap-6">
          <div className="flex flex-col gap-1 px-2">
            <p className="text-muted-foreground text-xs">
              {t("portal.apply.from", { farm: opened.farmName })}
            </p>
            <p className="font-semibold">{t("portal.apply.application")}</p>
          </div>
          <StepList done={done} />
          <div className="border-t px-2 pt-4">
            <SittingNote endsAt={opened.sittingEndsAt} />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col gap-6">
        <header className="flex flex-col gap-3">
          <h1 className="text-xl font-semibold md:text-2xl">
            {t("portal.apply.formTitle")}
          </h1>
          <p className="text-muted-foreground max-w-2xl text-sm">
            {t("portal.apply.formIntro", { farm: opened.farmName })}
          </p>
          <div className="flex flex-col gap-3 lg:hidden">
            <StepList across done={done} />
            <SittingNote endsAt={opened.sittingEndsAt} />
          </div>
        </header>

        <Section
          className="scroll-mt-6"
          description={t("portal.apply.detailsHint")}
          id="apply-details"
          title={
            <PartTitle
              done={done[0] ?? false}
              label={t("portal.apply.step.details")}
              number={1}
            />
          }
        >
          {GROUPS[kind].map((group, index) => (
            <div className={cn(index > 0 && "border-t pt-5")} key={group.title}>
              <fieldset className="flex flex-col gap-4">
                <legend className="mb-4 text-sm font-semibold">
                  {t(group.title)}
                </legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  {group.boxes.map(box)}
                  {group.withMobile ? (
                    <FormField
                      hint={t("portal.apply.mobileFixed")}
                      id="apply-mobile"
                      label={t("portal.apply.mobile")}
                    >
                      <Input disabled id="apply-mobile" value={opened.mobile} />
                    </FormField>
                  ) : null}
                </div>
              </fieldset>
            </div>
          ))}
          {kind === "person" ? (
            <div className="border-t pt-5">
              <fieldset className="flex flex-col gap-3">
                <legend className="mb-1 text-sm font-semibold">
                  {t("portal.apply.nominees")}
                  <span className="text-muted-foreground ms-1.5 font-normal">
                    · {t("portal.apply.optional")}
                  </span>
                </legend>
                <p className="text-muted-foreground max-w-2xl text-sm">
                  {t("portal.apply.nomineesHint")}
                </p>
                <NomineesForm
                  drafts={nominees}
                  onChange={(next) => {
                    setNominees(next);
                    setRead(null);
                  }}
                  onDay={today}
                />
              </fieldset>
            </div>
          ) : null}
        </Section>

        <Section
          className="scroll-mt-6"
          description={t("portal.apply.photosHint")}
          id="apply-photos"
          title={
            <PartTitle
              done={done[1] ?? false}
              label={t("portal.apply.step.photos")}
              number={2}
            />
          }
        >
          <ul className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
            {PHOTO_TIPS.map((tip) => (
              <li className="flex items-center gap-1.5" key={tip}>
                <Check aria-hidden className="text-success size-3.5" />
                {t(tip)}
              </li>
            ))}
          </ul>
          <div className="grid gap-5 sm:grid-cols-2">
            {PHOTOS[kind].map((what) => (
              <PhotoBox
                key={what}
                onPhoto={(photo) =>
                  setPhotos((was) => ({ ...was, [what]: photo }))
                }
                photo={photos[what]}
                what={what}
              />
            ))}
          </div>
        </Section>

        <Section
          className="scroll-mt-6"
          description={t(
            read ? "portal.apply.readTheConsent" : "portal.apply.consentIntro"
          )}
          id="apply-consent"
          title={
            <PartTitle
              done={done[2] ?? false}
              label={t("portal.apply.step.consent")}
              number={3}
            />
          }
        >
          {read ? (
            <>
              <PaperDesk>
                <PaperDocumentView document={read.paper} language={language} />
              </PaperDesk>
              <InsetPanel className="flex flex-col gap-4">
                <label
                  className="flex cursor-pointer items-start gap-3 text-sm"
                  htmlFor="apply-agreed"
                >
                  <Checkbox
                    checked={agreed}
                    className="mt-0.5"
                    id="apply-agreed"
                    onCheckedChange={(checked) => setAgreed(checked === true)}
                  />
                  <span>
                    {t("portal.apply.agreeTick", { farm: opened.farmName })}
                  </span>
                </label>
                {sayRefused}
                {photosMissing.length > 0 ? (
                  <p className="text-muted-foreground text-sm">
                    {t("portal.apply.refused.photosMissing")}
                  </p>
                ) : null}
                <Button
                  className={act}
                  disabled={
                    send.isPending || !agreed || photosMissing.length > 0
                  }
                  onClick={() =>
                    send.mutate({
                      ...theForm,
                      photos: {
                        nid_front: photos.nid_front as Photo,
                        nid_back: photos.nid_back as Photo,
                        trade_license: photos.trade_license,
                        authority: photos.authority,
                      },
                      laidAt: read.laidAt,
                      paperHash: read.paperHash,
                      agreed: true,
                    })
                  }
                  type="button"
                >
                  {send.isPending ? <Spinner /> : <CircleCheck aria-hidden />}
                  {t("portal.apply.agreeAndSend")}
                </Button>
              </InsetPanel>
            </>
          ) : (
            <div className="flex flex-col gap-3">
              {sayRefused}
              <Button
                className={act}
                disabled={consent.isPending || nomineesWrong}
                onClick={() => consent.mutate(theForm)}
                type="button"
              >
                {consent.isPending ? <Spinner /> : <FileText aria-hidden />}
                {t("portal.apply.toTheConsent")}
              </Button>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
};

/** What they read once it is sent: the farm has it, and what happens next, in order. */
const Sent = () => {
  const { t, language } = useLanguage();
  const next: readonly MessageKey[] = [
    "portal.apply.next.read",
    "portal.apply.next.code",
    "portal.apply.next.signIn",
  ];
  return (
    <div className={FLOW_CARD}>
      <span className="bg-success/10 text-success grid size-12 place-items-center rounded-full">
        <CircleCheck aria-hidden className="size-6" />
      </span>
      <FlowHead
        hint={t("portal.apply.sentHint")}
        title={t("portal.apply.sentTitle")}
      />
      <ol className="flex flex-col gap-3 border-t pt-5 text-sm">
        {next.map((step, index) => (
          <li className="flex items-start gap-3" key={step}>
            <span className="bg-muted text-muted-foreground grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums">
              {formatNumber(index + 1, language)}
            </span>
            <span className="pt-0.5">{t(step)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
};

/** The page an Application Link opens. */
const ApplyPage = () => {
  const { token } = Route.useParams();
  // The page is drawn only in the browser, so the tab's own keeping is there to read at once.
  const [key, setKey] = useState<string | null>(() => keptKey(token));
  const [sent, setSent] = useState(false);
  const opened = (next: string | null) => {
    keepKey(token, next);
    setKey(next);
  };
  if (key && !sent) {
    // The form takes the page's width, its steps beside it.
    return (
      <PortalDoor widest>
        <Applying
          onEnded={() => opened(null)}
          onSent={() => {
            keepKey(token, null);
            setSent(true);
          }}
          sittingKey={key}
          token={token}
        />
      </PortalDoor>
    );
  }
  // The short steps either side of it sit in a card in the middle, a little way down.
  return (
    <PortalDoor wide>
      <div className="mx-auto w-full max-w-md md:mt-8">
        {sent ? <Sent /> : <Opening onOpened={opened} token={token} />}
      </div>
    </PortalDoor>
  );
};

export const Route = createFileRoute("/portal/apply/$token")({
  // Drawn in the browser alone: the sitting's key is kept in the tab, which the server cannot read.
  ssr: false,
  component: ApplyPage,
});
