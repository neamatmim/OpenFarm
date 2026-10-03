import type { GainingBand, PlanLine } from "@OpenFarm/domain";
import { expectedGainFor, gainingBandFor, planTotals } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import type { MessageKey } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Textarea } from "@OpenFarm/ui/components/textarea";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ClipboardList, Plus, Sparkles, Trash2 } from "lucide-react";
import type { ChangeEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { BreedField, useBreeds } from "@/components/breed-field";
import { expectedGainSaid } from "@/components/feed/band-words";
import {
  EmptyState,
  Loaded,
  SECTION_TITLE,
  Section,
  StatusBadge,
} from "@/components/page";
import {
  FigureTerm,
  FormField,
  FormSheet,
  UnitInput,
} from "@/components/page-kit";
import { useLineBreedName } from "@/components/ventures/line-breed";
import { useLanguage } from "@/i18n/language-provider";
import { breedName } from "@/lib/breed";
import { gainSettingOf } from "@/lib/gain-settings";
import { useKg } from "@/lib/kg";
import { useMoney } from "@/lib/money";
import { useRefused } from "@/lib/refused";
import { aFigure, figureOf } from "@/lib/typed-figure";
import type { Venture } from "@/lib/ventures";
import type { client } from "@/utils/orpc";
import { orpc } from "@/utils/orpc";

type Plan = Awaited<ReturnType<typeof client.ventures.plan.get>>;
type Version = NonNullable<Plan["latest"]>;

/** One band as the sheet holds it while it is typed. */
interface TypedLine {
  key: number;
  animals: string;
  fromKg: string;
  toKg: string;
  buyMoneyPerKg: string;
  dailyGainKg: string;
  /** The Breed it buys, or "" for any. */
  breedId: string;
}

/** The most of its animals a plan may expect to die, in per cent: the server's limit too. */
const MOST_DEATHS_PERCENT = 50;

/** Why the farm would not keep a plan, in the Owner's words. */
const PLAN_REFUSALS = {
  plan_revision_needs_reason: "plan.refused.reason",
  plan_after_the_end: "plan.refused.ended",
} as const satisfies Record<string, MessageKey>;

let nextKey = 0;
const blankLine = (): TypedLine => {
  nextKey += 1;
  return {
    key: nextKey,
    animals: "",
    fromKg: "",
    toKg: "",
    buyMoneyPerKg: "",
    dailyGainKg: "",
    breedId: "",
  };
};

const typedFrom = (version: Version | null): TypedLine[] =>
  version
    ? version.lines.map((line) => {
        nextKey += 1;
        return {
          key: nextKey,
          animals: String(line.animals),
          fromKg: String(line.fromKg),
          toKg: String(line.toKg),
          buyMoneyPerKg: String(line.buyMoneyPerKg),
          dailyGainKg: String(line.dailyGainKg),
          // A plan this phone kept from before a line could name a Breed names none: any.
          breedId: line.breedId ?? "",
        };
      })
    : [blankLine()];

/** A typed band as the farm is sent it, or nothing while any figure is missing or its weights run backwards. */
const lineOf = (typed: TypedLine) => {
  const animals = figureOf(typed.animals);
  const fromKg = figureOf(typed.fromKg);
  const toKg = figureOf(typed.toKg);
  const buyMoneyPerKg = figureOf(typed.buyMoneyPerKg);
  const dailyGainKg = figureOf(typed.dailyGainKg);
  if (
    !(
      aFigure(animals) &&
      Number.isInteger(animals) &&
      aFigure(fromKg) &&
      aFigure(toKg) &&
      aFigure(buyMoneyPerKg) &&
      aFigure(dailyGainKg, true)
    )
  ) {
    return null;
  }
  // Named, not written into the sheet: the check for untranslated words reads a less-than beside JSX as a tag.
  const backwards = fromKg >= toKg;
  if (backwards) {
    return null;
  }
  const breedId = typed.breedId === "" ? null : typed.breedId;
  return { animals, fromKg, toKg, buyMoneyPerKg, dailyGainKg, breedId };
};

/** A gain a day halfway between two, kept to the hundredth as a plan's gains are. */
const middleGainOf = ({ lowKg, highKg }: { lowKg: number; highKg: number }) =>
  Math.round(((lowKg + highKg) / 2) * 100) / 100;

/** The Breed a line buys, as the gain offer needs it: what to call it, and whether it is deshi. */
interface LineBreed {
  name: string;
  deshi: boolean;
}

/**
 * What the farm's own Rations say a bull of the line's Breed bought in the middle of its band should gain, under the
 * band's gain box, with a button to write in the middle of that range: a crossbred bull's, as the Rations are written,
 * unless the line names a deshi Breed, when it is cut to the farm's deshi share — the share he is judged at once he is
 * bought. The Owner's plan still says what the Owner types: this only offers. Nothing while the band's weights are not
 * both typed, or no Ration by weight holds a bull that size.
 */
const RationsSay = ({
  line,
  breed,
  deshiPercent,
  rungs,
  onUse,
}: {
  line: TypedLine;
  breed: LineBreed | null;
  deshiPercent: number;
  rungs: readonly GainingBand[];
  onUse: (dailyGainKg: string) => void;
}) => {
  const { t, language } = useLanguage();
  const fromKg = figureOf(line.fromKg);
  const toKg = figureOf(line.toKg);
  if (!(aFigure(fromKg) && aFigure(toKg))) {
    return null;
  }
  const middleKg = Math.round((fromKg + toKg) / 2);
  const rung = gainingBandFor(middleKg, rungs);
  if (!rung) {
    return null;
  }
  const { expectedGain } = expectedGainFor(
    rung.expectedGain,
    { deshi: breed?.deshi ?? false, sex: "male" },
    { deshiPercent, femalePercent: 100 }
  );
  const middle = middleGainOf(expectedGain);
  const said = {
    kg: formatNumber(middleKg, language),
    range: expectedGainSaid(expectedGain, { t, language }) ?? "",
  };
  let words = t("plan.rationsSay", said);
  if (breed?.deshi) {
    words = t("plan.rationsSayDeshi", {
      ...said,
      breed: breed.name,
      percent: formatNumber(deshiPercent, language),
    });
  } else if (breed) {
    words = t("plan.rationsSayBreed", { ...said, breed: breed.name });
  }
  return (
    <div className="col-span-6 flex flex-wrap items-center gap-x-3 gap-y-1">
      <p className="text-muted-foreground text-xs">{words}</p>
      <Button
        onClick={() => onUse(String(middle))}
        size="sm"
        type="button"
        variant="ghost"
      >
        <Sparkles aria-hidden data-icon="inline-start" />
        {t("plan.useGain", { kg: formatNumber(middle, language) })}
      </Button>
    </div>
  );
};

/** What one line comes to, as the plan's own sums say it: the kilos it buys and their cost, and a head by the window. */
interface LineSum {
  boughtKg: number;
  costMoney: number;
  saleKgEach: number;
}

/**
 * One line of the plan as it is typed, read as the Owner would say it: so many, of which Breed, bought between two
 * weights, at a price a kilo, putting on so much a day — with what it comes to under it once every figure is in.
 */
const PlanLineCard = ({
  line,
  at,
  breed,
  deshiPercent,
  rungs,
  sum,
  onEdit,
  onRemove,
}: {
  line: TypedLine;
  at: number;
  breed: LineBreed | null;
  deshiPercent: number;
  rungs: readonly GainingBand[];
  sum: LineSum | null;
  onEdit: (field: keyof TypedLine, value: string) => void;
  /** Nothing for the only line: a plan buys something. */
  onRemove: (() => void) | undefined;
}) => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  const id = (field: keyof TypedLine) => `plan-${line.key}-${field}`;
  const typed =
    (field: keyof TypedLine) => (event: ChangeEvent<HTMLInputElement>) =>
      onEdit(field, event.target.value);
  return (
    <fieldset className="surface flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between gap-2">
        <legend className="text-sm font-medium">
          {t("plan.lineOf", { number: formatNumber(at + 1, language) })}
        </legend>
        {onRemove ? (
          <Button
            aria-label={t("plan.removeLine")}
            onClick={onRemove}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <Trash2 aria-hidden />
          </Button>
        ) : null}
      </div>
      <div className="grid grid-cols-6 gap-3">
        <FormField
          className="col-span-2"
          id={id("animals")}
          label={t("plan.animals")}
        >
          <Input
            autoComplete="off"
            className="tabular-nums"
            id={id("animals")}
            inputMode="numeric"
            onChange={typed("animals")}
            value={line.animals}
          />
        </FormField>
        <div className="col-span-4">
          <BreedField
            emptyLabel={t("plan.anyBreed")}
            id={id("breedId")}
            noManage
            onChange={(breedId) => onEdit("breedId", breedId)}
            value={line.breedId}
          />
        </div>
        <FormField
          className="col-span-6"
          id={id("fromKg")}
          label={t("plan.weightBought")}
        >
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <UnitInput
                id={id("fromKg")}
                inputMode="decimal"
                onChange={typed("fromKg")}
                unit={t("plan.unit.kg")}
                value={line.fromKg}
              />
            </div>
            <span aria-hidden className="text-muted-foreground">
              –
            </span>
            <div className="min-w-0 flex-1">
              <UnitInput
                aria-label={t("plan.weightTo")}
                id={id("toKg")}
                inputMode="decimal"
                onChange={typed("toKg")}
                unit={t("plan.unit.kg")}
                value={line.toKg}
              />
            </div>
          </div>
        </FormField>
        <FormField
          className="col-span-3"
          id={id("buyMoneyPerKg")}
          label={t("plan.pricePerKg")}
        >
          <UnitInput
            className="pe-20"
            id={id("buyMoneyPerKg")}
            inputMode="decimal"
            onChange={typed("buyMoneyPerKg")}
            unit={t("plan.unit.moneyPerKg")}
            value={line.buyMoneyPerKg}
          />
        </FormField>
        <FormField
          className="col-span-3"
          id={id("dailyGainKg")}
          label={t("plan.gainPerDay")}
        >
          <UnitInput
            className="pe-20"
            id={id("dailyGainKg")}
            inputMode="decimal"
            onChange={typed("dailyGainKg")}
            unit={t("plan.unit.kgPerDay")}
            value={line.dailyGainKg}
          />
        </FormField>
        <RationsSay
          breed={breed}
          deshiPercent={deshiPercent}
          line={line}
          onUse={(dailyGainKg) => onEdit("dailyGainKg", dailyGainKg)}
          rungs={rungs}
        />
      </div>
      {sum ? (
        <p className="text-muted-foreground border-t pt-2 text-xs tabular-nums">
          {t("plan.lineSum", {
            kg: formatNumber(sum.boughtKg, language),
            cost: asMoney(sum.costMoney),
            saleKg: formatNumber(sum.saleKgEach, language),
          })}
        </p>
      ) : null}
    </fieldset>
  );
};

