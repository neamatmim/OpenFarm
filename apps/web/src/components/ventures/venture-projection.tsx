import { formatDate, formatNumber, numberAsTyped } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { TrendingUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Loaded, Section } from "@/components/page";
import { FormField, FormSheet } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { useTaka } from "@/lib/taka";
import type { Venture } from "@/lib/ventures";
import { orpc } from "@/utils/orpc";
import type { client } from "@/utils/orpc";

type Read = Awaited<ReturnType<typeof client.ventures.projection>>;
type Basis = NonNullable<Read["basis"]>;

/** The five figures as the sheet holds them while they are typed. */
interface Typed {
  saleLow: string;
  saleHigh: string;
  buy: string;
  buyWeight: string;
  dailyGain: string;
}

const FIELDS = [
  ["saleLow", "projection.saleLow"],
  ["saleHigh", "projection.saleHigh"],
] as const;

const PLAN_FIELDS = [
  ["buy", "projection.buy"],
  ["buyWeight", "projection.buyWeight"],
  ["dailyGain", "projection.dailyGain"],
] as const;

/** A typed figure as a number, Bangla digits and all; nothing for a blank. */
const figureOf = (typed: string): number | null => {
  const plain = numberAsTyped(typed);
  return plain === "" ? null : Number(plain);
};

/** A figure the Owner may set: a real number above nothing. */
const positive = (value: number | null) =>
  value !== null && Number.isFinite(value) && value > 0;

const typedOf = (value: number | null | undefined) =>
  value === null || value === undefined ? "" : String(value);

/** Whether the Venture has animals still to buy, and so a buying plan to be projected from. */
const stillBuying = (venture: Venture) =>
  venture.state === "open" || venture.state === "buying";

/**
 * Setting the prices a Venture is projected from: the low and the high a kilo it will sell at, and — while it has
 * animals still to buy — the price a kilo, the weight and the daily gain it expects of them.
 */
const PricesSheet = ({
  venture,
  basis,
  onOpenChange,
}: {
  venture: Venture;
  basis: Basis | null;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [typed, setTyped] = useState<Typed>(() => ({
    saleLow: typedOf(basis?.saleLowBdtPerKg),
    saleHigh: typedOf(basis?.saleHighBdtPerKg),
    buy: typedOf(basis?.buyBdtPerKg),
    buyWeight: typedOf(basis?.buyWeightKg),
    dailyGain: typedOf(basis?.dailyGainKg),
  }));
  const saving = useMutation(
    orpc.ventures.setProjection.mutationOptions({
      onError: refused,
      onSuccess: () => {
        onOpenChange(false);
        toast.success(t("projection.saved"));
      },
    })
  );
  const low = figureOf(typed.saleLow);
  const high = figureOf(typed.saleHigh);
  const lowAboveHigh = low !== null && high !== null && low > high;
  const ready = positive(low) && positive(high) && !lowAboveHigh;
  const planned = stillBuying(venture);
  const edit = (key: keyof Typed, value: string) =>
    setTyped({ ...typed, [key]: value });
  const field = ([key, label]: readonly [
    keyof Typed,
    Parameters<typeof t>[0],
  ]) => (
    <FormField
      hint={
        key === "saleLow" && lowAboveHigh
          ? t("projection.lowAboveHigh")
          : undefined
      }
      id={`projection-${key}`}
      key={key}
      label={t(label)}
    >
      <Input
        autoComplete="off"
        id={`projection-${key}`}
        inputMode="decimal"
        onChange={(event) => edit(key, event.target.value)}
        value={typed[key]}
      />
    </FormField>
  );
  return (
    <FormSheet
      description={t("projection.sheetHint")}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        saving.mutate({
          ventureId: venture.id,
          saleLowBdtPerKg: low ?? 0,
          saleHighBdtPerKg: high ?? 0,
          buyBdtPerKg: planned ? figureOf(typed.buy) : null,
          buyWeightKg: planned ? figureOf(typed.buyWeight) : null,
          dailyGainKg: planned ? figureOf(typed.dailyGain) : null,
        })
      }
      open
      pending={saving.isPending}
      ready={ready}
      submitLabel={t(basis ? "projection.change" : "projection.set")}
      title={t(basis ? "projection.change" : "projection.set")}
    >
      {FIELDS.map(field)}
      {planned ? (
        <fieldset className="flex flex-col gap-4 border-t pt-4">
          <legend className="text-sm font-medium">
            {t("projection.plan")}
          </legend>
          <p className="text-muted-foreground text-xs">
            {t("projection.planHint")}
          </p>
          {PLAN_FIELDS.map(field)}
        </fieldset>
      ) : null}
    </FormSheet>
  );
};

