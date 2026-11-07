import { farmDayOf } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { Textarea } from "@OpenFarm/ui/components/textarea";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Check,
  CircleCheck,
  FileText,
  IdCard,
  MessageSquareLock,
} from "lucide-react";
import { useState } from "react";

import { CODE_FIELD } from "@/components/door-screen";
import type { NomineeDraft } from "@/components/investors/nominee-draft";
import {
  draftsProblem,
  nomineesOf,
} from "@/components/investors/nominee-draft";
import { NomineesForm } from "@/components/investors/nominees-form";
import { FLOW_CARD, FlowHead, Notice, Section } from "@/components/page";
import { FormField, InsetPanel, UploadButton } from "@/components/page-kit";
import { PortalDoor } from "@/components/portal/portal-door";
import { PaperDesk } from "@/components/ventures/paper-dialog";
import { PaperDocumentView } from "@/components/ventures/paper-document";
import { useLanguage } from "@/i18n/language-provider";
import type { Photo } from "@/lib/photo";
import { photoProblem, shrink } from "@/lib/photo";
import { sayWhy } from "@/lib/saying";
import { orpc } from "@/utils/orpc";

// Applying by an Application Link (ADR 0034), for somebody the Owner knows and who has never signed in: the code
// texted to the link's mobile opens it; they fill in their own details and photograph their NID; they read the Portal
// Consent laid out from what they wrote and agree it with a second code. Nothing of the portal beyond that.

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

/** The boxes each kind fills in, in the record sheet's order, with the words over each and whether it is long. */
const BOXES: Record<
  Kind,
  readonly {
    field: keyof Filled;
    label: MessageKey;
    long?: boolean;
    type?: string;
  }[]
> = {
  person: [
    { field: "name", label: "investors.name" },
    { field: "nid", label: "investors.nid" },
    { field: "address", label: "investors.address", long: true },
    { field: "bankAccount", label: "investors.bank", long: true },
    {
      field: "email",
      label: "investors.applications.field.email",
      type: "email",
    },
  ],
  organization: [
    { field: "name", label: "investors.organizationName" },
    { field: "tradeLicense", label: "investors.tradeLicense" },
    { field: "rjscNumber", label: "investors.rjscNumber" },
    { field: "tin", label: "investors.tin" },
    { field: "address", label: "investors.address", long: true },
    { field: "signatoryName", label: "investors.signatoryName" },
    { field: "signatoryRole", label: "investors.signatoryRole" },
    { field: "signatoryNid", label: "investors.signatoryNid" },
    { field: "authority", label: "investors.authority" },
    { field: "authorityOn", label: "investors.authorityOn", type: "date" },
    { field: "bankAccount", label: "investors.bank", long: true },
    {
      field: "email",
      label: "investors.applications.field.email",
      type: "email",
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

/** A box's text, or nothing where it is empty, as the farm takes it. */
const given = (text: string) => (text.trim() === "" ? undefined : text.trim());

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

/** Where the farm sends a code, mostly hidden, as a sentence says it: their mobile while the farm texts, and their
 *  email while it sends email — by email alone until the farm has a text gateway (the Owner, 2026-11-08). */
const whereCodesGo = (
  ways: { bySms: string | null; byEmail: string | null },
  t: ReturnType<typeof useLanguage>["t"]
): string => {
  if (ways.bySms && ways.byEmail) {
    return t("portal.apply.where.both", {
      mobile: ways.bySms,
      email: ways.byEmail,
    });
  }
  if (ways.bySms) {
    return t("portal.apply.where.mobile", { mobile: ways.bySms });
  }
  return t("portal.apply.where.email", { email: ways.byEmail ?? "" });
};

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

/** The first step: the farm's name, where the code goes, and the code that opens the link. */
const Opening = ({
  token,
  onOpened,
}: {
  token: string;
  onOpened: (key: string) => void;
}) => {
  const { t, language } = useLanguage();
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const link = useQuery({
    ...orpc.portal.applying.open.queryOptions({ input: { token } }),
    retry: false,
  });
  const send = useMutation(
    orpc.portal.applying.sendCode.mutationOptions({
      onSuccess: () => {
        setSent(true);
        setRefused(null);
      },
      onError: (error) => setRefused(sayWhy(error, t, REFUSALS)),
    })
  );
  const unlock = useMutation(
    orpc.portal.applying.unlock.mutationOptions({
      onSuccess: (answer) => onOpened(answer.key),
      onError: (error) => setRefused(sayWhy(error, t, REFUSALS)),
    })
  );
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
      <FlowHead
        hint={
          link.data
            ? t("portal.apply.openHint", {
                farm: link.data.farmName,
                where: whereCodesGo(link.data, t),
              })
            : undefined
        }
        title={t("portal.apply.title")}
      />
      {refused ? (
        <Notice title={t("portal.apply.refusedTitle")} tone="danger">
          {refused}
        </Notice>
      ) : null}
      {sent ? (
        <>
          <CodeBox code={code} id="apply-open-code" onCode={setCode} />
          <Button
            className="h-12 w-full text-base md:h-9 md:text-sm"
            disabled={unlock.isPending}
            type="submit"
          >
            {unlock.isPending ? <Spinner /> : null}
            {t("portal.apply.open")}
          </Button>
          <Button
            disabled={send.isPending}
            onClick={() => send.mutate({ token, purpose: "open", language })}
            type="button"
            variant="ghost"
          >
            {t("portal.apply.sendAgain")}
          </Button>
        </>
      ) : (
        <Button
          className="h-12 w-full text-base md:h-9 md:text-sm"
          disabled={send.isPending || !link.data}
          onClick={() => send.mutate({ token, purpose: "open", language })}
          type="button"
        >
          {send.isPending ? <Spinner /> : <MessageSquareLock aria-hidden />}
          {t("portal.apply.sendMeACode")}
        </Button>
      )}
    </form>
  );
};

/** One photograph to take or choose: a tile the shape of the card, showing it once taken. */
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
  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-center gap-1.5 text-sm font-medium">
        {photo ? (
          <CircleCheck aria-hidden className="text-success size-4" />
        ) : null}
        {t(PHOTO_WORDS[what])}
      </span>
      <div
        className={cn(
          "bg-muted/40 grid aspect-[3/2] place-items-center overflow-hidden rounded-lg border",
          !photo && "border-dashed"
        )}
      >
        {photo ? (
          <img
            alt={t(PHOTO_WORDS[what])}
            className="size-full object-contain"
            src={`data:${photo.contentType};base64,${photo.data}`}
          />
        ) : (
          <IdCard aria-hidden className="text-muted-foreground size-10" />
        )}
      </div>
      <UploadButton
        busy={busy}
        fromCamera={false}
        id={`apply-photo-${what}`}
        label={t(photo ? "portal.apply.photoAgain" : "portal.apply.photoTake")}
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
      />
      {problem ? <p className="text-destructive text-sm">{problem}</p> : null}
    </div>
  );
};

