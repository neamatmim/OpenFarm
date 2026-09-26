import { formatDate, formatNumber, numberAsTyped } from "@OpenFarm/i18n";
import type { MessageKey } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Textarea } from "@OpenFarm/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ClipboardList, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Loaded, Section, StatusBadge } from "@/components/page";
import { FormField, FormSheet } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { useTaka } from "@/lib/taka";
import type { Venture } from "@/lib/ventures";
import type { client } from "@/utils/orpc";
import { orpc } from "@/utils/orpc";

type Plan = Awaited<ReturnType<typeof client.ventures.plan>>;
type Version = NonNullable<Plan["latest"]>;

/** One band as the sheet holds it while it is typed. */
interface TypedLine {
  key: number;
  animals: string;
  fromKg: string;
  toKg: string;
  buyBdtPerKg: string;
  dailyGainKg: string;
}

const LINE_FIELDS = [
  ["animals", "plan.animals"],
  ["fromKg", "plan.from"],
  ["toKg", "plan.to"],
  ["buyBdtPerKg", "plan.buy"],
  ["dailyGainKg", "plan.gain"],
] as const;

/** Why the farm would not keep a plan, in the Owner's words. */
/** The most of its animals a plan may expect to die, in per cent: the server's limit too. */
const MOST_DEATHS_PERCENT = 50;

const PLAN_REFUSALS = {
  plan_revision_needs_reason: "plan.refused.reason",
  plan_after_the_end: "plan.refused.ended",
} as const satisfies Record<string, MessageKey>;

/** A typed figure as a number, Bangla digits and all; nothing for a blank. */
const figureOf = (typed: string): number | null => {
  const plain = numberAsTyped(typed);
  return plain === "" ? null : Number(plain);
};

/** A figure the Owner may plan with: a real number above nothing — or, for a gain, not below it. */
const aFigure = (value: number | null, orNothing = false): value is number =>
  value !== null &&
  Number.isFinite(value) &&
  (orNothing ? value >= 0 : value > 0);

let nextKey = 0;
const blankLine = (): TypedLine => {
  nextKey += 1;
  return {
    key: nextKey,
    animals: "",
    fromKg: "",
    toKg: "",
    buyBdtPerKg: "",
    dailyGainKg: "",
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
          buyBdtPerKg: String(line.buyBdtPerKg),
          dailyGainKg: String(line.dailyGainKg),
        };
      })
    : [blankLine()];

/** A typed band as the farm is sent it, or nothing while any figure is missing or its weights run backwards. */
const lineOf = (typed: TypedLine) => {
  const animals = figureOf(typed.animals);
  const fromKg = figureOf(typed.fromKg);
  const toKg = figureOf(typed.toKg);
  const buyBdtPerKg = figureOf(typed.buyBdtPerKg);
  const dailyGainKg = figureOf(typed.dailyGainKg);
  if (
    !(
      aFigure(animals) &&
      Number.isInteger(animals) &&
      aFigure(fromKg) &&
      aFigure(toKg) &&
      aFigure(buyBdtPerKg) &&
      aFigure(dailyGainKg, true)
    )
  ) {
    return null;
  }
  // Named, not written into the sheet: the check for untranslated words reads a less-than beside JSX as a tag.
  const backwards = fromKg >= toKg;
  return backwards ? null : { animals, fromKg, toKg, buyBdtPerKg, dailyGainKg };
};

