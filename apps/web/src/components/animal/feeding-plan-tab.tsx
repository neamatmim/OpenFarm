import { farmDayOf, feedUnitWord, startOfFarmDay } from "@OpenFarm/domain";
import type { FeedingPlan } from "@OpenFarm/domain/feeding-plan";
import {
  FEED_PLAN_SCENARIOS,
  feedingPlanProblems,
  forecastFeedingPlan,
} from "@OpenFarm/domain/feeding-plan";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Checkbox } from "@OpenFarm/ui/components/checkbox";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@OpenFarm/ui/components/field";
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarDays, ClipboardList, Scale, Wheat } from "lucide-react";
import { useState } from "react";

import { EmptyState, Loaded, Notice, Section } from "@/components/page";
import {
  FormDialog,
  NativeSelect,
  SummaryFigures,
} from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useMoney } from "@/lib/money";
import { saidMonth } from "@/lib/months";
import { namesIn } from "@/lib/names-in";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

import type { AnimalDetail } from "./animal-types";

type Detail = Awaited<ReturnType<typeof orpc.feedingPlans.get.call>>;
type Forecast = NonNullable<Detail["view"]>["forecasts"][number];

/** Calendar months, clamped to the target month's last day (January 31 + nine months is October 31). */
const nineMonthsAfter = (day: string): string => {
  const at = new Date(`${day}T00:00:00Z`);
  const wantedDay = at.getUTCDate();
  at.setUTCDate(1);
  at.setUTCMonth(at.getUTCMonth() + 9);
  const end = new Date(at);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  at.setUTCDate(Math.min(wantedDay, end.getUTCDate()));
  return at.toISOString().slice(0, 10);
};

const validPlanNumbers = (
  fields: [string, number, number, boolean][]
): boolean =>
  fields.every(([input, min, max, integer]) => {
    const value = Number(input);
    return (
      input !== "" &&
      Number.isFinite(value) &&
      value >= min &&
      value <= max &&
      (!integer || Number.isInteger(value))
    );
  });

const eligiblePlanStages = (detail: Detail) =>
  detail.options
    .filter(
      (one) =>
        one.gain !== null &&
        (one.band.fromKg !== null || one.band.toKg !== null)
    )
    .toSorted((a, b) => (a.band.fromKg ?? 0) - (b.band.fromKg ?? 0));
const initialArrivalRation = (detail: Detail): string =>
  detail.plan?.arrival?.rationId ?? "";

