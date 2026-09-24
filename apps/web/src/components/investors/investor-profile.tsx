import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Check, Copy, Pencil } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";

import type { Investor } from "@/components/investors/investor-types";
import { PortalAccess } from "@/components/investors/portal-access";
import { Section } from "@/components/page";
import { ConfirmDialog } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

/** How long "copied" stays on the button before it offers to copy again. */
const COPIED_FOR_MS = 2000;

/** One thing the farm wrote down, or plainly that it did not. A blank is said in words rather than left
 *  as an empty line, so a missing NID reads as missing rather than as a page that failed to draw. */
const Detail = ({
  label,
  children,
  wide = false,
}: {
  label: string;
  children?: ReactNode;
  wide?: boolean;
}) => {
  const { t } = useLanguage();
  const given = children !== "" && children !== null && children !== undefined;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", wide && "sm:col-span-2")}>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      {/* Wrapped rather than truncated, its lines kept as typed: she is holding the stamped paper and checking
          the farm's copy against it, and half an address is worse than none. */}
      <dd
        className={cn(
          "text-sm break-words whitespace-pre-line",
          !given && "text-muted-foreground"
        )}
      >
        {given ? children : t("investors.notGiven")}
      </dd>
    </div>
  );
};

/** A part of the record under the same heading it was written under, so the paper and the form read alike. */
const DetailCard = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <Section title={title}>
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">{children}</dl>
  </Section>
);

/** Everything in a phone number a dialler does not dial: spaces, dashes, brackets. */
const NOT_DIALLED = /[^\d+]/gu;

/** A number to ring from the phone the page is open on, or nothing where none was given — so the Detail
 *  it stands in still says so in words. */
export const phoneLink = (phone: string | null | undefined) =>
  phone ? (
    <a
      className="tabular-nums underline-offset-4 hover:underline focus-visible:underline"
      href={`tel:${phone.replaceAll(NOT_DIALLED, "")}`}
    >
      {phone}
    </a>
  ) : null;

/** The account the money goes to, set apart as it will be read out or pasted into a bank's app, with a button
 *  that copies it where the browser allows one. */
const BankAccount = ({ account }: { account: string }) => {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(account);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_FOR_MS);
    } catch {
      // A browser that will not share its clipboard still shows the account, to be read and typed.
      setCopied(false);
    }
  };
  return (
    <div className="bg-muted/60 flex items-start justify-between gap-3 rounded-lg border p-3">
      <p className="min-w-0 text-sm break-words whitespace-pre-line tabular-nums select-all">
        {account}
      </p>
      <Button onClick={handleCopy} size="sm" type="button" variant="outline">
        {copied ? (
          <Check aria-hidden className="text-success" />
        ) : (
          <Copy aria-hidden />
        )}
        {copied ? t("investors.copied") : t("investors.copyAccount")}
      </Button>
    </div>
  );
};

/** The one act at the head of somebody's page: putting their record right. */
export const InvestorActs = ({ onEdit }: { onEdit: () => void }) => {
  const { t } = useLanguage();
  return (
    <Button onClick={onEdit} type="button">
      <Pencil aria-hidden data-icon="inline-start" />
      {t("investors.edit")}
    </Button>
  );
};

/**
 * Whether the farm may still sign somebody, and the act that changes it: retiring asks first and says what it does
 * not do — nothing is deleted — and while their money is in a Venture still running it is dim, with why written
 * under it rather than left to a tooltip; retired, they are brought back from here.
 */
const OnFile = ({ investor }: { investor: Investor }) => {
  const { t, language } = useLanguage();
  const refused = useRefused();
  const [asking, setAsking] = useState(false);
  const retiring = useMutation(
    orpc.investors.retire.mutationOptions({
      onError: refused,
      onSuccess: () => {
        setAsking(false);
        toast.success(t("investors.retiredToast"));
      },
    })
  );
  const bringingBack = useMutation(
    orpc.investors.bringBack.mutationOptions({
      onError: refused,
      onSuccess: () => {
        toast.success(t("investors.broughtBack"));
      },
    })
  );
  // A list cached before retiring existed has no such field: somebody on it is simply not retired.
  const { retiredAt } = investor;
  const stillIn = investor.unitsHeld > 0;
  if (retiredAt) {
    return (
      <Section
        description={t("investors.retiredOn", {
          day: formatDate(new Date(retiredAt), language),
        })}
        title={t("investors.page.onFile")}
      >
        <Button
          className="self-start"
          disabled={bringingBack.isPending}
          onClick={() => bringingBack.mutate({ id: investor.id })}
          size="sm"
          type="button"
          variant="outline"
        >
          <ArchiveRestore aria-hidden data-icon="inline-start" />
          {t("investors.bringBack")}
        </Button>
      </Section>
    );
  }
  return (
    <Section
      description={t("investors.retireWhy")}
      title={t("investors.page.onFile")}
    >
      <Button
        className="text-danger hover:text-danger self-start"
        disabled={stillIn}
        onClick={() => setAsking(true)}
        size="sm"
        type="button"
        variant="outline"
      >
        <Archive aria-hidden data-icon="inline-start" />
        {t("investors.retire")}
      </Button>
      {stillIn ? (
        <p className="text-muted-foreground text-xs">
          {t("investors.stillIn")}
        </p>
      ) : null}
      <ConfirmDialog
        confirmLabel={t("investors.retire")}
        description={t("investors.retireWhy")}
        onConfirm={() => retiring.mutate({ id: investor.id })}
        onOpenChange={setAsking}
        open={asking}
        pending={retiring.isPending}
        title={t("investors.retireTitle", { name: investor.name })}
      />
    </Section>
  );
};

/**
 * Everything the farm holds about who one Investor is, in the parts it was written in — who they are, where their
 * money goes, and their nominee — with their way into the portal beside it, and whether the farm may still sign
 * them.
 *
 * The NID and the bank account are asked for when the person is recorded, because the stamped Agreement
 * needs the one and the payout needs the other — and shown back here, so the Owner can check what she typed
 * against the paper in her hand.
 */
export const InvestorProfile = ({
  investor,
  portalOpen,
}: {
  investor: Investor;
  /** Whether the farm has its Investor portal open. */
  portalOpen: boolean;
}) => {
  const { t } = useLanguage();
  return (
    <div className="grid items-start gap-4 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <DetailCard title={t("investors.section.who")}>
          <Detail label={t("investors.name")}>{investor.name}</Detail>
          <Detail label={t("investors.phone")}>
            {phoneLink(investor.phone)}
          </Detail>
          <Detail label={t("investors.nid")}>{investor.nid}</Detail>
          <Detail label={t("investors.address")}>{investor.address}</Detail>
        </DetailCard>
        <DetailCard title={t("investors.section.money")}>
          <Detail label={t("investors.bank")} wide>
            {investor.bankAccount ? (
              <BankAccount account={investor.bankAccount} />
            ) : null}
          </Detail>
        </DetailCard>
        <DetailCard title={t("investors.nominee")}>
          <Detail label={t("investors.nomineeName")}>
            {investor.nominee?.name}
          </Detail>
          <Detail label={t("investors.nomineeRelation")}>
            {investor.nominee?.relation}
          </Detail>
          <Detail label={t("investors.nomineePhone")}>
            {phoneLink(investor.nominee?.phone)}
          </Detail>
        </DetailCard>
      </div>
      <div className="flex flex-col gap-4">
        <Section description={t("portal.recordHint")} title={t("portal.title")}>
          <PortalAccess investor={investor} portalOpen={portalOpen} />
        </Section>
        <OnFile investor={investor} />
      </div>
    </div>
  );
};
