import { phoneSaid } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@OpenFarm/ui/components/dialog";
import { Input } from "@OpenFarm/ui/components/input";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { Textarea } from "@OpenFarm/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Check,
  Copy,
  FileText,
  Link2,
  Mail,
  MessageSquare,
  UserCheck,
  UserX,
  X,
} from "lucide-react";
import { useState } from "react";

import { SaidDate } from "@/components/list-cells";
import type { Tone } from "@/components/page";
import {
  Notice,
  Section,
  SegmentedControl,
  StatusBadge,
} from "@/components/page";
import {
  ConfirmDialog,
  FormDialog,
  FormField,
  InsetPanel,
} from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import type { OwnWords } from "@/lib/saying";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

// Applications by link (ADR 0034), the Owner's side: a link made for somebody she knows and emailed to them, and the
// Application it brings back — read with its photographs, then approved, which makes them an Investor and texts their
// first code, or declined with a line.

type Link = Awaited<
  ReturnType<typeof orpc.investors.applications.links.call>
>[number];
/** Which photograph an Application carries, as the farm answers it. */
type ApplicationPhotoKind = Awaited<
  ReturnType<typeof orpc.investors.applications.one.call>
>["photos"][number];
type Listed = Awaited<
  ReturnType<typeof orpc.investors.applications.list.call>
>[number];

/** The refusals these screens meet, in the farm's words. */
const REFUSALS: OwnWords = {
  applications_off: "investors.applications.refused.off",
  portal_closed: "investors.applications.refused.portalClosed",
  farm_cannot_text: "investors.applications.refused.cannotText",
  farm_cannot_email: "investors.applications.refused.cannotEmail",
  phone_not_mobile: "investors.applications.refused.notMobile",
  already_an_investor: "investors.applications.refused.alreadyAnInvestor",
  link_open_for_mobile: "investors.applications.refused.linkOpen",
  link_used: "investors.applications.refused.linkUsed",
  link_withdrawn: "investors.applications.refused.linkWithdrawn",
  link_ran_out: "investors.applications.refused.linkRanOut",
  link_sent_just_now: "investors.applications.refused.sentJustNow",
  link_not_sent: "investors.applications.refused.notSent",
  application_answered: "investors.applications.refused.answered",
  consent_wording_changed: "investors.applications.refused.wordingChanged",
  phone_has_portal: "portal.refused.phoneHasPortal",
  farm_identity_incomplete: "investors.applications.refused.identity",
};

const LINK_TONE: Record<Link["standing"], Tone> = {
  open: "info",
  sent: "info",
  used: "success",
  withdrawn: "neutral",
  ran_out: "neutral",
};

const STATE_TONE: Record<Listed["state"], Tone> = {
  waiting: "warning",
  approved: "success",
  declined: "neutral",
  lapsed: "neutral",
};

const PHOTO_WORDS = {
  nid_front: "investors.applications.photo.nid_front",
  nid_back: "investors.applications.photo.nid_back",
  trade_license: "investors.applications.photo.trade_license",
  authority: "investors.applications.photo.authority",
} as const satisfies Record<ApplicationPhotoKind, MessageKey>;

/** How long "copied" stays on the button. */
const COPIED_FOR_MS = 2000;

/** The link's address, shown once, with a button that copies it where the browser allows. */
const AddressBox = ({ address }: { address: string }) => {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_FOR_MS);
    } catch {
      // A browser that keeps its clipboard to itself still shows the address, to select and copy by hand.
      setCopied(false);
    }
  };
  return (
    <InsetPanel className="flex flex-col gap-3">
      <output className="font-mono text-sm break-all select-all">
        {address}
      </output>
      <Button className="w-fit" onClick={copy} type="button" variant="outline">
        {copied ? (
          <Check
            aria-hidden
            className="text-success"
            data-icon="inline-start"
          />
        ) : (
          <Copy aria-hidden data-icon="inline-start" />
        )}
        {copied
          ? t("investors.applications.copied")
          : t("investors.applications.copy")}
      </Button>
    </InsetPanel>
  );
};

/** What making a link answers: the address, once, and where it was emailed. */
type Made = Awaited<
  ReturnType<typeof orpc.investors.applications.makeLink.call>
>;

/**
 * The Owner's act of asking somebody to apply: their name, mobile and email, and whether a person or an Organization.
 * Emailed on making; then the address, once, to copy as well.
 */