/** One figure of a projection, under its name. */
const Fact = ({ label, children }: { label: string; children: string }) => (
  <div className="flex flex-col gap-0.5">
    <dt className="text-muted-foreground text-sm">{label}</dt>
    <dd className="font-medium tabular-nums">{children}</dd>
  </div>
);

/** What the projection comes to, at both ends, with what it is worked from. */
const Figures = ({ read }: { read: Read }) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const { basis, projection } = read;
  if (!basis) {
    return (
      <p className="text-muted-foreground text-sm">{t("projection.none")}</p>
    );
  }
  if (!projection) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("projection.needsPlan")}
      </p>
    );
  }
  const range = (low: string, high: string) =>
    t("projection.range", { low, high });
  return (
    <>
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <Fact label={t("projection.profit")}>
          {range(
            taka(projection.low.profitBdt),
            taka(projection.high.profitBdt)
          )}
        </Fact>
        <Fact label={t("projection.perUnit")}>
          {range(
            taka(projection.low.perUnitBdt),
            taka(projection.high.perUnitBdt)
          )}
        </Fact>
        <Fact label={t("projection.prices")}>
          {range(taka(basis.saleLowBdtPerKg), taka(basis.saleHighBdtPerKg))}
        </Fact>
        <Fact label={t("projection.kgAtSale")}>
          {t("portal.kg", {
            kg: formatNumber(Math.round(projection.kgAtSale), language),
          })}
        </Fact>
        <Fact label={t("projection.charged")}>
          {taka(projection.chargedBdt)}
        </Fact>
        {projection.realisedBdt > 0 ? (
          <Fact label={t("projection.realised")}>
            {taka(projection.realisedBdt)}
          </Fact>
        ) : null}
      </dl>
      {projection.low.profitBdt < 0 ? (
        <p className="text-warning text-sm">{t("projection.lossAtLow")}</p>
      ) : null}
      <p className="text-muted-foreground text-xs">
        {t("projection.setOn", {
          day: formatDate(new Date(basis.setAt), language, "date"),
        })}
      </p>
    </>
  );
};

/**
 * A Venture's Projection on the Owner's page (ADR 0010): what it might make at the sale prices the Owner expects,
 * the prices themselves, and the act that sets them. Nothing for one that is settled or called off.
 */
export const VentureProjectionPanel = ({ venture }: { venture: Venture }) => {
  const { t } = useLanguage();
  const [setting, setSetting] = useState(false);
  const read = useQuery(
    orpc.ventures.projection.queryOptions({ input: { ventureId: venture.id } })
  );
  if (venture.state === "settled" || venture.state === "cancelled") {
    return null;
  }
  const basis = read.data?.basis ?? null;
  return (
    <Section
      action={
        <Button
          disabled={!read.data}
          onClick={() => setSetting(true)}
          size="sm"
          variant="outline"
        >
          <TrendingUp aria-hidden data-icon="inline-start" />
          {t(basis ? "projection.change" : "projection.set")}
        </Button>
      }
      description={t("projection.hint")}
      title={t("projection.title")}
    >
      <Loaded query={read}>
        {read.data ? <Figures read={read.data} /> : null}
      </Loaded>
      {/* Drawn afresh each time it opens, so it starts from the prices set now. */}
      {setting ? (
        <PricesSheet
          basis={basis}
          onOpenChange={setSetting}
          venture={venture}
        />
      ) : null}
    </Section>
  );
};
