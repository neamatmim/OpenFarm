import { formatNumber } from "@OpenFarm/i18n";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@OpenFarm/ui/components/sheet";
import type { ReactNode } from "react";

import type { Investor } from "@/components/investors/investor-types";
import { RecordList, RecordRow } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";

/** One thing the farm wrote down, or plainly that it did not. A blank is said in words rather than left
 *  as an empty line, so a missing NID reads as missing rather than as a page that failed to draw. */
const Fact = ({ label, children }: { label: string; children?: ReactNode }) => {
  const { t } = useLanguage();
  return (
    <RecordRow
      title={label}
      // Wrapped rather than truncated: she is holding the stamped paper and checking the farm's copy
      // against it, and half a bank account number is worse than none. Its lines are kept as she typed them:
      // an account written as name, number, bank and branch reads as four lines, not one run-on.
      trailing={
        <span className="text-muted-foreground max-w-64 text-end text-sm break-words whitespace-pre-line">
          {children === "" || children === null || children === undefined
            ? t("investors.notGiven")
            : children}
        </span>
      }
    />
  );
};

/**
 * Everything the farm holds about one Investor, read-only.
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
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg"
        closeLabel={t("common.close")}
      >
        <SheetHeader className="border-b">
          <SheetTitle>{investor?.name ?? t("investors.details")}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          <RecordList>
            <Fact label={t("investors.phone")}>{investor?.phone}</Fact>
            <Fact label={t("investors.address")}>{investor?.address}</Fact>
            <Fact label={t("investors.nid")}>{investor?.nid}</Fact>
            <Fact label={t("investors.bank")}>{investor?.bankAccount}</Fact>
            <Fact label={t("investors.nominee")}>
              {investor?.nominee?.name}
            </Fact>
            <Fact label={t("investors.nomineePhone")}>
              {investor?.nominee?.phone}
            </Fact>
            <Fact label={t("investors.nomineeRelation")}>
              {investor?.nominee?.relation}
            </Fact>
            <Fact label={t("investors.unitsHeld")}>
              {investor ? formatNumber(investor.unitsHeld, language) : null}
            </Fact>
          </RecordList>
        </div>
      </SheetContent>
    </Sheet>
  );
};
