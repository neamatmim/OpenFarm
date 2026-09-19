import { formatNumber } from "@OpenFarm/i18n";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@OpenFarm/ui/components/sheet";
import { useQuery } from "@tanstack/react-query";

import { EmptyState, RecordList, RecordRow } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

/**
 * Which of a Venture's bulls earned and which did not.
 *
 * Worst first, because the question this answers is which one disappointed — a list that opens on the
 * best of them is a list somebody has to read to the bottom to learn anything. The ones with nothing to
 * compare follow, rather than sorting as though they had lost money.
 *
 * A **Margin** arrives only when she is sold; a **Cost of Gain** arrives as soon as she has been weighed
 * twice. So most of a running Venture reads as a rate and no margin, which is the truth about it.
 */
export const EconomicsSheet = ({
  venture,
  open,
  onOpenChange,
}: {
  venture: { id: string; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t, language } = useLanguage();
  const herd = useQuery({
    ...orpc.ventures.economics.queryOptions({
      input: { ventureId: venture?.id ?? "" },
    }),
    enabled: venture !== null,
  });
  const taka = (bdt: number) => `৳${formatNumber(bdt, language)}`;
  const orDash = (bdt: number | null) => (bdt === null ? "—" : taka(bdt));
  const { data } = herd;
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg"
        closeLabel={t("common.close")}
      >
        <SheetHeader className="border-b">
          <SheetTitle>{venture?.name ?? t("ventures.economics")}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          {data && data.animals.length === 0 ? (
            <EmptyState title={t("ventures.noAnimalsYet")} />
          ) : null}
          {data && data.animals.length > 0 ? (
            <>
              <div className="mb-4 grid grid-cols-2 gap-2 rounded-md border p-3 text-sm">
                <span className="text-muted-foreground">
                  {t("ventures.herdMargin")}
                </span>
                <span className="text-right font-medium tabular-nums">
                  {orDash(data.marginBdt)}
                </span>
                <span className="text-muted-foreground">
                  {t("ventures.herdCostOfGain")}
                </span>
                <span className="text-right font-medium tabular-nums">
                  {orDash(data.costOfGainBdt)}
                </span>
                <span className="text-muted-foreground">
                  {t("ventures.soldAndUnsold")}
                </span>
                <span className="text-right font-medium tabular-nums">
                  {`${formatNumber(data.soldCount, language)} · ${formatNumber(
                    data.unsoldCount,
                    language
                  )}`}
                </span>
              </div>
              <RecordList>
                {data.animals.map((one) => (
                  <RecordRow
                    key={one.tagNumber}
                    meta={
                      <>
                        <span>
                          {t("ventures.costOfGainIs", {
                            rate: orDash(one.costOfGainBdt),
                          })}
                        </span>
                        <span>
                          {t("ventures.boughtAndSold", {
                            bought: orDash(one.purchaseBdt),
                            sold: orDash(one.saleBdt),
                          })}
                        </span>
                      </>
                    }
                    title={`${one.tagNumber} · ${orDash(one.marginBdt)}`}
                  />
                ))}
              </RecordList>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
};