/**
 * What the plan comes to as it is typed, from the lines whose every figure is in: how many it buys, what they cost
 * against the cattle budget — over it said, never refused — and what the herd weighs when its window opens.
 */
const PlanSum = ({
  lines,
  cattleBudgetMoney,
  daysOnFeed,
}: {
  lines: PlanLine[];
  cattleBudgetMoney: number;
  daysOnFeed: number;
}) => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  const weight = useKg();
  const totals = planTotals({ lines, cattleBudgetMoney, daysOnFeed });
  const over = totals.overBudgetMoney > 0;
  const figure = "text-base font-semibold tabular-nums";
  return (
    <dl className="bg-muted/40 grid grid-cols-[auto_1fr_1fr] gap-x-4 gap-y-3 rounded-lg border p-3">
      <div className="flex flex-col gap-0.5">
        <dt className="text-muted-foreground text-xs">
          {t("plan.sum.animals")}
        </dt>
        <dd className={figure}>{formatNumber(totals.animals, language)}</dd>
      </div>
      <div className="flex flex-col gap-0.5">
        <dt className="text-muted-foreground text-xs">{t("plan.sum.cost")}</dt>
        <dd className={figure}>{asMoney(totals.costMoney)}</dd>
        <dd
          className={cn(
            "text-xs",
            over ? "text-warning" : "text-muted-foreground"
          )}
        >
          {over
            ? t("plan.sum.over", {
                amount: asMoney(totals.overBudgetMoney),
                budget: asMoney(cattleBudgetMoney),
              })
            : t("plan.sum.left", {
                amount: asMoney(cattleBudgetMoney - totals.costMoney),
                budget: asMoney(cattleBudgetMoney),
              })}
        </dd>
      </div>
      <div className="flex flex-col gap-0.5">
        <dt className="text-muted-foreground text-xs">
          {t("plan.sum.saleKg")}
        </dt>
        <dd className={figure}>{weight(totals.saleKg)}</dd>
      </div>
    </dl>
  );
};