/** The three parts of the form along the top, each ticked once it is done, so a long form says how far there is to go. */
const StepTrack = ({ done }: { done: readonly boolean[] }) => {
  const { t, language } = useLanguage();
  const steps = [
    t("portal.apply.step.details"),
    t("portal.apply.step.photos"),
    t("portal.apply.step.consent"),
  ];
  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      {steps.map((label, index) => (
        <li className="flex items-center gap-2" key={label}>
          <span
            className={cn(
              "grid size-6 place-items-center rounded-full text-xs font-medium tabular-nums",
              done[index]
                ? "bg-success text-success-foreground"
                : "bg-muted text-muted-foreground"
            )}
          >
            {done[index] ? (
              <Check aria-hidden className="size-3.5" />
            ) : (
              formatNumber(index + 1, language)
            )}
          </span>
          <span className={done[index] ? undefined : "text-muted-foreground"}>
            {label}
          </span>
          {index < steps.length - 1 ? (
            <span aria-hidden className="bg-border hidden h-px w-6 sm:block" />
          ) : null}
        </li>
      ))}
    </ol>
  );
};

/** Whether a box has anything in it. */
const has = (text: string) => text.trim() !== "";

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
      <div className={FLOW_CARD}>
        <FlowHead title={t("portal.apply.title")} />
        <Notice title={t("portal.apply.refused.sittingEnded")} tone="warning">
          {t("portal.apply.askForANewCode")}
        </Notice>
        <Button onClick={onEnded} type="button">
          {t("portal.apply.sendMeACode")}
        </Button>
      </div>
    );
  }
  if (!form.data) {
    return (
      <div className={FLOW_CARD}>
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
 * The form, then the consent: their own details in the record sheet's order, starting from what the Owner wrote them
 * down as, the Nominees they would name, the photographs, and — once all of it is there — the Portal Consent laid out
 * from it, to read and agree with a code.
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
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const say = (error: unknown) => setRefused(sayWhy(error, t, REFUSALS));
  const consent = useMutation(
    orpc.portal.applying.consent.mutationOptions({
      onSuccess: (answer) => {
        setRead(answer);
        setRefused(null);
      },
      onError: say,
    })
  );
  const sendCode = useMutation(
    orpc.portal.applying.sendCode.mutationOptions({
      onSuccess: () => {
        setCodeSent(true);
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
  const box = (one: (typeof BOXES)[Kind][number]) => {
    const props = {
      id: `apply-${one.field}`,
      onChange: (event: { target: { value: string } }) => {
        setFilled((was) => ({ ...was, [one.field]: event.target.value }));
        // What was laid out from the form before is no longer what it says.
        setRead(null);
      },
      value: filled[one.field],
    };
    return (
      <FormField
        className={one.long ? "sm:col-span-2" : undefined}
        id={props.id}
        key={one.field}
        label={t(one.label)}
      >
        {one.long ? (
          <Textarea maxLength={300} rows={2} {...props} />
        ) : (
          <Input maxLength={200} type={one.type ?? "text"} {...props} />
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
  const wide = "h-11 w-full sm:w-auto sm:self-start";
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm">{opened.farmName}</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("portal.apply.formTitle")}
        </h1>
        <p className="text-muted-foreground max-w-2xl text-sm">
          {t("portal.apply.formHint", {
            farm: opened.farmName,
            mobile: opened.mobile,
          })}
        </p>
        <StepTrack
          done={[
            detailsIn(kind, filled),
            photosMissing.length === 0,
            read !== null,
          ]}
        />
      </header>

      <Section
        description={t("portal.apply.detailsHint")}
        title={`${formatNumber(1, language)}. ${t("portal.apply.step.details")}`}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {BOXES[kind].map(box)}
          <FormField
            hint={t("portal.apply.mobileFixed")}
            id="apply-mobile"
            label={t("portal.apply.mobile")}
          >
            <Input disabled id="apply-mobile" value={opened.mobile} />
          </FormField>
        </div>
        {kind === "person" ? (
          <div className="flex flex-col gap-3 border-t pt-4">
            <div>
              <p className="text-sm font-medium">
                {t("portal.apply.nominees")}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {t("portal.apply.nomineesHint")}
              </p>
            </div>
            <NomineesForm
              drafts={nominees}
              onChange={(next) => {
                setNominees(next);
                setRead(null);
              }}
              onDay={today}
            />
          </div>
        ) : null}
      </Section>

      <Section
        description={t("portal.apply.photosHint")}
        title={`${formatNumber(2, language)}. ${t("portal.apply.step.photos")}`}
      >
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
        description={t(
          read ? "portal.apply.readTheConsent" : "portal.apply.consentIntro"
        )}
        title={`${formatNumber(3, language)}. ${t("portal.apply.step.consent")}`}
      >
        {read ? (
          <>
            <PaperDesk>
              <PaperDocumentView document={read.paper} language={language} />
            </PaperDesk>
            <InsetPanel className="flex flex-col gap-4">
              <p className="text-sm">
                {t("portal.apply.agreeHint", {
                  where: whereCodesGo(opened, t),
                })}
              </p>
              {sayRefused}
              {photosMissing.length > 0 ? (
                <p className="text-muted-foreground text-sm">
                  {t("portal.apply.refused.photosMissing")}
                </p>
              ) : null}
              {codeSent ? (
                <form
                  className="flex flex-col gap-3 sm:flex-row sm:items-end"
                  noValidate
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (photosMissing.length > 0) {
                      setRefused(t("portal.apply.refused.photosMissing"));
                      return;
                    }
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
                      code,
                    });
                  }}
                >
                  <div className="sm:w-48">
                    <CodeBox
                      code={code}
                      id="apply-agree-code"
                      onCode={setCode}
                    />
                  </div>
                  <Button
                    // Level with the code box beside it, and as tall.
                    className="h-14 w-full sm:w-auto md:h-14"
                    disabled={send.isPending || code.trim() === ""}
                    type="submit"
                  >
                    {send.isPending ? <Spinner /> : <CircleCheck aria-hidden />}
                    {t("portal.apply.agreeAndSend")}
                  </Button>
                </form>
              ) : (
                <Button
                  className={wide}
                  disabled={sendCode.isPending || photosMissing.length > 0}
                  onClick={() =>
                    sendCode.mutate({
                      token,
                      key: sittingKey,
                      purpose: "agree",
                      language,
                    })
                  }
                  type="button"
                >
                  {sendCode.isPending ? (
                    <Spinner />
                  ) : (
                    <MessageSquareLock aria-hidden />
                  )}
                  {t("portal.apply.sendTheCodeToAgree")}
                </Button>
              )}
            </InsetPanel>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            {sayRefused}
            <Button
              className={wide}
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
  );
};

/** What they read once it is sent: the farm has it, and will answer. */
const Sent = () => {
  const { t } = useLanguage();
  return (
    <div className={FLOW_CARD}>
      <FlowHead
        hint={t("portal.apply.sentHint")}
        title={t("portal.apply.sentTitle")}
      />
      <CircleCheck aria-hidden className="text-success size-10" />
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
  let step = <Opening onOpened={opened} token={token} />;
  if (sent) {
    step = <Sent />;
  } else if (key) {
    step = (
      <Applying
        onEnded={() => opened(null)}
        onSent={() => {
          keepKey(token, null);
          setSent(true);
        }}
        sittingKey={key}
        token={token}
      />
    );
  }
  // The form takes the page's width; the short steps either side of it sit in a card in the middle of it.
  return (
    <PortalDoor wide>
      {key && !sent ? (
        step
      ) : (
        <div className="mx-auto w-full max-w-md">{step}</div>
      )}
    </PortalDoor>
  );
};

export const Route = createFileRoute("/portal/apply/$token")({
  // Drawn in the browser alone: the sitting's key is kept in the tab, which the server cannot read.
  ssr: false,
  component: ApplyPage,
});
