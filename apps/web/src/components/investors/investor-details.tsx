import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@OpenFarm/ui/components/sheet";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Archive,
  ArchiveRestore,
  Check,
  Copy,
  Handshake,
  Pencil,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";

import type { Investor } from "@/components/investors/investor-types";
import { EmptyState, StatusBadge, TagChip } from "@/components/page";
import { ConfirmDialog } from "@/components/page-kit";
import { StateBadge } from "@/components/ventures/venture-card";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

/** How long "copied" stays on the button before it offers to copy again. */
const COPIED_FOR_MS = 2000;

/** A part of the record under the same heading it was written under, so the paper and the form read alike. */
const DetailSection = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <section className="border-t pt-5 first:border-t-0 first:pt-0">
    <h3 className="text-base font-semibold">{title}</h3>
    <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">{children}</dl>
  </section>
);

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

/** Everything in a phone number a dialler does not dial: spaces, dashes, brackets. */
const NOT_DIALLED = /[^\d+]/gu;

/** A number to ring from the phone the sheet is open on, or nothing where none was given — so the Detail
 *  it stands in still says so in words. */
const phoneLink = (phone: string | null | undefined) =>
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

/** Every Venture their money went to, the latest first — each leading to its page, with the Units they signed for
 *  and where the run stands. */
const TheirVentures = ({ investor }: { investor: Investor | null }) => {
  const { t, language } = useLanguage();
  // A list cached before this was said has no ventures on it: nothing to lead to yet, rather than a broken line.
  const ventures = investor?.ventures ?? [];
  return (
    <section className="border-t pt-5">
      <h3 className="text-base font-semibold">
        {t("investors.section.ventures")}
      </h3>
      {ventures.length === 0 ? (
        <EmptyState
          bare
          className="mt-4"
          icon={Handshake}
          title={t("investors.noVentures")}
        />
      ) : (
        <ul className="mt-4 flex flex-col divide-y rounded-lg border">
          {ventures.map((one) => (
            <li key={one.id}>
              <Link
                className="hover:bg-muted/50 focus-visible:ring-ring flex items-center justify-between gap-3 px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset"
                params={{ ventureId: one.id }}
                to="/ventures/$ventureId"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{one.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {t("investors.holds", {
                      units: formatNumber(one.units, language),
                    })}
                  </span>
                </span>
                <StateBadge state={one.state} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

/**
 * What can be done about somebody from their record: put it right, and retire them or bring them back. Retiring
 * asks first and says what it does not do — nothing is deleted — and is not offered while their money is in a
 * Venture still running, where the line under it says why rather than leaving a button that only refuses.
 */
const InvestorActions = ({
  investor,
  onEdit,
}: {
  investor: Investor;
  onEdit: (investor: Investor) => void;
}) => {
  const { t } = useLanguage();
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
  const retired = Boolean(investor.retiredAt);
  const stillIn = investor.unitsHeld > 0;
  return (
    <SheetFooter className="flex-col gap-3 border-t">
      {stillIn && !retired ? (
        <p className="text-muted-foreground text-xs">
          {t("investors.stillIn")}
        </p>
      ) : null}
      <div className="flex flex-row flex-wrap justify-end gap-2">
        {retired ? (
          <Button
            disabled={bringingBack.isPending}
            onClick={() => bringingBack.mutate({ id: investor.id })}
            type="button"
            variant="outline"
          >
            <ArchiveRestore aria-hidden data-icon="inline-start" />
            {t("investors.bringBack")}
          </Button>
        ) : (
          <Button
            disabled={stillIn}
            onClick={() => setAsking(true)}
            type="button"
            variant="outline"
          >
            <Archive aria-hidden data-icon="inline-start" />
            {t("investors.retire")}
          </Button>
        )}
        <Button onClick={() => onEdit(investor)} type="button">
          <Pencil aria-hidden data-icon="inline-start" />
          {t("investors.edit")}
        </Button>
      </div>
      <ConfirmDialog
        confirmLabel={t("investors.retire")}
        description={t("investors.retireWhy")}
        onConfirm={() => retiring.mutate({ id: investor.id })}
        onOpenChange={setAsking}
        open={asking}
        pending={retiring.isPending}
        title={t("investors.retireTitle", { name: investor.name })}
      />
    </SheetFooter>
  );
};

/**
 * Everything the farm holds about one Investor, in the three parts it was written in: who they are, where their
 * money goes, and their nominee — with what can be done about them at its foot.
 *
 * The NID and the bank account are asked for when the person is recorded, because the stamped Agreement
 * needs the one and the payout needs the other — and until now neither was ever shown back, so the Owner
 * could not check what she had typed against the paper in her hand.
 */
export const InvestorDetails = ({
  investor,
  onOpenChange,
  onEdit,
}: {
  investor: Investor | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (investor: Investor) => void;
}) => {
  const { t, language } = useLanguage();
  return (
    <Sheet onOpenChange={onOpenChange} open={investor !== null}>
      <SheetContent
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
        closeLabel={t("common.close")}
      >
        <SheetHeader className="border-b">
          <SheetTitle>{investor?.name ?? t("investors.details")}</SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-2">
            <span>{t("investors.unitsHeld")}</span>
            <TagChip>
              {t("investors.holds", {
                units: formatNumber(investor?.unitsHeld ?? 0, language),
              })}
            </TagChip>
            {investor?.retiredAt ? (
              <StatusBadge tone="neutral">
                {t("investors.retiredOn", {
                  day: formatDate(new Date(investor.retiredAt), language),
                })}
              </StatusBadge>
            ) : null}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
          <DetailSection title={t("investors.section.who")}>
            <Detail label={t("investors.phone")}>
              {phoneLink(investor?.phone)}
            </Detail>
            <Detail label={t("investors.nid")}>{investor?.nid}</Detail>
            <Detail label={t("investors.address")} wide>
              {investor?.address}
            </Detail>
          </DetailSection>
          <DetailSection title={t("investors.section.money")}>
            <Detail label={t("investors.bank")} wide>
              {investor?.bankAccount ? (
                <BankAccount account={investor.bankAccount} />
              ) : null}
            </Detail>
          </DetailSection>
          <DetailSection title={t("investors.nominee")}>
            <Detail label={t("investors.nomineeName")}>
              {investor?.nominee?.name}
            </Detail>
            <Detail label={t("investors.nomineeRelation")}>
              {investor?.nominee?.relation}
            </Detail>
            <Detail label={t("investors.nomineePhone")}>
              {phoneLink(investor?.nominee?.phone)}
            </Detail>
          </DetailSection>
          <TheirVentures investor={investor} />
        </div>
        {investor ? (
          <InvestorActions investor={investor} onEdit={onEdit} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
};