/** Writing or changing a Venture's plan: its bands, what a kilo will sell at, and — once buying has begun — why. */
const PlanSheet = ({
  venture,
  latest,
  onOpenChange,
}: {
  venture: Venture;
  latest: Version | null;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const refused = useRefused(PLAN_REFUSALS);
  const [lines, setLines] = useState<TypedLine[]>(() => typedFrom(latest));
  const [sale, setSale] = useState({
    low: latest ? String(latest.saleLowBdtPerKg) : "",
    high: latest ? String(latest.saleHighBdtPerKg) : "",
  });
  // An answer this phone kept from before a plan could expect deaths has none: read as none.
  const [deaths, setDeaths] = useState(() =>
    String(latest?.deathsPercent ?? 0)
  );
  const [reason, setReason] = useState("");
  const saving = useMutation(
    orpc.ventures.setPlan.mutationOptions({
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
  return (
    <FormSheet
      description={t("plan.sheetHint")}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        saving.mutate({
          ventureId: venture.id,
          lines: said.filter((line) => line !== null),
          saleLowBdtPerKg: low ?? 0,
          saleHighBdtPerKg: high ?? 0,
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
      {lines.map((line, at) => (
        <fieldset className="flex flex-col gap-3 border-b pb-4" key={line.key}>
          <div className="flex items-center justify-between gap-2">
            <legend className="text-sm font-medium">
              {t("plan.lineOf", { number: at + 1 })}
            </legend>
            {lines.length > 1 ? (
              <Button
                aria-label={t("plan.removeLine")}
                onClick={() =>
                  setLines(lines.filter((each) => each.key !== line.key))
                }
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <Trash2 aria-hidden />
              </Button>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {LINE_FIELDS.map(([field, word]) => (
              <FormField
                id={`plan-${line.key}-${field}`}
                key={field}
                label={t(word)}
              >
                <Input
                  autoComplete="off"
                  id={`plan-${line.key}-${field}`}
                  inputMode={field === "animals" ? "numeric" : "decimal"}
                  onChange={(event) =>
                    edit(line.key, field, event.target.value)
                  }
                  value={line[field]}
                />
              </FormField>
            ))}
          </div>
        </fieldset>
      ))}
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
      <div className="grid grid-cols-2 gap-3 border-t pt-4">
        <FormField
          hint={lowAboveHigh ? t("projection.lowAboveHigh") : undefined}
          id="plan-sale-low"
          label={t("projection.saleLow")}
        >
          <Input
            autoComplete="off"
            id="plan-sale-low"
            inputMode="decimal"
            onChange={(event) => setSale({ ...sale, low: event.target.value })}
            value={sale.low}
          />
        </FormField>
        <FormField id="plan-sale-high" label={t("projection.saleHigh")}>
          <Input
            autoComplete="off"
            id="plan-sale-high"
            inputMode="decimal"
            onChange={(event) => setSale({ ...sale, high: event.target.value })}
            value={sale.high}
          />
        </FormField>
      </div>
      <FormField
        hint={t(deathsOutOfRange ? "plan.deathsOutOfRange" : "plan.deathsHint")}
        id="plan-deaths"
        label={t("plan.deaths")}
      >
        <Input
          autoComplete="off"
          id="plan-deaths"
          inputMode="decimal"
          onChange={(event) => setDeaths(event.target.value)}
          value={deaths}
        />
      </FormField>
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
  const taka = useTaka();
  const kg = (value: number) => formatNumber(value, language);
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
              </td>
              <td className="px-2 py-2 text-end tabular-nums">
                {formatNumber(line.animals, language)}
              </td>
              <td className="px-2 py-2 text-end tabular-nums">
                {taka(line.buyBdtPerKg)}
              </td>
              <td className="px-2 py-2 text-end tabular-nums">
                {taka(version.totals.lines[at]?.costBdt ?? 0)}
              </td>
              <td className="px-2 py-2 text-end tabular-nums">
                {t("portal.kg", { kg: kg(line.dailyGainKg) })}
              </td>
              <td className="px-2 py-2 pe-4 text-end tabular-nums md:pe-5">
                {t("portal.kg", {
                  kg: kg(version.totals.lines[at]?.saleKgEach ?? 0),
                })}
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
              {taka(
                version.totals.boughtKg > 0
                  ? version.totals.costBdt / version.totals.boughtKg
                  : 0
              )}
            </td>
            <td className="px-2 py-2 text-end tabular-nums">
              {taka(version.totals.costBdt)}
            </td>
            <td className="px-2 py-2 text-end tabular-nums">
              {t("portal.kg", { kg: kg(averageGainOf(version)) })}
            </td>
            <td className="px-2 py-2 pe-4 text-end tabular-nums md:pe-5">
              {t("portal.kg", { kg: kg(version.totals.saleKg) })}
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
  const taka = useTaka();
  const { latest, baseline } = plan;
  if (!latest) {
    return <p className="text-muted-foreground text-sm">{t("plan.none")}</p>;
  }
  const isBaseline = baseline?.version === latest.version;
  // Missing from an answer this phone kept from before a plan could expect deaths: read as none.
  const expectsDeaths = (latest.deathsPercent ?? 0) > 0;
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
      <div className="flex flex-col gap-1 text-sm">
        <span>
          {t("plan.budget", { budget: taka(venture.cattleBudgetBdt) })}
          {latest.totals.overBudgetBdt > 0 ? (
            <span className="text-warning">
              {" · "}
              {t("plan.over", { over: taka(latest.totals.overBudgetBdt) })}
            </span>
          ) : null}
        </span>
        <span>
          {t("plan.sale", {
            low: taka(latest.saleLowBdtPerKg),
            high: taka(latest.saleHighBdtPerKg),
          })}
        </span>
        {expectsDeaths ? (
          <span>
            {t("plan.deathsSaid", {
              percent: t("portal.percent", {
                percent: formatNumber(latest.deathsPercent, language),
              }),
            })}
          </span>
        ) : null}
        <span className="text-muted-foreground">
          {t("plan.daysOnFeed", { days: plan.daysOnFeed })}
        </span>
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
    orpc.ventures.plan.queryOptions({ input: { ventureId: venture.id } })
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
          latest={latest}
          onOpenChange={setWriting}
          venture={venture}
        />
      ) : null}
    </Section>
  );
};