export const MakeLinkAct = () => {
  const { t } = useLanguage();
  const refused = useRefused(REFUSALS);
  const [open, setOpen] = useState(false);
  const [made, setMade] = useState<Made | null>(null);
  const [kind, setKind] = useState<"person" | "organization">("person");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const making = useMutation(
    orpc.investors.applications.makeLink.mutationOptions({
      onError: refused,
      onSuccess: (answer) => {
        setOpen(false);
        setMade(answer);
        setName("");
        setPhone("");
        setEmail("");
      },
    })
  );
  return (
    <>
      <Button onClick={() => setOpen(true)} type="button" variant="outline">
        <Link2 aria-hidden data-icon="inline-start" />
        {t("investors.applications.make")}
      </Button>
      <FormDialog
        description={t("investors.applications.makeHint")}
        onOpenChange={setOpen}
        onSubmit={() =>
          making.mutate({
            kind,
            name: name.trim(),
            phone: phone.trim(),
            email: email.trim() || undefined,
          })
        }
        open={open}
        pending={making.isPending}
        ready={name.trim() !== "" && phone.trim() !== "" && email.trim() !== ""}
        submitLabel={t("investors.applications.makeAndEmail")}
        title={t("investors.applications.makeTitle")}
      >
        <SegmentedControl
          label={t("investors.applications.kind")}
          name="application-kind"
          onChange={setKind}
          options={[
            { value: "person", label: t("investors.kind.person") },
            { value: "organization", label: t("investors.kind.organization") },
          ]}
          value={kind}
        />
        <FormField
          id="application-name"
          label={t("investors.applications.name")}
        >
          <Input
            autoComplete="off"
            id="application-name"
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
        </FormField>
        <FormField
          hint={t("investors.applications.mobileHint")}
          id="application-phone"
          label={t("investors.applications.mobile")}
        >
          <Input
            autoComplete="off"
            id="application-phone"
            inputMode="tel"
            maxLength={20}
            onChange={(event) => setPhone(event.target.value)}
            required
            type="tel"
            value={phone}
          />
        </FormField>
        <FormField
          hint={t("investors.applications.emailHint")}
          id="application-email"
          label={t("investors.applications.email")}
        >
          <Input
            autoComplete="off"
            id="application-email"
            maxLength={254}
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </FormField>
      </FormDialog>
      <Dialog
        onOpenChange={(still) => {
          if (!still) {
            setMade(null);
          }
        }}
        open={made !== null}
      >
        <DialogContent closeLabel={t("common.close")}>
          <DialogHeader>
            <DialogTitle>{t("investors.applications.madeTitle")}</DialogTitle>
            <DialogDescription>
              {made?.sent?.byEmail
                ? t("investors.applications.emailedTo", {
                    to: made.sent.byEmail,
                  })
                : t("investors.applications.notEmailed")}
            </DialogDescription>
          </DialogHeader>
          {made ? <AddressBox address={made.address} /> : null}
          <p className="text-muted-foreground text-sm">
            {t("investors.applications.onceOnly")}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
};

/** One link not yet used: who it is for, where it stands, and the Owner's acts on it. */
const LinkRow = ({ link }: { link: Link }) => {
  const { t, language } = useLanguage();
  const refused = useRefused(REFUSALS);
  const [withdrawing, setWithdrawing] = useState(false);
  const sending = useMutation(
    orpc.investors.applications.sendLink.mutationOptions({
      onError: refused,
      onSuccess: (sent) =>
        toast.success(
          t("investors.applications.sentAgain", {
            to: sent.byEmail ?? sent.bySms ?? "",
          })
        ),
    })
  );
  const withdraw = useMutation(
    orpc.investors.applications.withdrawLink.mutationOptions({
      onError: refused,
      onSuccess: () => {
        setWithdrawing(false);
        toast.success(t("investors.applications.withdrawn"));
      },
    })
  );
  const open = link.standing === "open" || link.standing === "sent";
  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{link.name}</span>
          <StatusBadge tone={LINK_TONE[link.standing]}>
            {t(`investors.applications.link.${link.standing}`)}
          </StatusBadge>
        </span>
        <span className="text-muted-foreground flex flex-wrap gap-x-1.5 text-xs">
          <span>{phoneSaid(link.phone, language)}</span>
          {link.email ? (
            <>
              <span>·</span>
              <span className="break-all">{link.email}</span>
            </>
          ) : null}
          <span>·</span>
          <span>
            {t("investors.applications.until")} <SaidDate at={link.expiresAt} />
          </span>
        </span>
      </div>
      {open ? (
        <div className="flex shrink-0 flex-wrap gap-2">
          {link.email ? (
            <Button
              disabled={sending.isPending}
              onClick={() => sending.mutate({ id: link.id, by: "email" })}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Mail aria-hidden data-icon="inline-start" />
              {t("investors.applications.emailAgain")}
            </Button>
          ) : null}
          <Button
            disabled={sending.isPending}
            onClick={() => sending.mutate({ id: link.id, by: "sms" })}
            size="sm"
            type="button"
            variant="ghost"
          >
            <MessageSquare aria-hidden data-icon="inline-start" />
            {t("investors.applications.textIt")}
          </Button>
          <Button
            onClick={() => setWithdrawing(true)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <X aria-hidden data-icon="inline-start" />
            {t("investors.applications.withdraw")}
          </Button>
        </div>
      ) : null}
      <ConfirmDialog
        confirmLabel={t("investors.applications.withdraw")}
        description={t("investors.applications.withdrawWhy")}
        onConfirm={() => withdraw.mutate({ id: link.id })}
        onOpenChange={setWithdrawing}
        open={withdrawing}
        pending={withdraw.isPending}
        title={t("investors.applications.withdrawTitle", { name: link.name })}
      />
    </li>
  );
};

/** One photograph an Application carries, asked for only when its part is opened. */
const PhotoOf = ({ id, what }: { id: string; what: ApplicationPhotoKind }) => {
  const { t } = useLanguage();
  const photo = useQuery(
    orpc.investors.applications.photo.queryOptions({ input: { id, what } })
  );
  return (
    <figure className="flex flex-col gap-1.5">
      <figcaption className="text-muted-foreground text-xs">
        {t(PHOTO_WORDS[what])}
      </figcaption>
      {photo.data ? (
        <img
          alt={t(PHOTO_WORDS[what])}
          className="bg-muted/40 w-full rounded-lg border object-contain"
          src={`data:${photo.data.contentType};base64,${photo.data.data}`}
        />
      ) : (
        <Skeleton className="h-48 rounded-lg" />
      )}
    </figure>
  );
};

/** One fact of the Application, a label over what they wrote, or nothing where they wrote nothing. */
const Fact = ({ label, value }: { label: string; value: string | null }) =>
  value ? (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm break-words whitespace-pre-line">{value}</dd>
    </div>
  ) : null;

/** One Application as the Owner reads it. */
type OneApplication = Awaited<
  ReturnType<typeof orpc.investors.applications.one.call>
>;

/** What they filled in, and — for a person — the Nominees they would name, a draft until they sign a Nomination. */
const ApplicationFacts = ({ application }: { application: OneApplication }) => {
  const { t } = useLanguage();
  const nominees = application.nominees as {
    name: string;
    relation: string | null;
    sharePercent: number;
  }[];
  return (
    <>
      <dl className="grid gap-3 sm:grid-cols-2">
        <Fact
          label={t("investors.applications.field.address")}
          value={application.address}
        />
        <Fact
          label={t("investors.applications.field.nid")}
          value={application.nid}
        />
        <Fact
          label={t("investors.applications.field.email")}
          value={application.email}
        />
        <Fact
          label={t("investors.applications.field.bank")}
          value={application.bankAccount}
        />
        <Fact
          label={t("investors.applications.field.tradeLicense")}
          value={application.tradeLicense}
        />
        <Fact
          label={t("investors.applications.field.rjsc")}
          value={application.rjscNumber}
        />
        <Fact
          label={t("investors.applications.field.tin")}
          value={application.tin}
        />
        <Fact
          label={t("investors.applications.field.authority")}
          value={application.authority}
        />
        <Fact
          label={t("investors.applications.field.signatory")}
          value={application.signatoryName}
        />
        <Fact
          label={t("investors.applications.field.signatoryNid")}
          value={application.signatoryNid}
        />
        <Fact
          label={t("investors.applications.field.signatoryRole")}
          value={application.signatoryRole}
        />
      </dl>
      {application.kind === "person" ? (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-sm font-medium">
            {t("investors.applications.nominees")}
          </h3>
          {nominees.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t("investors.applications.noNominees")}
            </p>
          ) : (
            <ul className="text-sm">
              {nominees.map((nominee) => (
                <li key={`${nominee.name}-${nominee.sharePercent}`}>
                  {[nominee.name, nominee.relation, `${nominee.sharePercent}%`]
                    .filter(Boolean)
                    .join(" · ")}
                </li>
              ))}
            </ul>
          )}
          <p className="text-muted-foreground text-xs">
            {t("investors.applications.nomineesDraft")}
          </p>
        </div>
      ) : null}
    </>
  );
};

