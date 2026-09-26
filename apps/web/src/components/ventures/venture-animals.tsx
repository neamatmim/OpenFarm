import { formatNumber } from "@OpenFarm/i18n";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@OpenFarm/ui/components/table";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Beef } from "lucide-react";

import { EmptyState, Section } from "@/components/page";
import { Line } from "@/components/ventures/venture-card";
import { useLanguage } from "@/i18n/language-provider";
import { useKg } from "@/lib/kg";
import { useTaka, useTakaToThePaisa } from "@/lib/taka";
import type { Venture } from "@/lib/ventures";
import { orpc } from "@/utils/orpc";

/** Where one of its animals is now: still hers, sold, or gone some other way — died or culled. */
const whereSheIs = (
  standing: boolean | undefined,
  saleBdt: number | null | undefined
) => {
  if (standing) {
    return "ventures.page.standing" as const;
  }
  return saleBdt === null || saleBdt === undefined
    ? ("ventures.page.gone" as const)
    : ("ventures.page.sold" as const);
};

/**
 * The animals this Venture's money bought: each one's weight when she came and now, how fast she is gaining,
 * what she cost, what she fetched and what she made — worst first once any are sold, because the question a
 * herd's figures answer is which one did not earn.
 *
 * Two answers joined by Tag Number: the herd's weighings, and each animal's costing.
 */
export const VentureAnimals = ({ venture }: { venture: Venture }) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const weight = useKg();
  const rate = useTakaToThePaisa();
  const input = { input: { ventureId: venture.id } };
  const herd = useQuery(orpc.ventures.herd.queryOptions(input));
  const money = useQuery(orpc.ventures.economics.queryOptions(input));
  if (herd.isPending || money.isPending) {
    return <Skeleton className="h-40 rounded-xl" />;
  }
  const weights = new Map(
    (herd.data?.animals ?? []).map((one) => [one.tagNumber, one] as const)
  );
  const animals = money.data?.animals ?? [];
  if (animals.length === 0) {
    return (
      <Section>
        <EmptyState bare icon={Beef} title={t("ventures.noAnimalsYet")} />
      </Section>
    );
  }
  const orDash = (bdt: number | null) => (bdt === null ? "—" : taka(bdt));
  const kg = (value: number | null | undefined) =>
    value === null || value === undefined ? "—" : weight(value);
  return (
    <div className="flex flex-col gap-4">
      <Section>
        <div className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Line label={t("ventures.page.standing")}>
            {formatNumber(herd.data?.standingCount ?? 0, language)}
          </Line>
          <Line label={t("ventures.page.sold")}>
            {formatNumber(herd.data?.soldCount ?? 0, language)}
          </Line>
          <Line label={t("ventures.herdMargin")}>
            {orDash(money.data?.marginBdt ?? null)}
          </Line>
          <Line label={t("ventures.herdCostOfGain")}>
            {money.data?.costOfGainBdt === null ||
            money.data?.costOfGainBdt === undefined
              ? "—"
              : rate(money.data.costOfGainBdt)}
          </Line>
        </div>
      </Section>
      <Section>
        <div className="-mx-4 overflow-x-auto md:-mx-5">
          <Table className="min-w-[48rem]">
            <TableHeader>
              <TableRow>
                <TableHead className="ps-4 md:ps-5">
                  {t("ventures.page.tag")}
                </TableHead>
                <TableHead>{t("ventures.page.whereSheIs")}</TableHead>
                <TableHead className="text-end">
                  {t("ventures.page.weight")}
                </TableHead>
                <TableHead className="text-end">
                  {t("ventures.page.dailyGain")}
                </TableHead>
                <TableHead className="text-end">
                  {t("ventures.page.bought")}
                </TableHead>
                <TableHead className="text-end">
                  {t("ventures.page.fetched")}
                </TableHead>
                <TableHead className="text-end">
                  {t("ventures.herdCostOfGain")}
                </TableHead>
                <TableHead className="pe-4 text-end md:pe-5">
                  {t("ventures.page.margin")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {animals.map((one) => {
                const weighed = weights.get(one.tagNumber);
                // Named, because the guard against untranslated JSX text reads an angle bracket in a
                // comparison as a tag.
                const lostMoney = one.marginBdt !== null && one.marginBdt < 0;
                return (
                  <TableRow key={one.tagNumber}>
                    <TableCell className="ps-4 md:ps-5">
                      <Link
                        className="font-mono font-semibold tabular-nums underline-offset-4 hover:underline focus-visible:underline"
                        params={{ tagNumber: one.tagNumber }}
                        to="/animals/$tagNumber"
                      >
                        {one.tagNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {t(whereSheIs(weighed?.standing, one.saleBdt))}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {`${kg(weighed?.intakeKg)} → ${kg(weighed?.latestKg)}`}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {weighed?.dailyGainKg === null ||
                      weighed?.dailyGainKg === undefined
                        ? "—"
                        : t("units.kgADay", {
                            kg: formatNumber(weighed.dailyGainKg, language),
                          })}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {orDash(one.purchaseBdt)}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {orDash(one.saleBdt)}
                    </TableCell>
                    {/* What each kilogram she put on cost: the figure the run is judged by, per animal. */}
                    <TableCell className="text-end tabular-nums">
                      {one.costOfGainBdt === null
                        ? "—"
                        : rate(one.costOfGainBdt)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "pe-4 text-end font-medium tabular-nums md:pe-5",
                        lostMoney && "text-danger"
                      )}
                    >
                      {orDash(one.marginBdt)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Section>
    </div>
  );
};
