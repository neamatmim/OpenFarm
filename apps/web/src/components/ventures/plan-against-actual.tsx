import { formatNumber } from "@OpenFarm/i18n";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";

import { Nothing } from "@/components/list-cells";
import { Loaded, Section } from "@/components/page";
import { FigureTerm } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useKg } from "@/lib/kg";
import { useTaka } from "@/lib/taka";
import type { Venture } from "@/lib/ventures";
import type { client } from "@/utils/orpc";
import { orpc } from "@/utils/orpc";

type Measured = NonNullable<
  Awaited<ReturnType<typeof client.ventures.planAgainstActual>>
>;
type Heads = Measured["buying"]["outside"];

const HEAD = "text-muted-foreground px-2 py-1.5 text-xs font-medium";
const CELL = "px-2 py-2 text-end tabular-nums";

/** Some animals as a cell: how many, and what a kilo cost where any were bought. */
const HeadsCell = ({ heads }: { heads: Heads }) => {
  const { t } = useLanguage();
  const taka = useTaka();
  return heads.bdtPerKg === null
    ? t("plan.vs.count", { count: heads.animals })
    : t("plan.vs.heads", {
        count: heads.animals,
        perKg: taka(heads.bdtPerKg),
      });
};

/** What it bought in each band beside what the plan meant to buy there, anything outside every band, and the total. */
const Buying = ({ measured }: { measured: Measured }) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const { buying } = measured;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{t("plan.vs.buying")}</h3>
      <div className="-mx-4 overflow-x-auto md:-mx-5">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="border-b">
            <tr>
              <th className={`${HEAD} ps-4 text-start md:ps-5`} scope="col">
                {t("plan.col.band")}
              </th>
              <th className={`${HEAD} text-end`} scope="col">
                {t("plan.vs.planned")}
              </th>
              <th className={`${HEAD} text-end`} scope="col">
                {t("plan.vs.bought")}
              </th>
              <th className={`${HEAD} text-end`} scope="col">
                {t("plan.vs.plannedCost")}
              </th>
              <th className={`${HEAD} pe-4 text-end md:pe-5`} scope="col">
                {t("plan.vs.cost")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {buying.bands.map((band, at) => (
              <tr key={`band-${band.planned.bdtPerKg}-${at}`}>
                <td className="px-2 py-2 ps-4 md:ps-5">
                  {t("plan.lineOf", { number: formatNumber(at + 1, language) })}
                </td>
                <td className={CELL}>
                  <HeadsCell heads={band.planned} />
                </td>
                <td
                  className={cn(
                    CELL,
                    band.bought.animals < band.planned.animals &&
                      "text-muted-foreground"
                  )}
                >
                  <HeadsCell heads={band.bought} />
                </td>
                <td className={CELL}>{taka(band.planned.costBdt)}</td>
                <td className={`${CELL} pe-4 md:pe-5`}>
                  {taka(band.bought.costBdt)}
                </td>
              </tr>
            ))}
            {buying.outside.animals > 0 ? (
              <tr>
                <td className="text-warning px-2 py-2 ps-4 md:ps-5">
                  {t("plan.vs.outside")}
                </td>
                <td className={CELL}>
                  <Nothing />
                </td>
                <td className={CELL}>
                  <HeadsCell heads={buying.outside} />
                </td>
                <td className={CELL}>
                  <Nothing />
                </td>
                <td className={`${CELL} pe-4 md:pe-5`}>
                  {taka(buying.outside.costBdt)}
                </td>
              </tr>
            ) : null}
          </tbody>
          <tfoot className="border-t font-medium">
            <tr>
              <td className="px-2 py-2 ps-4 md:ps-5">{t("plan.total")}</td>
              <td className={CELL}>
                {t("plan.vs.count", {
                  count: buying.bands.reduce(
                    (sum, band) => sum + band.planned.animals,
                    0
                  ),
                })}
              </td>
              <td className={CELL}>
                <HeadsCell heads={buying.total} />
              </td>
              <td className={CELL}>{taka(measured.money.plannedCattleBdt)}</td>
              <td className={`${CELL} pe-4 md:pe-5`}>
                {taka(buying.total.costBdt)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

/** What a head weighs today beside what the plan said it would by now, and what the plan says at the window. */
const Growth = ({ measured }: { measured: Measured }) => {
  const { t } = useLanguage();
  const kg = useKg();
  const { growth } = measured;
  const actual = growth.actualKgToday;
  // Named, not written into the list: the check for untranslated words reads a less-than beside JSX as a tag.
  const behind = actual !== null && actual < growth.plannedKgToday;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{t("plan.vs.growth")}</h3>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
        <FigureTerm label={t("plan.vs.plannedToday")}>
          {kg(growth.plannedKgToday)}
        </FigureTerm>
        <FigureTerm
          label={t("plan.vs.actualToday")}
          tone={behind ? "warning" : undefined}
          hint={
            actual === null
              ? undefined
              : t("plan.vs.weighedOf", { count: growth.weighed })
          }
        >
          {actual === null ? t("plan.vs.noneWeighed") : kg(actual)}
        </FigureTerm>
        <FigureTerm label={t("plan.vs.atWindow")}>
          {kg(growth.plannedKgAtWindow)}
        </FigureTerm>
      </dl>
    </div>
  );
};

/** The cattle the plan costed against what they cost, the running budget against what is spent, and the result. */
const Money = ({ measured }: { measured: Measured }) => {
  const { t } = useLanguage();
  const taka = useTaka();
  const { money } = measured;
  const planned = {
    plannedLow: taka(money.planned.lowBdt),
    plannedHigh: taka(money.planned.highBdt),
  };
  return (
    <div className="flex flex-col gap-1 text-sm">
      <h3 className="mb-1 text-sm font-semibold">{t("plan.vs.money")}</h3>
      <p>
        {t("plan.vs.cattle", {
          planned: taka(money.plannedCattleBdt),
          actual: taka(money.boughtBdt),
        })}
      </p>
      <p>
        {t("plan.vs.running", {
          budget: taka(money.plannedRunningBdt),
          spent: taka(money.runningSpentBdt),
        })}
      </p>
      <p>
        {money.projected
          ? t("plan.vs.result", {
              ...planned,
              low: taka(money.projected.lowBdt),
              high: taka(money.projected.highBdt),
            })
          : t("plan.vs.resultNoProjection", planned)}
      </p>
    </div>
  );
};

/**
 * A Venture measured against the plan it opened on, on the Owner's page: buying by band, growth and money beside the
 * baseline. Nothing before it has a plan, or while it is still gathering capital and has bought nothing.
 */
export const PlanAgainstActual = ({ venture }: { venture: Venture }) => {
  const { t, language } = useLanguage();
  const measured = useQuery({
    ...orpc.ventures.planAgainstActual.queryOptions({
      input: { ventureId: venture.id },
    }),
    enabled: venture.state !== "open",
  });
  if (venture.state === "open" || measured.data === null) {
    return null;
  }
  return (
    <Section
      description={
        measured.data
          ? t("plan.measuredAgainst", {
              version: formatNumber(measured.data.baselineVersion, language),
            })
          : undefined
      }
      title={t("plan.vs.title")}
    >
      <Loaded query={measured}>
        {measured.data ? (
          <div className="flex flex-col gap-5">
            <Buying measured={measured.data} />
            <Growth measured={measured.data} />
            <Money measured={measured.data} />
          </div>
        ) : null}
      </Loaded>
    </Section>
  );
};