/** What a kilo will sell at, low and high, as the sheet holds them while they are typed. */
interface TypedSale {
  low: string;
  high: string;
}

/** The plan's selling: what a kilo of live weight will fetch, low and high, and the share it expects not to live. */
const PlanSelling = ({
  sale,
  onSale,
  deaths,
  onDeaths,
  lowAboveHigh,
  deathsOutOfRange,
}: {
  sale: TypedSale;
  onSale: (sale: TypedSale) => void;
  deaths: string;
  onDeaths: (deaths: string) => void;
  lowAboveHigh: boolean;
  deathsOutOfRange: boolean;
}) => {
  const { t } = useLanguage();
  return (
    <>
      <h3 className={cn(SECTION_TITLE, "border-t pt-4")}>
        {t("plan.selling")}
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <FormField id="plan-sale-low" label={t("plan.saleLowShort")}>
          <UnitInput
            className="pe-20"
            id="plan-sale-low"
            inputMode="decimal"
            onChange={(event) => onSale({ ...sale, low: event.target.value })}
            unit={t("plan.unit.moneyPerKg")}
            value={sale.low}
          />
        </FormField>
        <FormField id="plan-sale-high" label={t("plan.saleHighShort")}>
          <UnitInput
            className="pe-20"
            id="plan-sale-high"
            inputMode="decimal"
            onChange={(event) => onSale({ ...sale, high: event.target.value })}
            unit={t("plan.unit.moneyPerKg")}
            value={sale.high}
          />
        </FormField>
        <p
          className={cn(
            "col-span-2 -mt-1 text-xs",
            lowAboveHigh ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {t(lowAboveHigh ? "projection.lowAboveHigh" : "plan.saleHint")}
        </p>
        <FormField
          className="col-span-2"
          hint={t(
            deathsOutOfRange ? "plan.deathsOutOfRange" : "plan.deathsHint"
          )}
          id="plan-deaths"
          label={t("plan.deathsShort")}
        >
          <div className="w-1/2 pe-1.5">
            <UnitInput
              id="plan-deaths"
              inputMode="decimal"
              onChange={(event) => onDeaths(event.target.value)}
              unit="%"
              value={deaths}
            />
          </div>
        </FormField>
      </div>
    </>
  );
};

/** Writing or changing a Venture's plan: its bands, what a kilo will sell at, and — once buying has begun — why. */
const PlanSheet = ({
  venture,
  latest,
  daysOnFeed,
  onOpenChange,
}: {
  venture: Venture;
  latest: Version | null;
  /** From buying to the window in force, as the plan's own sums count it. */
  daysOnFeed: number;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t, language } = useLanguage();
  const refused = useRefused(PLAN_REFUSALS);
  const [lines, setLines] = useState<TypedLine[]>(() => typedFrom(latest));
  // What the farm's Rations say each band should gain; none on a phone that has never been told.
  const rungs = useQuery(orpc.feed.gainingBands.queryOptions()).data ?? [];
  const breeds = useBreeds().data ?? [];
  const farm = useQuery(orpc.farm.current.queryOptions());
  const deshiPercent = gainSettingOf(farm.data, "deshiGainPercent");
  const breedOf = (breedId: string): LineBreed | null => {
    const found = breeds.find((one) => one.id === breedId);
    return found
      ? { name: breedName(found, language) ?? "", deshi: found.deshi }
      : null;
  };
  const [sale, setSale] = useState({
    low: latest ? String(latest.saleLowMoneyPerKg) : "",
    high: latest ? String(latest.saleHighMoneyPerKg) : "",
  });
  // An answer this phone kept from before a plan could expect deaths has none: read as none.
  const [deaths, setDeaths] = useState(() =>
    String(latest?.deathsPercent ?? 0)
  );
  const [reason, setReason] = useState("");
  const saving = useMutation(
    orpc.ventures.plan.set.mutationOptions({
      onError: refused,
      onSuccess: () => {
        onOpenChange(false);
        toast.success(t("plan.saved"));
      },
    })
  );
  const revising = venture.state !== "open";
  const said = lines.map(lineOf);
  const low = figureOf(sale.low);
  const high = figureOf(sale.high);
  const lowAboveHigh = low !== null && high !== null && low > high;
  // Blank is none expected; more than half the herd is past planning, as the server says too.
  const deathsPercent = figureOf(deaths) ?? 0;
  const deathsOutOfRange =
    !Number.isFinite(deathsPercent) ||
    deathsPercent < 0 ||
    deathsPercent > MOST_DEATHS_PERCENT;
  const ready =
    said.every((line) => line !== null) &&
    aFigure(low) &&
    aFigure(high) &&
    !lowAboveHigh &&
    !deathsOutOfRange &&
    (!revising || reason.trim() !== "");
  const edit = (key: number, field: keyof TypedLine, value: string) =>
    setLines(
      lines.map((line) =>
        line.key === key ? { ...line, [field]: value } : line
      )
    );
  const label = t(latest ? "plan.change" : "plan.write");
  // The lines every figure of which is typed, for the sums under them: a line half typed adds nothing yet.
  const complete = said.filter((line) => line !== null);
  return (
    <FormSheet
      description={t("plan.sheetHint")}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        saving.mutate({
          ventureId: venture.id,
          lines: complete,
          saleLowMoneyPerKg: low ?? 0,
          saleHighMoneyPerKg: high ?? 0,
          deathsPercent,
          reason: revising ? reason.trim() : null,
        })
      }
      open
      pending={saving.isPending}
      ready={ready}
      submitLabel={label}
      title={label}
    >
      <h3 className={SECTION_TITLE}>{t("plan.buying")}</h3>
      {lines.map((line, at) => {
        const typed = said[at] ?? null;
        return (
          <PlanLineCard
            at={at}
            breed={breedOf(line.breedId)}
            deshiPercent={deshiPercent}
            key={line.key}
            line={line}
            onEdit={(field, value) => edit(line.key, field, value)}
            onRemove={
              lines.length > 1
                ? () => setLines(lines.filter((each) => each.key !== line.key))
                : undefined
            }
            rungs={rungs}
            sum={
              typed
                ? (planTotals({
                    lines: [typed],
                    cattleBudgetMoney: venture.cattleBudgetMoney,
                    daysOnFeed,
                  }).lines[0] ?? null)
                : null
            }
          />
        );
      })}
      <Button
        className="w-fit"
        onClick={() => setLines([...lines, blankLine()])}
        size="sm"
        type="button"
        variant="outline"
      >
        <Plus aria-hidden data-icon="inline-start" />
        {t("plan.addLine")}
      </Button>
      {complete.length > 0 ? (
        <PlanSum
          cattleBudgetMoney={venture.cattleBudgetMoney}
          daysOnFeed={daysOnFeed}
          lines={complete}
        />
      ) : null}
      <PlanSelling
        deaths={deaths}
        deathsOutOfRange={deathsOutOfRange}
        lowAboveHigh={lowAboveHigh}
        onDeaths={setDeaths}
        onSale={setSale}
        sale={sale}
      />
      {revising ? (
        <FormField
          hint={t("plan.reasonHint")}
          id="plan-reason"
          label={t("plan.reason")}
        >
          <Textarea
            id="plan-reason"
            maxLength={300}
            onChange={(event) => setReason(event.target.value)}
            value={reason}
          />
        </FormField>
      ) : null}
    </FormSheet>
  );
};

/** What a head puts on a day across a version's bands, each band counted by its animals. */
const averageGainOf = (version: Version) => {
  const animals = version.lines.reduce((sum, line) => sum + line.animals, 0);
  const gain = version.lines.reduce(
    (sum, line) => sum + line.animals * line.dailyGainKg,
    0
  );
  return animals > 0 ? Math.round((gain / animals) * 100) / 100 : 0;
};

/** One version's bands as a table, with what they come to together. */
const PlanTable = ({ version }: { version: Version }) => {
  const { t, language } = useLanguage();
  const breedOfLine = useLineBreedName();
  const asMoney = useMoney();
  const kg = (value: number) => formatNumber(value, language);
  const weight = useKg();
  const head = "text-muted-foreground px-2 py-1.5 text-xs font-medium";
  return (
    <div className="-mx-4 overflow-x-auto md:-mx-5">
      <table className="w-full min-w-[36rem] text-sm">
        <thead className="border-b">
          <tr>
            <th className={`${head} ps-4 text-start md:ps-5`} scope="col">
              {t("plan.col.band")}
            </th>
            <th className={`${head} text-end`} scope="col">
              {t("plan.col.animals")}
            </th>
            <th className={`${head} text-end`} scope="col">
              {t("plan.col.price")}
            </th>
            <th className={`${head} text-end`} scope="col">
              {t("plan.col.cost")}
            </th>
            <th className={`${head} text-end`} scope="col">
              {t("plan.col.gain")}
            </th>
            <th className={`${head} pe-4 text-end md:pe-5`} scope="col">
              {t("plan.col.sale")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {version.lines.map((line, at) => (
            <tr key={`${line.fromKg}-${line.toKg}-${at}`}>
              <td className="px-2 py-2 ps-4 md:ps-5">
                {t("plan.band", { from: kg(line.fromKg), to: kg(line.toKg) })}
                <span className="text-muted-foreground block text-xs">
                  {breedOfLine(line.breedId)}
                </span>
              </td>
              <td className="px-2 py-2 text-end tabular-nums">
                {formatNumber(line.animals, language)}
              </td>
              <td className="px-2 py-2 text-end tabular-nums">
                {asMoney(line.buyMoneyPerKg)}
              </td>
              <td className="px-2 py-2 text-end tabular-nums">
                {asMoney(version.totals.lines[at]?.costMoney ?? 0)}
              </td>
              <td className="px-2 py-2 text-end tabular-nums">
                {weight(line.dailyGainKg)}
              </td>
              <td className="px-2 py-2 pe-4 text-end tabular-nums md:pe-5">
                {weight(version.totals.lines[at]?.saleKgEach ?? 0)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t font-medium">
          <tr>
            <td className="px-2 py-2 ps-4 md:ps-5">{t("plan.total")}</td>
            <td className="px-2 py-2 text-end tabular-nums">
              {formatNumber(version.totals.animals, language)}
            </td>
            {/* What a kilo costs across every band, and what a head puts on, each weighted as bought. */}
            <td className="px-2 py-2 text-end tabular-nums">
              {asMoney(
                version.totals.boughtKg > 0
                  ? version.totals.costMoney / version.totals.boughtKg
                  : 0
              )}
            </td>
            <td className="px-2 py-2 text-end tabular-nums">
              {asMoney(version.totals.costMoney)}
            </td>
            <td className="px-2 py-2 text-end tabular-nums">
              {weight(averageGainOf(version))}
            </td>
            <td className="px-2 py-2 pe-4 text-end tabular-nums md:pe-5">
              {weight(version.totals.saleKg)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

/** The plan in force, with its budget, sale prices and days on feed, and which version it is measured against. */
const PlanRead = ({ plan, venture }: { plan: Plan; venture: Venture }) => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  const { latest, baseline } = plan;
  if (!latest) {
    return <EmptyState compact icon={ClipboardList} title={t("plan.none")} />;
  }
  const isBaseline = baseline?.version === latest.version;
  // Missing from an answer this phone kept from before a plan could expect deaths: read as none.
  const expectsDeaths = (latest.deathsPercent ?? 0) > 0;
  const overBudget = latest.totals.overBudgetMoney > 0;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">
          {t("plan.version", {
            version: formatNumber(latest.version, language),
            day: formatDate(new Date(latest.madeAt), language, "date"),
          })}
        </span>
        {isBaseline ? (
          <StatusBadge tone="info">{t("plan.baseline")}</StatusBadge>
        ) : null}
      </div>
      <PlanTable version={latest} />
      {/* What the plan rests on besides its bands, as figures under their names — as the Venture's terms are. */}
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        <FigureTerm
          hint={
            overBudget
              ? t("plan.over", { over: asMoney(latest.totals.overBudgetMoney) })
              : undefined
          }
          label={t("ventures.page.cattleBudget")}
          size="sm"
          tone={overBudget ? "warning" : "neutral"}
        >
          {asMoney(venture.cattleBudgetMoney)}
        </FigureTerm>
        <FigureTerm label={t("plan.fact.sale")} size="sm">
          {t("projection.range", {
            low: asMoney(latest.saleLowMoneyPerKg),
            high: asMoney(latest.saleHighMoneyPerKg),
          })}
        </FigureTerm>
        <FigureTerm label={t("plan.fact.days")} size="sm">
          {t("correct.spanDays", {
            days: formatNumber(plan.daysOnFeed, language),
          })}
        </FigureTerm>
        {expectsDeaths ? (
          <FigureTerm label={t("plan.deathsShort")} size="sm">
            {t("portal.percent", {
              percent: formatNumber(latest.deathsPercent, language),
            })}
          </FigureTerm>
        ) : null}
      </dl>
      <div className="flex flex-col gap-1 text-sm">
        {latest.reason ? (
          <span className="text-muted-foreground">
            {t("plan.revision", { reason: latest.reason })}
          </span>
        ) : null}
        {baseline && !isBaseline ? (
          <span className="text-muted-foreground">
            {t("plan.measuredAgainst", {
              version: formatNumber(baseline.version, language),
            })}
          </span>
        ) : null}
      </div>
    </>
  );
};

/**
 * A Venture's **Venture Plan** on the Owner's page: the bands it means to buy, what they come to against the cattle
 * budget, what a kilo will sell at, and the act that writes or changes it. Read-only once the Venture has ended.
 */
export const VenturePlanPanel = ({ venture }: { venture: Venture }) => {
  const { t } = useLanguage();
  const [writing, setWriting] = useState(false);
  const plan = useQuery(
    orpc.ventures.plan.get.queryOptions({ input: { ventureId: venture.id } })
  );
  const ended = venture.state === "settled" || venture.state === "cancelled";
  const latest = plan.data?.latest ?? null;
  return (
    <Section
      action={
        ended ? undefined : (
          <Button
            disabled={!plan.data}
            onClick={() => setWriting(true)}
            size="sm"
            variant="outline"
          >
            <ClipboardList aria-hidden data-icon="inline-start" />
            {t(latest ? "plan.change" : "plan.write")}
          </Button>
        )
      }
      description={t("plan.hint")}
      title={t("plan.title")}
    >
      <Loaded query={plan}>
        {plan.data ? <PlanRead plan={plan.data} venture={venture} /> : null}
      </Loaded>
      {/* Drawn afresh each time it opens, so it starts from the plan in force. */}
      {writing ? (
        <PlanSheet
          daysOnFeed={plan.data?.daysOnFeed ?? 0}
          latest={latest}
          onOpenChange={setWriting}
          venture={venture}
        />
      ) : null}
    </Section>
  );
};
