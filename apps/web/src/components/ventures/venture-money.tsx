import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate } from "@OpenFarm/i18n";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@OpenFarm/ui/components/table";
import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { useState } from "react";

import { TagLink } from "@/components/fattening/fattening-words";
import { useInvestorNames } from "@/components/investors/investor-names";
import { EmptyState, Section } from "@/components/page";
import { NativeSelect } from "@/components/page-kit";
import { CorrectMovement } from "@/components/ventures/correct-movement";
import { useLanguage } from "@/i18n/language-provider";
import { useTaka } from "@/lib/taka";
import type { Venture } from "@/lib/ventures";
import { orpc } from "@/utils/orpc";

/** What each kind of movement is called, in the reader's own language. */
export const KIND_WORD = {
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

type Showing = "all" | "in" | "out";

/**
 * Each movement with which way it went and what the account held after it: the line before it, plus or minus
 * this one. Worked out in one pass, oldest first, which is the order the list arrives in.
 */
const withBalances = <
  T extends { direction?: "in" | "out"; amountBdt: number },
>(
  movements: readonly T[]
) => {
  const read: (T & { coming: boolean; after: number })[] = [];
  for (const one of movements) {
    const coming = one.direction === "in";
    const before = read.at(-1)?.after ?? 0;
    read.push({
      ...one,
      coming,
      after: before + (coming ? one.amountBdt : -one.amountBdt),
    });
  }
  return read;
};

/**
 * Every movement of the Venture's money, oldest first, as its account would read: what came in, what went
 * out, and what it held after each — so the last line is the balance the farm keeps, and a figure that looks
 * wrong can be followed back to the day it went wrong and put right there.
 *
 * Which way each moved the account is the server's to say, from the same sum the balance is kept by, so this
 * list cannot add up to a different figure. Narrowing to money in or out keeps the balance column as the
 * account read on each day, because a balance of only the rows on show would be a figure no bank ever printed.
 */
export const VentureMoney = ({ venture }: { venture: Venture }) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const nameOf = useInvestorNames();
  const [showing, setShowing] = useState<Showing>("all");
  const movements = useQuery(
    orpc.ventures.movements.queryOptions({ input: { ventureId: venture.id } })
  );
  const all = movements.data ?? [];
  // A list cached before the answer said which way each movement went cannot be added up, so it is waited
  // past rather than read: the fresh answer is already on its way, and a balance guessed at is worse.
  const unreadable = all.some((one) => one.direction === undefined);
  if (movements.isPending || unreadable) {
    return <Skeleton className="h-40 rounded-xl" />;
  }
  if (all.length === 0) {
    return (
      <Section>
        <EmptyState bare icon={ScrollText} title={t("ventures.page.noMoney")} />
      </Section>
    );
  }
  const read = withBalances(all);
  const closing = read.at(-1)?.after ?? 0;
  const shown = read.filter(
    (one) => showing === "all" || (showing === "in" ? one.coming : !one.coming)
  );
  const totalIn = read
    .filter((one) => one.coming)
    .reduce((sum, one) => sum + one.amountBdt, 0);
  const totalOut = read
    .filter((one) => !one.coming)
    .reduce((sum, one) => sum + one.amountBdt, 0);
  return (
    <Section
      action={
        <NativeSelect
          aria-label={t("ventures.page.showing")}
          className="sm:w-48"
          onChange={(event) => setShowing(event.target.value as Showing)}
          value={showing}
        >
          <option value="all">{t("ventures.page.showAll")}</option>
          <option value="in">{t("ventures.page.showIn")}</option>
          <option value="out">{t("ventures.page.showOut")}</option>
        </NativeSelect>
      }
      title={t("ventures.movements")}
    >
      <div className="-mx-4 overflow-x-auto md:-mx-5">
        <Table className="min-w-[52rem]">
          <TableHeader>
            <TableRow>
              <TableHead className="ps-4 md:ps-5">
                {t("ventures.page.on")}
              </TableHead>
              <TableHead>{t("ventures.page.what")}</TableHead>
              <TableHead>{t("ventures.page.reference")}</TableHead>
              <TableHead className="text-end">
                {t("ventures.page.in")}
              </TableHead>
              <TableHead className="text-end">
                {t("ventures.page.out")}
              </TableHead>
              <TableHead className="text-end">
                {t("ventures.page.after")}
              </TableHead>
              <TableHead className="pe-4 md:pe-5">
                <span className="sr-only">{t("common.col.actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((one) => (
              <TableRow key={one.id}>
                <TableCell className="ps-4 whitespace-nowrap tabular-nums md:ps-5">
                  {formatDate(new Date(one.movedOn), language, "date")}
                </TableCell>
                <TableCell>
                  <span className="flex flex-col">
                    <span>{t(KIND_WORD[one.kind])}</span>
                    {one.tagNumber ? (
                      <TagLink tagNumber={one.tagNumber} />
                    ) : null}
                    {one.investorId ? (
                      <span className="text-muted-foreground text-xs">
                        {nameOf(one.investorId)}
                      </span>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {one.reference}
                </TableCell>
                <TableCell className="text-success text-end tabular-nums">
                  {one.coming ? taka(one.amountBdt) : null}
                </TableCell>
                <TableCell className="text-end tabular-nums">
                  {one.coming ? null : taka(one.amountBdt)}
                </TableCell>
                <TableCell className="text-end font-medium tabular-nums">
                  {taka(one.after)}
                </TableCell>
                <TableCell className="pe-4 text-end md:pe-5">
                  {/* Only where the farm will take a Correction: not a Sale's or an Internal Sale's money, not a
                      counted Float, not a settled or called-off Venture — the farm's own word for each. */}
                  {one.whyItStands ? null : <CorrectMovement movement={one} />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="ps-4 font-medium md:ps-5" colSpan={3}>
                {t("ventures.page.total")}
              </TableCell>
              <TableCell className="text-success text-end font-medium tabular-nums">
                {taka(totalIn)}
              </TableCell>
              <TableCell className="text-end font-medium tabular-nums">
                {taka(totalOut)}
              </TableCell>
              <TableCell className="text-end font-semibold tabular-nums">
                {taka(closing)}
              </TableCell>
              <TableCell className="pe-4 md:pe-5" />
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </Section>
  );
};
