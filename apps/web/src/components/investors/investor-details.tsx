import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@OpenFarm/ui/components/sheet";
import { cn } from "@OpenFarm/ui/lib/utils";
import { Check, Copy } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import type { Investor } from "@/components/investors/investor-types";
import { TagChip } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";

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

/**
 * Everything the farm holds about one Investor, read-only, in the three parts it was written in: who they are,
 * where their money goes, and their nominee.
 *
 * The NID and the bank account are asked for when the person is recorded, because the stamped Agreement
 * needs the one and the payout needs the other — and until now neither was ever shown back, so the Owner
 * could not check what she had typed against the paper in her hand.
 */
export const InvestorDetails = ({
  investor,
  onOpenChange,
}: {
  investor: Investor | null;
  onOpenChange: (open: boolean) => void;
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
          <SheetDescription className="flex items-center gap-2">
            <span>{t("investors.unitsHeld")}</span>
            <TagChip>
              {t("investors.holds", {
                units: formatNumber(investor?.unitsHeld ?? 0, language),
              })}
            </TagChip>
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
        </div>
      </SheetContent>
    </Sheet>
  );
};