/**
 * One Application to answer: what they filled in, the Nominees they would name, the photographs to check the NID
 * against, and the proof of their agreeing the consent; then Approve, which makes them an Investor and texts their
 * first code, or Decline with a line.
 */
const ApplicationDialog = ({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) => {
  const { t, language } = useLanguage();
  const refused = useRefused(REFUSALS);
  const [approving, setApproving] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [line, setLine] = useState("");
  const one = useQuery({
    ...orpc.investors.applications.one.queryOptions({
      input: { id: id ?? "" },
    }),
    enabled: id !== null,
  });
  const approve = useMutation(
    orpc.investors.applications.approve.mutationOptions({
      onError: refused,
      onSuccess: (done) => {
        setApproving(false);
        toast.success(
          done.code
            ? t("investors.applications.approved", {
                to: done.code.bySms ?? done.code.byEmail ?? "",
              })
            : t("investors.applications.approvedNoCode")
        );
        onClose();
      },
    })
  );
  const decline = useMutation(
    orpc.investors.applications.decline.mutationOptions({
      onError: refused,
      onSuccess: () => {
        setDeclining(false);
        setLine("");
        toast.success(t("investors.applications.declined"));
        onClose();
      },
    })
  );
  const application = one.data;
  const waiting = application?.state === "waiting";
  return (
    <Dialog
      onOpenChange={(still) => {
        if (!still) {
          onClose();
        }
      }}
      open={id !== null}
    >
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"
        closeLabel={t("common.close")}
      >
        <DialogHeader>
          <DialogTitle>
            {application?.name ?? t("investors.applications.one")}
          </DialogTitle>
          <DialogDescription>
            {application ? (
              <>
                {t(`investors.kind.${application.kind}`)} ·{" "}
                {phoneSaid(application.phone, language)} ·{" "}
                {t("investors.applications.sentOn")}{" "}
                <SaidDate at={application.sentAt} withTime />
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        {application ? (
          <div className="flex flex-col gap-5">
            {application.clearedAt ? (
              <Notice tone="info" title={t("investors.applications.cleared")}>
                {t("investors.applications.clearedWhy")}
              </Notice>
            ) : null}
            {waiting && !application.consent.stillInForce ? (
              <Notice
                tone="warning"
                title={t("investors.applications.refused.wordingChanged")}
              >
                {t("investors.applications.wordingChangedWhy")}
              </Notice>
            ) : null}
            <ApplicationFacts application={application} />
            {application.photos.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {application.photos.map((what) => (
                  <PhotoOf id={application.id} key={what} what={what} />
                ))}
              </div>
            ) : null}
            <InsetPanel className="flex flex-col gap-1 text-sm">
              <span className="font-medium">
                {t("investors.applications.consentProof", {
                  version: formatNumber(
                    application.consent.version ?? 0,
                    language
                  ),
                })}
              </span>
              <span className="text-muted-foreground">
                {t("investors.applications.consentCode", {
                  to: application.consent.codeSentTo,
                })}{" "}
                <SaidDate at={application.consent.codeSentAt} withTime />
              </span>
              {application.consent.callerAgent ? (
                <span className="text-muted-foreground text-xs break-all">
                  {[
                    application.consent.callerAddress,
                    application.consent.callerAgent,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              ) : null}
            </InsetPanel>
            {application.answerLine ? (
              <p className="text-sm italic">{application.answerLine}</p>
            ) : null}
            {waiting ? (
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  onClick={() => setDeclining(true)}
                  type="button"
                  variant="outline"
                >
                  <UserX aria-hidden data-icon="inline-start" />
                  {t("investors.applications.decline")}
                </Button>
                <Button
                  disabled={!application.consent.stillInForce}
                  onClick={() => setApproving(true)}
                  type="button"
                >
                  <UserCheck aria-hidden data-icon="inline-start" />
                  {t("investors.applications.approve")}
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <Skeleton className="h-64 rounded-xl" />
        )}
        <ConfirmDialog
          confirmLabel={t("investors.applications.approve")}
          description={t("investors.applications.approveWhy")}
          onConfirm={() => {
            if (id) {
              approve.mutate({ id });
            }
          }}
          onOpenChange={setApproving}
          open={approving}
          pending={approve.isPending}
          takesAway={false}
          title={t("investors.applications.approveTitle", {
            name: application?.name ?? "",
          })}
        />
        <FormDialog
          description={t("investors.applications.declineHint")}
          onOpenChange={setDeclining}
          onSubmit={() => {
            if (id) {
              decline.mutate({ id, line: line.trim() || undefined });
            }
          }}
          open={declining}
          pending={decline.isPending}
          ready
          submitLabel={t("investors.applications.decline")}
          title={t("investors.applications.declineTitle", {
            name: application?.name ?? "",
          })}
        >
          <FormField id="decline-line" label={t("investors.applications.line")}>
            <Textarea
              id="decline-line"
              maxLength={300}
              onChange={(event) => setLine(event.target.value)}
              rows={3}
              value={line}
            />
          </FormField>
        </FormDialog>
      </DialogContent>
    </Dialog>
  );
};

/** One Application in the list: who, when, where it stands, and the act of reading it. */
const ApplicationRow = ({
  application,
  onRead,
}: {
  application: Listed;
  onRead: () => void;
}) => {
  const { t, language } = useLanguage();
  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span
            className={
              application.state === "waiting" ? "font-medium" : undefined
            }
          >
            {application.name}
          </span>
          <StatusBadge tone={STATE_TONE[application.state]}>
            {t(`investors.applications.state.${application.state}`)}
          </StatusBadge>
        </span>
        <span className="text-muted-foreground flex flex-wrap gap-x-1.5 text-xs">
          <span>{t(`investors.kind.${application.kind}`)}</span>
          <span>·</span>
          <span>{phoneSaid(application.phone, language)}</span>
          <span>·</span>
          <span>
            {t("investors.applications.sentOn")}{" "}
            <SaidDate at={application.sentAt} />
          </span>
        </span>
      </div>
      <Button
        className="shrink-0"
        onClick={onRead}
        size="sm"
        type="button"
        variant={application.state === "waiting" ? "default" : "ghost"}
      >
        <FileText aria-hidden data-icon="inline-start" />
        {t("investors.applications.read")}
      </Button>
    </li>
  );
};

/**
 * The links the Owner has sent and the Applications they brought back, the waiting ones first: hers to read and answer
 * (ADR 0034). Shown while the farm takes Applications, and after, while any are on file.
 */
export const ApplicationsSection = ({ taking }: { taking: boolean }) => {
  const { t } = useLanguage();
  const [reading, setReading] = useState<string | null>(null);
  const links = useQuery(orpc.investors.applications.links.queryOptions());
  const applications = useQuery(
    orpc.investors.applications.list.queryOptions()
  );
  const openLinks = (links.data ?? []).filter(
    (one) => one.standing === "open" || one.standing === "sent"
  );
  const all = applications.data ?? [];
  const waiting = all.filter((one) => one.state === "waiting");
  const answered = all.filter((one) => one.state !== "waiting").slice(0, 10);
  if (!taking && openLinks.length === 0 && all.length === 0) {
    return null;
  }
  return (
    <Section
      action={taking ? <MakeLinkAct /> : null}
      description={t("investors.applications.description")}
      id="applications"
      title={t("investors.applications.title")}
    >
      {waiting.length + openLinks.length + answered.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("investors.applications.none")}
        </p>
      ) : null}
      {waiting.length > 0 ? (
        <ul className="divide-border divide-y">
          {waiting.map((one) => (
            <ApplicationRow
              application={one}
              key={one.id}
              onRead={() => setReading(one.id)}
            />
          ))}
        </ul>
      ) : null}
      {openLinks.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-muted-foreground text-xs font-medium">
            {t("investors.applications.linksOut")}
          </h3>
          <ul className="divide-border divide-y">
            {openLinks.map((one) => (
              <LinkRow key={one.id} link={one} />
            ))}
          </ul>
        </div>
      ) : null}
      {answered.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-muted-foreground text-xs font-medium">
            {t("investors.applications.answered")}
          </h3>
          <ul className="divide-border divide-y">
            {answered.map((one) => (
              <ApplicationRow
                application={one}
                key={one.id}
                onRead={() => setReading(one.id)}
              />
            ))}
          </ul>
        </div>
      ) : null}
      <ApplicationDialog id={reading} onClose={() => setReading(null)} />
    </Section>
  );
};
