import { farmDayOf, feedUnitWord } from "@OpenFarm/domain";
import { FEED_PLAN_SCENARIOS } from "@OpenFarm/domain/feeding-plan";
import type { FeedPlanScenario } from "@OpenFarm/domain/feeding-plan";
import { formatNumber } from "@OpenFarm/i18n";
import { Field, FieldGroup, FieldLabel } from "@OpenFarm/ui/components/field";
import { Input } from "@OpenFarm/ui/components/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@OpenFarm/ui/components/table";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@OpenFarm/ui/components/toggle-group";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarDays, Coins, Wheat } from "lucide-react";

import { EmptyState, Loaded, Notice, Section } from "@/components/page";
import { SummaryFigures } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useMoney } from "@/lib/money";
import { isAMonth } from "@/lib/months";
import { namesIn } from "@/lib/names-in";
import { orpc } from "@/utils/orpc";

import { ForecastPurchasePicker } from "./feed-purchase-request";

export const FeedingPlansTab = ({
  month,
  scenario = "expected",
  onMonth,
  onScenario,
}: {
  month: string;
  scenario?: FeedPlanScenario;
  onMonth: (value: string) => void;
  onScenario: (value: FeedPlanScenario) => void;
}) => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  const query = useQuery(
    orpc.feedingPlans.summary.queryOptions({ input: { month, scenario } })
  );
  const summary = query.data;
  return (
    <div className="flex flex-col gap-4">
      <Section
        title={t("feedPlan.farmTitle")}
        description={t("feedPlan.farmHint")}
      >
        <FieldGroup className="sm:flex-row sm:items-end">
          <Field className="sm:max-w-56">
            <FieldLabel htmlFor="farm-plan-month">
              {t("feedPlan.period")}
            </FieldLabel>
            <Input
              id="farm-plan-month"
              type="month"
              min={farmDayOf(new Date()).slice(0, 7)}
              value={month}
              onChange={(event) => {
                if (isAMonth(event.target.value)) {
                  onMonth(event.target.value);
                }
              }}
            />
          </Field>
          <Field>
            <FieldLabel>{t("feedPlan.scenario")}</FieldLabel>
            <ToggleGroup
              className="max-w-full flex-wrap"
              value={[scenario]}
              onValueChange={(values) => {
                const [value] = values;
                if (
                  value === "slow" ||
                  value === "expected" ||
                  value === "fast"
                ) {
                  onScenario(value);
                }
              }}
              aria-label={t("feedPlan.scenario")}
            >
              {FEED_PLAN_SCENARIOS.map((one) => (
                <ToggleGroupItem key={one} value={one}>
                  {t(`feedPlan.${one}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
        </FieldGroup>
      </Section>
      <Loaded query={query}>
        {summary ? (
          <>
            <SummaryFigures
              figures={[
                {
                  label: t("feedPlan.plannedAnimals"),
                  value: formatNumber(
                    summary.rows.filter((row) => row.planned).length,
                    language
                  ),
                  icon: Wheat,
                },
                {
                  label: t("feedPlan.withoutPlan"),
                  value: formatNumber(summary.withoutPlan, language),
                  icon: CalendarDays,
                  tone: summary.withoutPlan > 0 ? "warning" : "neutral",
                },
                {
                  label: t("feedPlan.purchaseCost"),
                  value:
                    summary.unpriced > 0 &&
                    summary.unpriced === summary.lines.length
                      ? t("feed.estimate.unpriced")
                      : asMoney(summary.knownMoney),
                  hint: t("feedPlan.costHint"),
                  icon: Coins,
                },
              ]}
            />
            {summary.withoutPlan > 0 ? (
              <Notice
                tone="warning"
                title={t("feedPlan.withoutPlanWarning", {
                  count: summary.withoutPlan,
                })}
              >
                {t("feedPlan.coverageHint")}
              </Notice>
            ) : null}
            {summary.incomplete > 0 ? (
              <Notice
                tone="warning"
                title={t("feedPlan.incompleteWarning", {
                  count: summary.incomplete,
                })}
              >
                {t("feedPlan.coverageHint")}
              </Notice>
            ) : null}
            <Notice tone="info" title={t("feedPlan.stockAssumption")}>
              {t("feedPlan.stockHint")}
            </Notice>
            <Section title={t("feedPlan.monthlyPurchases")}>
              <ForecastPurchasePicker
                month={month}
                basis="planning"
                scenario={scenario}
                lines={summary.lines
                  .filter((line) => line.toBuy > 0 && !line.retired)
                  .map((line) => ({
                    ...line,
                    quantity: line.toBuy,
                    unitPriceMoney:
                      line.money === null
                        ? null
                        : Math.round((line.money / line.toBuy) * 100) / 100,
                  }))}
              />
              {summary.lines.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("stock.col.item")}</TableHead>
                      <TableHead>{t("feedPlan.required")}</TableHead>
                      <TableHead>{t("feedPlan.withReserve")}</TableHead>
                      <TableHead>{t("feedPlan.carriedStock")}</TableHead>
                      <TableHead>{t("feedPlan.toBuy")}</TableHead>
                      <TableHead>{t("feedPlan.cost")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.lines.map((line) => (
                      <TableRow key={line.feedItemId}>
                        <TableCell>
                          {namesIn(line, language).shown}
                          {line.retired ? (
                            <span className="text-warning block text-xs">
                              {t("feedPlan.retired")}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {formatNumber(line.required, language)}{" "}
                          {feedUnitWord(line.unit, language)}
                        </TableCell>
                        <TableCell>
                          {formatNumber(line.withReserve, language)}{" "}
                          {feedUnitWord(line.unit, language)}
                        </TableCell>
                        <TableCell>
                          {formatNumber(line.carried, language)}{" "}
                          {feedUnitWord(line.unit, language)}
                        </TableCell>
                        <TableCell>
                          {formatNumber(line.toBuy, language)}{" "}
                          {feedUnitWord(line.unit, language)}
                        </TableCell>
                        <TableCell>
                          {line.money === null
                            ? t("feed.estimate.unpriced")
                            : asMoney(line.money)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState icon={Wheat} title={t("feedPlan.noDemand")} />
              )}
              {summary.unpriced > 0 ? (
                <p className="text-muted-foreground text-sm">
                  {t("feedPlan.unpriced", { count: summary.unpriced })}
                </p>
              ) : null}
            </Section>
            <Section
              title={t("feedPlan.animals")}
              description={t("feedPlan.animalsHint")}
            >
              {summary.rows.length === 0 ? (
                <EmptyState icon={Wheat} title={t("feedPlan.noAnimals")} />
              ) : (
                <div className="flex flex-col gap-3">
                  {summary.rows.map((row) => (
                    <div
                      key={row.tagNumber}
                      className="flex flex-wrap items-baseline justify-between gap-2"
                    >
                      <Link
                        className="text-primary font-medium underline"
                        to="/animals/$tagNumber/feeding-plan"
                        params={{ tagNumber: row.tagNumber }}
                      >
                        {row.tagNumber}
                      </Link>
                      <div className="text-muted-foreground flex flex-wrap gap-2 text-sm">
                        {row.planned ? (
                          <>
                            <span>
                              {row.endWeightKg === null
                                ? t("feedPlan.incomplete")
                                : t("feedPlan.projectedKg", {
                                    kg: formatNumber(row.endWeightKg, language),
                                  })}
                            </span>
                            {row.weightOverdue ? (
                              <span className="text-warning">
                                {t("feedPlan.overdue")}
                              </span>
                            ) : null}
                            {row.rationMismatch ? (
                              <span className="text-warning">
                                {t("feedPlan.rationReview")}
                              </span>
                            ) : null}
                            {row.finished ? (
                              <span className="text-warning">
                                {t("feedPlan.finished")}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span>{t("feedPlan.empty")}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </>
        ) : null}
      </Loaded>
    </div>
  );
};
