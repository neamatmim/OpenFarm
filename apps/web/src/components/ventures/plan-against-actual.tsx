import { formatNumber } from "@OpenFarm/i18n";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";

import { COLUMN_HEADING } from "@/components/data-table";
import { Nothing } from "@/components/list-cells";
import { Loaded, Section } from "@/components/page";
import { FigureTerm } from "@/components/page-kit";
import { useLineBreedName } from "@/components/ventures/line-breed";
import { useLanguage } from "@/i18n/language-provider";
import { useKg } from "@/lib/kg";
import { useMoney } from "@/lib/money";
import type { Venture } from "@/lib/ventures";
import type { client } from "@/utils/orpc";
import { orpc } from "@/utils/orpc";

type Measured = NonNullable<
  Awaited<ReturnType<typeof client.ventures.plan.againstActual>>
>;
type Heads = Measured["buying"]["outside"];

const HEAD = `${COLUMN_HEADING} px-2 pt-1.5 font-medium`;
const CELL = "px-2 py-2 text-right tabular-nums";

/** Some animals as a cell: how many, and what a kilo cost where any were bought. */
const HeadsCell = ({ heads }: { heads: Heads }) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  return heads.moneyPerKg === null
    ? t("plan.vs.count", { count: heads.animals })
    : t("plan.vs.heads", {
        count: heads.animals,
        perKg: asMoney(heads.moneyPerKg),
      });
};

/** What it bought in each band beside what the plan meant to buy there, anything outside every band, and the total. */
const Buying = ({ measured }: { measured: Measured }) => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  const breedOfLine = useLineBreedName();
  const { buying } = measured;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{t("plan.vs.buying")}</h3>
      <div className="-mx-4 overflow-x-auto md:-mx-5">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="border-b">
            <tr>
              <th className={`${HEAD} pl-4 text-left md:pl-5`} scope="col">
                {t("plan.col.band")}
              </th>
              <th className={`${HEAD} text-right`} scope="col">
                {t("plan.vs.planned")}
              </th>
              <th className={`${HEAD} text-right`} scope="col">
                {t("plan.vs.bought")}
              </th>
              <th className={`${HEAD} text-right`} scope="col">
                {t("plan.vs.plannedCost")}
              </th>
              <th className={`${HEAD} pr-4 text-right md:pr-5`} scope="col">
                {t("plan.vs.cost")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {buying.bands.map((band, at) => (
              <tr key={`band-${band.planned.moneyPerKg}-${at}`}>
                <td className="px-2 py-2 pl-4 md:pl-5">
                  {t("plan.lineOf", { number: formatNumber(at + 1, language) })}
                  {/* Its weights and Breed, so two Breeds bought at the same weights are told apart; an answer this
                      phone kept from before a band said which line it was says only its number. */}
                  {band.line ? (
                    <span className="text-muted-foreground block text-xs">
                      {t("plan.band", {
                        from: formatNumber(band.line.fromKg, language),
                        to: formatNumber(band.line.toKg, language),
                      })}
                      {" · "}
                      {breedOfLine(band.line.breedId)}
                    </span>
                  ) : null}
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
                <td className={CELL}>{asMoney(band.planned.costMoney)}</td>
                <td className={`${CELL} pr-4 md:pr-5`}>
                  {asMoney(band.bought.costMoney)}
                </td>
              </tr>
            ))}
            {buying.outside.animals > 0 ? (
              <tr>
                <td className="text-warning px-2 py-2 pl-4 md:pl-5">
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
                <td className={`${CELL} pr-4 md:pr-5`}>
                  {asMoney(buying.outside.costMoney)}
                </td>
              </tr>
            ) : null}
          </tbody>
          <tfoot className="border-t font-medium">
            <tr>
              <td className="px-2 py-2 pl-4 md:pl-5">{t("plan.total")}</td>
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
              <td className={CELL}>
                {asMoney(measured.money.plannedCattleMoney)}
              </td>
              <td className={`${CELL} pr-4 md:pr-5`}>
                {asMoney(buying.total.costMoney)}
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
  const asMoney = useMoney();
  const { money } = measured;
  const range = (low: number, high: number) =>
    t("projection.range", { low: asMoney(low), high: asMoney(high) });
  // Each row what the plan said beside what it is now: the cattle, the running and the result, one figure a cell.
  const rows = [
    {
      key: "cattle",
      label: t("plan.vs.row.cattle"),
      planned: asMoney(money.plannedCattleMoney),
      now: asMoney(money.boughtMoney),
    },
    {
      key: "running",
      label: t("plan.vs.row.running"),
      planned: asMoney(money.plannedRunningMoney),
      now: asMoney(money.runningSpentMoney),
    },
    {
      key: "result",
      label: t("plan.vs.row.result"),
      planned: range(money.planned.lowMoney, money.planned.highMoney),
      now: money.projected
        ? range(money.projected.lowMoney, money.projected.highMoney)
        : t("plan.vs.endedNoProjection"),
    },
  ];
  return (
    <div className="flex flex-col gap-1">
      <h3 className="mb-1 text-sm font-semibold">{t("plan.vs.money")}</h3>
      <div className="-mx-4 overflow-x-auto md:-mx-5">
        <table className="w-full max-w-3xl text-sm">
          <thead className="border-b">
            <tr>
              <th className={`${HEAD} pl-4 text-left md:pl-5`} scope="col">
                <span className="sr-only">{t("plan.vs.money")}</span>
              </th>
              <th className={`${HEAD} text-right`} scope="col">
                {t("plan.vs.col.plan")}
              </th>
              <th className={`${HEAD} pr-4 text-right md:pr-5`} scope="col">
                {t("plan.vs.col.now")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.key}>
                <th
                  className="px-2 py-2 pl-4 text-left font-normal md:pl-5"
                  scope="row"
                >
                  {row.label}
                </th>
                <td className={CELL}>{row.planned}</td>
                <td className={`${CELL} pr-4 md:pr-5`}>{row.now}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
    ...orpc.ventures.plan.againstActual.queryOptions({
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