const PlanEditor = ({
  detail,
  onClose,
}: {
  detail: Detail;
  onClose: () => void;
}) => {
  const { t, language } = useLanguage();
  const cache = useQueryClient();
  const initial = detail.plan ?? detail.defaults;
  const [startDay, setStartDay] = useState(initial.startDay);
  const [startWeightKg, setStartWeightKg] = useState(
    String(initial.startWeightKg || "")
  );
  const [saleDay, setSaleDay] = useState(initial.saleDay);
  const [targetWeightKg, setTargetWeightKg] = useState(
    String(initial.targetWeightKg)
  );
  const [adaptationDays, setAdaptationDays] = useState(
    String(initial.adaptationDays)
  );
  const [transitionDays, setTransitionDays] = useState(
    String(initial.transitionDays)
  );
  const [reviewDays, setReviewDays] = useState(String(initial.reviewDays));
  const [reservePercent, setReservePercent] = useState(
    String(initial.reservePercent)
  );
  const [arrivalId, setArrivalId] = useState(initialArrivalRation(detail));
  const eligible = eligiblePlanStages(detail);
  const [stageIds, setStageIds] = useState(
    detail.plan?.stages.map((one) => one.rationId) ??
      eligible.map((one) => one.rationId)
  );
  const snapshot: FeedingPlan = {
    startDay,
    startWeightKg: Number(startWeightKg),
    saleDay,
    targetWeightKg: Number(targetWeightKg),
    adaptationDays: Number(adaptationDays),
    transitionDays: Number(transitionDays),
    reviewDays: Number(reviewDays),
    reservePercent: Number(reservePercent),
    arrival: detail.options.find((one) => one.rationId === arrivalId) ?? null,
    stages: detail.options.filter((one) => stageIds.includes(one.rationId)),
  };
  const validDay =
    /^\d{4}-\d{2}-\d{2}$/u.test(startDay) &&
    /^\d{4}-\d{2}-\d{2}$/u.test(saleDay);
  const numericFieldsValid = validPlanNumbers([
    [startWeightKg, 0.1, 2000, false],
    [targetWeightKg, 0.1, 2000, false],
    [adaptationDays, 0, 60, true],
    [transitionDays, 0, 30, true],
    [reviewDays, 7, 90, true],
    [reservePercent, 0, 50, false],
  ]);
  const problems = validDay ? feedingPlanProblems(snapshot) : ["duration"];
  const preview =
    validDay && numericFieldsValid && problems.length === 0
      ? forecastFeedingPlan(snapshot, "fast")
      : null;
  const ready =
    preview !== null &&
    preview.stopped === null &&
    startDay <= farmDayOf(new Date());
  const save = useMutation(orpc.feedingPlans.save.mutationOptions());
  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={t(detail.plan ? "feedPlan.revise" : "feedPlan.create")}
      description={t("feedPlan.approvalHint")}
      submitLabel={t("feedPlan.save")}
      ready={ready}
      pending={save.isPending}
      onSubmit={async () => {
        await save.mutateAsync({
          tagNumber: detail.tagNumber,
          previousPlanId: detail.planId,
          startDay,
          startWeightKg: Number(startWeightKg),
          saleDay,
          targetWeightKg: Number(targetWeightKg),
          adaptationDays: Number(adaptationDays),
          transitionDays: Number(transitionDays),
          reviewDays: Number(reviewDays),
          reservePercent: Number(reservePercent),
          arrivalRationId: arrivalId || null,
          stageRationIds: stageIds,
        });
        await cache.invalidateQueries({ queryKey: orpc.feedingPlans.key() });
        toast.success(t("feedPlan.saved"));
        onClose();
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="plan-start">{t("feedPlan.startDay")}</FieldLabel>
          <Input
            id="plan-start"
            type="date"
            max={farmDayOf(new Date())}
            value={startDay}
            onChange={(event) => setStartDay(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="plan-weight">
            {t("feedPlan.startWeight")}
          </FieldLabel>
          <Input
            id="plan-weight"
            type="number"
            min="1"
            max="2000"
            step="0.1"
            value={startWeightKg}
            onChange={(event) => setStartWeightKg(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="plan-sale">{t("feedPlan.saleDay")}</FieldLabel>
          <Input
            id="plan-sale"
            type="date"
            value={saleDay}
            onChange={(event) => setSaleDay(event.target.value)}
          />
          <Button
            variant="outline"
            size="sm"
            type="button"
            disabled={!/^\d{4}-\d{2}-\d{2}$/u.test(startDay)}
            onClick={() => setSaleDay(nineMonthsAfter(startDay))}
          >
            {t("feedPlan.nineMonths")}
          </Button>
        </Field>
        <Field>
          <FieldLabel htmlFor="plan-target">{t("feedPlan.target")}</FieldLabel>
          <Input
            id="plan-target"
            type="number"
            min="1"
            max="2000"
            step="0.1"
            value={targetWeightKg}
            onChange={(event) => setTargetWeightKg(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="plan-adapt">
            {t("feedPlan.adaptationDays")}
          </FieldLabel>
          <Input
            id="plan-adapt"
            type="number"
            min="0"
            max="60"
            step="1"
            value={adaptationDays}
            onChange={(event) => setAdaptationDays(event.target.value)}
          />
          <FieldDescription>{t("feedPlan.adaptationHint")}</FieldDescription>
        </Field>
        {Number(adaptationDays) > 0 ? (
          <Field>
            <FieldLabel htmlFor="plan-arrival">
              {t("feedPlan.arrival")}
            </FieldLabel>
            <NativeSelect
              id="plan-arrival"
              value={arrivalId}
              onChange={(event) => setArrivalId(event.target.value)}
            >
              <option value="">—</option>
              {detail.options.map((one) => (
                <option key={one.rationId} value={one.rationId}>
                  {namesIn(one, language).shown}
                </option>
              ))}
            </NativeSelect>
          </Field>
        ) : null}
        <FieldSet>
          <FieldLegend>{t("feedPlan.stages")}</FieldLegend>
          <FieldDescription>{t("feedPlan.stagesHint")}</FieldDescription>
          <FieldGroup>
            {eligible.map((one) => (
              <Field key={one.rationId} orientation="horizontal">
                <Checkbox
                  id={`plan-stage-${one.rationId}`}
                  checked={stageIds.includes(one.rationId)}
                  onCheckedChange={(checked) =>
                    setStageIds((ids) =>
                      checked
                        ? [...ids, one.rationId]
                        : ids.filter((id) => id !== one.rationId)
                    )
                  }
                />
                <FieldLabel htmlFor={`plan-stage-${one.rationId}`}>
                  {namesIn(one, language).shown} ·{" "}
                  {formatNumber(one.band.fromKg ?? 0, language)}–
                  {one.band.toKg === null
                    ? "∞"
                    : formatNumber(one.band.toKg, language)}{" "}
                  {feedUnitWord("kg", language)}
                </FieldLabel>
              </Field>
            ))}
          </FieldGroup>
        </FieldSet>
        <Field>
          <FieldLabel htmlFor="plan-transition">
            {t("feedPlan.transitionDays")}
          </FieldLabel>
          <Input
            id="plan-transition"
            type="number"
            min="0"
            max="30"
            step="1"
            value={transitionDays}
            onChange={(event) => setTransitionDays(event.target.value)}
          />
          <FieldDescription>{t("feedPlan.transitionHint")}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="plan-review">
            {t("feedPlan.reviewDays")}
          </FieldLabel>
          <Input
            id="plan-review"
            type="number"
            min="7"
            max="90"
            step="1"
            value={reviewDays}
            onChange={(event) => setReviewDays(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="plan-reserve">
            {t("feedPlan.reserve")}
          </FieldLabel>
          <Input
            id="plan-reserve"
            type="number"
            min="0"
            max="50"
            step="1"
            value={reservePercent}
            onChange={(event) => setReservePercent(event.target.value)}
          />
        </Field>
      </FieldGroup>
      <output className="text-muted-foreground text-sm">
        {ready && preview
          ? t("feedPlan.preview", {
              kg: formatNumber(preview.endWeightKg ?? 0, language),
            })
          : t("feedPlan.checkStages")}
      </output>
      <Link className="text-primary text-sm underline" to="/feed/rations">
        {t("feedPlan.manageRations")}
      </Link>
    </FormDialog>
  );
};

const ForecastFeeds = ({ forecast }: { forecast: Forecast }) => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  const [month, setMonth] = useState("all");
  const shown = forecast.months.find((one) => one.month === month) ?? forecast;
  return (
    <Section
      title={t("feedPlan.quantities")}
      description={t("feedPlan.quantitiesHint")}
    >
      <Field>
        <FieldLabel htmlFor="plan-month">{t("feedPlan.period")}</FieldLabel>
        <NativeSelect
          id="plan-month"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
        >
          <option value="all">{t("feedPlan.remaining")}</option>
          {forecast.months.map((one) => (
            <option key={one.month} value={one.month}>
              {saidMonth(one.month, language)}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("stock.col.item")}</TableHead>
            <TableHead>{t("feedPlan.required")}</TableHead>
            <TableHead>{t("feedPlan.withReserve")}</TableHead>
            <TableHead>{t("feedPlan.cost")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.lines.map((line) => (
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
                {formatNumber(line.quantity, language)}{" "}
                {feedUnitWord(line.unit, language)}
              </TableCell>
              <TableCell>
                {formatNumber(line.withReserve, language)}{" "}
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
      <p className="text-muted-foreground text-sm">
        {shown.unpriced > 0 && shown.unpriced === shown.lines.length
          ? t("feed.estimate.unpriced")
          : t("feedPlan.knownCost", { money: asMoney(shown.knownMoney) })}
        {shown.unpriced > 0
          ? ` · ${t("feedPlan.unpriced", { count: shown.unpriced })}`
          : ""}
      </p>
    </Section>
  );
};

const PlanNotices = ({
  detail,
  forecast,
}: {
  detail: Detail;
  forecast: Forecast;
}) => {
  const { t, language } = useLanguage();
  const { view } = detail;
  if (!view) {
    return null;
  }
  const date = (day: string) => formatDate(startOfFarmDay(day), language);
  return (
    <>
      {detail.rationsChanged ? (
        <Notice tone="warning" title={t("feedPlan.rationsChanged")}>
          {t("feedPlan.rationsChangedHint")}
        </Notice>
      ) : null}
      {detail.stillHere ? null : (
        <Notice tone="info" title={t("feedPlan.leftFarm")} />
      )}
      {view.finished ? (
        <Notice tone="warning" title={t("feedPlan.finished")} />
      ) : null}
      {view.weightOverdue ? (
        <Notice tone="warning" title={t("feedPlan.overdue")}>
          <Link
            className="underline"
            to="/animals/$tagNumber/weigh-ins"
            params={{ tagNumber: detail.tagNumber }}
          >
            {t("feedPlan.recordWeight")}
          </Link>
        </Notice>
      ) : null}
      {view.rationMismatch ? (
        <Notice tone="warning" title={t("feedPlan.rationReview")}>
          <p>
            {t("feedPlan.rationReviewHint", {
              ration: view.reviewRation
                ? namesIn(view.reviewRation, language).shown
                : "—",
            })}
          </p>
          <Link className="underline" to="/feed/rations">
            {t("feedPlan.manageRations")}
          </Link>
        </Notice>
      ) : null}
      {view.standing === "losing" || view.standing === "under" ? (
        <Notice tone="warning" title={t("feedPlan.slowGain")}>
          {t("feedPlan.slowGainHint")}
        </Notice>
      ) : null}
      {view.targetAtRisk ? (
        <Notice tone="warning" title={t("feedPlan.targetRisk")}>
          {t("feedPlan.targetRiskHint")}
        </Notice>
      ) : null}
      {forecast.stopped ? (
        <Notice tone="warning" title={t("feedPlan.incomplete")}>
          {t("feedPlan.gap", {
            day: date(forecast.stopped.day),
            kg: formatNumber(forecast.stopped.weightKg, language),
          })}
        </Notice>
      ) : null}
    </>
  );
};

const PlanRead = ({
  detail,
  onEdit,
}: {
  detail: Detail;
  onEdit: () => void;
}) => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  const [scenario, setScenario] = useState("expected");
  const { view } = detail;
  const { plan } = detail;
  if (!view || !plan) {
    return null;
  }
  const forecast =
    view.forecasts.find((one) => one.scenario === scenario) ??
    view.forecasts[1];
  const original = view.originals.find((one) => one.scenario === scenario);
  if (!forecast) {
    return null;
  }
  const date = (day: string) => formatDate(startOfFarmDay(day), language);
  return (
    <>
      <Section
        title={t("feedPlan.title")}
        description={t("feedPlan.modelHint")}
        action={
          detail.stillHere ? (
            <Button type="button" variant="outline" onClick={onEdit}>
              {t("feedPlan.revise")}
            </Button>
          ) : undefined
        }
      >
        <p className="text-muted-foreground text-sm">
          {date(plan.startDay)} → {date(plan.saleDay)} ·{" "}
          {t("feedPlan.revisions", { count: detail.revisions.length })}
        </p>
        <ToggleGroup
          className="max-w-full flex-wrap"
          value={[scenario]}
          onValueChange={(values) => {
            const [value] = values;
            if (value) {
              setScenario(value);
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
      </Section>
      <SummaryFigures
        figures={[
          {
            label: t("feedPlan.lastWeight"),
            value: `${formatNumber(view.measured.weightKg, language)} ${feedUnitWord("kg", language)}`,
            hint: date(view.measured.day),
            icon: Scale,
          },
          {
            label: t("feedPlan.saleWeight"),
            value:
              forecast.endWeightKg === null
                ? "—"
                : `${formatNumber(forecast.endWeightKg, language)} ${feedUnitWord("kg", language)}`,
            hint: t("feedPlan.targetValue", {
              kg: formatNumber(plan.targetWeightKg, language),
            }),
            icon: Wheat,
            tone:
              forecast.endWeightKg === null ||
              forecast.endWeightKg < plan.targetWeightKg
                ? "warning"
                : "neutral",
          },
          {
            label: t("feedPlan.nextWeigh"),
            value: date(view.dueDay),
            icon: CalendarDays,
            tone: view.weightOverdue ? "warning" : "neutral",
          },
          {
            label: t("feedPlan.cost"),
            value:
              forecast.unpriced > 0 &&
              forecast.unpriced === forecast.lines.length
                ? t("feed.estimate.unpriced")
                : asMoney(forecast.knownMoney),
            hint: t("feedPlan.costHint"),
            icon: ClipboardList,
          },
        ]}
      />
      <PlanNotices detail={detail} forecast={forecast} />
      <Section
        title={t("feedPlan.baseline")}
        description={t("feedPlan.baselineHint")}
      >
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground text-sm">
              {t("feedPlan.originalWeight")}
            </dt>
            <dd>
              {original?.endWeightKg === null ||
              original?.endWeightKg === undefined
                ? "—"
                : `${formatNumber(original.endWeightKg, language)} ${feedUnitWord("kg", language)}`}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-sm">
              {t("feedPlan.difference")}
            </dt>
            <dd>
              {view.weightDifferenceKg === null
                ? "—"
                : `${formatNumber(view.weightDifferenceKg, language, { signDisplay: "exceptZero" })} ${feedUnitWord("kg", language)}`}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-sm">
              {t("feedPlan.actualGain")}
            </dt>
            <dd>
              {view.gain === null
                ? "—"
                : t("feedPlan.gainValue", {
                    kg: formatNumber(view.gain.dailyGainKg, language),
                    days: view.gain.overDays,
                  })}
            </dd>
          </div>
        </dl>
      </Section>
      <Section
        title={t("feedPlan.timeline")}
        description={t("feedPlan.timelineHint")}
      >
        {forecast.reviews.map((review) => (
          <div
            key={`${review.day}-${review.rationId}`}
            className="flex flex-wrap items-baseline justify-between gap-2"
          >
            <span>
              {date(review.day)} · {namesIn(review, language).shown}
            </span>
            <span className="text-muted-foreground tabular-nums">
              {t("units.kg", { kg: formatNumber(review.weightKg, language) })}
            </span>
          </div>
        ))}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("feedPlan.period")}</TableHead>
              <TableHead>{t("feedPlan.days")}</TableHead>
              <TableHead>{t("feedPlan.weightRange")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {forecast.months.map((month) => (
              <TableRow key={month.month}>
                <TableCell>{saidMonth(month.month, language)}</TableCell>
                <TableCell>{formatNumber(month.days, language)}</TableCell>
                <TableCell>
                  {formatNumber(month.fromKg, language)} →{" "}
                  {t("units.kg", { kg: formatNumber(month.toKg, language) })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>
      <ForecastFeeds key={scenario} forecast={forecast} />
    </>
  );
};

export const FeedingPlanTab = ({ animal }: { animal: AnimalDetail }) => {
  const { t } = useLanguage();
  const [editing, setEditing] = useState(false);
  const query = useQuery(
    orpc.feedingPlans.get.queryOptions({
      input: { tagNumber: animal.tagNumber },
    })
  );
  const detail = query.data;
  return (
    <Loaded query={query}>
      {detail ? (
        <div className="flex flex-col gap-4">
          {detail.plan ? (
            <PlanRead detail={detail} onEdit={() => setEditing(true)} />
          ) : (
            <EmptyState
              icon={Wheat}
              title={t("feedPlan.empty")}
              description={t("feedPlan.emptyHint")}
              action={
                detail.stillHere ? (
                  <Button type="button" onClick={() => setEditing(true)}>
                    {t("feedPlan.create")}
                  </Button>
                ) : undefined
              }
            />
          )}
          {editing ? (
            <PlanEditor detail={detail} onClose={() => setEditing(false)} />
          ) : null}
        </div>
      ) : null}
    </Loaded>
  );
};
