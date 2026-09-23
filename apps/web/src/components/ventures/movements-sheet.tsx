import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate } from "@OpenFarm/i18n";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@OpenFarm/ui/components/sheet";
import { useQuery } from "@tanstack/react-query";

import { useInvestorNames } from "@/components/investors/investor-names";
import { RecordList, RecordRow } from "@/components/page";
import { CorrectMovement } from "@/components/ventures/correct-movement";
import { useLanguage } from "@/i18n/language-provider";
import { useTaka } from "@/lib/taka";
import { orpc } from "@/utils/orpc";

/** What each kind of movement is called, in the reader's own language. */
const KIND_WORD = {
  capital_in: "ventures.kind.capitalIn",
  refund: "ventures.kind.refund",
  float_out: "ventures.kind.floatOut",
  float_back: "ventures.kind.floatBack",
  internal_buy: "ventures.kind.internalBuy",
  internal_sell: "ventures.kind.internalSell",
  sale_in: "ventures.kind.saleIn",
  reimbursement: "ventures.kind.reimbursement",
  advance: "ventures.kind.advance",
  payout: "ventures.kind.payout",
  advance_repaid: "ventures.kind.advanceRepaid",
  farm_share: "ventures.kind.farmShare",
  farm_loss_in: "ventures.kind.farmLossIn",
} as const satisfies Record<string, MessageKey>;

/**
 * Every movement of one Venture's money, oldest first, each with a way to put right what it says.
 *
 * The Owner looks here when a figure elsewhere is wrong, because everything a Venture shows about money
 * is read from this list.
 */
export const MovementsSheet = ({
  venture,
  open,
  onOpenChange,
}: {
  venture: { id: string; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const nameOf = useInvestorNames();
  const movements = useQuery({
    ...orpc.ventures.movements.queryOptions({
      input: { ventureId: venture?.id ?? "" },
    }),
    enabled: venture !== null,
  });
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg"
        closeLabel={t("common.close")}
      >
        <SheetHeader className="border-b">
          <SheetTitle>{venture?.name ?? t("ventures.movements")}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          <RecordList>
            {(movements.data ?? []).map((one) => (
              <RecordRow
                key={one.id}
                meta={
                  <>
                    <span>
                      {formatDate(new Date(one.movedOn), language, "date")}
                    </span>
                    <span>{one.reference}</span>
                    {one.investorId ? (
                      <span>{nameOf(one.investorId)}</span>
                    ) : null}
                  </>
                }
                title={`${t(KIND_WORD[one.kind])} · ${taka(one.amountBdt)}`}
                trailing={<CorrectMovement movement={one} />}
              />
            ))}
          </RecordList>
        </div>
      </SheetContent>
    </Sheet>
  );
};
