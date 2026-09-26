import { formatDate, numberAsTyped } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Tags } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Nothing } from "@/components/list-cells";
import { Section } from "@/components/page";
import { FormField, FormSheet } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { useTaka } from "@/lib/taka";
import type { client } from "@/utils/orpc";
import { orpc } from "@/utils/orpc";

/**
 * An animal's price against her cost, for the Owner's eyes: what she has cost so far, the price a kilo at which she
 * pays for herself, and what she might fetch at the low and the high price a kilo with what that leaves over her cost.
 * The Manager reads what she weighs, not what she made, so none of it is drawn for anybody else.
 */

type Priced = Awaited<ReturnType<typeof client.fattening.prices>>;
type AnimalPriced = Priced["animals"][number];

/** Whether the person reading is the Owner: the only one prices are shown to. */
export const useIsOwner = (): boolean => {
  const me = useQuery(orpc.people.me.queryOptions());
  return (me.data?.roles ?? []).some((role) => role === "owner");
};

/** Every animal on the fattening side priced, by Tag Number — asked only for the Owner. */
const usePrices = () => {
  const owner = useIsOwner();
  return useQuery({
    ...orpc.fattening.prices.queryOptions(),
    enabled: owner,
  });
};

const useHerPrice = (tagNumber: string): AnimalPriced | null => {
  const prices = usePrices();
  return (
    prices.data?.animals.find((one) => one.tagNumber === tagNumber) ?? null
  );
};

/** Her cost and what it leaves unsaid: feed or a dose with no price yet, or no purchase in it for one born here. */
const CostLine = ({ one }: { one: AnimalPriced }) => {
  const { t } = useLanguage();
  const taka = useTaka();
  return (
    <span className="text-muted-foreground text-xs">
      {t("price.cost", { cost: taka(one.costBdt) })}
      {one.breakEvenBdtPerKg === null
        ? null
        : ` · ${t("price.breakEven", { perKg: taka(one.breakEvenBdtPerKg) })}`}
      {one.costIsWhole ? null : ` · ${t("price.costShort")}`}
      {one.bought ? null : ` · ${t("price.born")}`}
    </span>
  );
};

/** What she might fetch, low to high, and what that leaves over her cost — or that no price a kilo is set for her. */
const EstimateLine = ({ one }: { one: AnimalPriced }) => {
  const { t } = useLanguage();
  const taka = useTaka();
  if (!one.low || !one.high) {
    return (
      <span className="text-muted-foreground text-xs">
        {t("price.noPrice")}
      </span>
    );
  }
  const short = one.low.marginBdt < 0;
  return (
    <>
      <span className="font-medium tabular-nums">
        {t("projection.range", {
          low: taka(one.low.priceBdt),
          high: taka(one.high.priceBdt),
        })}
      </span>
      <span
        className={cn(
          "text-xs tabular-nums",
          short ? "text-warning" : "text-success"
        )}
      >
        {t("price.margin", {
          low: taka(one.low.marginBdt),
          high: taka(one.high.marginBdt),
        })}
      </span>
    </>
  );
};

/** Her price and cost in a list's column: nothing for anybody but the Owner, and a dash while it is read. */
export const PriceCell = ({ tagNumber }: { tagNumber: string }) => {
  const one = useHerPrice(tagNumber);
  if (!one) {
    return <Nothing />;
  }
  return (
    <span className="flex flex-col items-end gap-0.5 text-end">
      <EstimateLine one={one} />
      <CostLine one={one} />
    </span>
  );
};

/** Her price and cost under her on a phone's card, for the Owner; nothing for anybody else. */
export const PriceLine = ({ tagNumber }: { tagNumber: string }) => {
  const owner = useIsOwner();
  const one = useHerPrice(tagNumber);
  if (!owner || !one) {
    return null;
  }
  return (
    <span className="flex flex-col gap-0.5 text-sm">
      <EstimateLine one={one} />
      <CostLine one={one} />
    </span>
  );
};

/** The two prices a kilo as the sheet holds them while they are typed. */
interface Typed {
  low: string;
  high: string;
}

/** A typed figure as a number, Bangla digits and all; nothing for a blank. */
const figureOf = (typed: string): number | null => {
  const plain = numberAsTyped(typed);
  return plain === "" ? null : Number(plain);
};

/** A price a kilo the Owner may set: a real number above nothing. */
const aPrice = (value: number | null): value is number =>
  value !== null && Number.isFinite(value) && value > 0;

/** Setting the market price a kilo, low and high. */
const MarketSheet = ({
  market,
  onOpenChange,
}: {
  market: Priced["market"];
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [typed, setTyped] = useState<Typed>({
    low: market ? String(market.lowBdtPerKg) : "",
    high: market ? String(market.highBdtPerKg) : "",
  });
  const saving = useMutation(
    orpc.fattening.setMarketPrice.mutationOptions({
      onError: refused,
      onSuccess: () => {
        onOpenChange(false);
        toast.success(t("market.saved"));
      },
    })
  );
  const low = figureOf(typed.low);
  const high = figureOf(typed.high);
  // Named, not written into the sheet: the check for untranslated words reads a less-than beside JSX as a tag.
  const lowAboveHigh = low !== null && high !== null && low > high;
  const ready = aPrice(low) && aPrice(high) && !lowAboveHigh;
  const label = t(market ? "market.change" : "market.set");
  return (
    <FormSheet
      description={t("market.hint")}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        saving.mutate({ lowBdtPerKg: low ?? 0, highBdtPerKg: high ?? 0 })
      }
      open
      pending={saving.isPending}
      ready={ready}
      submitLabel={label}
      title={label}
    >
      <FormField
        hint={lowAboveHigh ? t("projection.lowAboveHigh") : undefined}
        id="market-low"
        label={t("market.low")}
      >
        <Input
          autoComplete="off"
          id="market-low"
          inputMode="decimal"
          onChange={(event) => setTyped({ ...typed, low: event.target.value })}
          value={typed.low}
        />
      </FormField>
      <FormField id="market-high" label={t("market.high")}>
        <Input
          autoComplete="off"
          id="market-high"
          inputMode="decimal"
          onChange={(event) => setTyped({ ...typed, high: event.target.value })}
          value={typed.high}
        />
      </FormField>
    </FormSheet>
  );
};

/**
 * The market price a kilo the farm's own animals are priced at, and the act that sets it — on the Owner's screens
 * only. A Venture's animals are priced at their Venture's own prices, set on the Venture.
 */
export const MarketPrice = () => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const owner = useIsOwner();
  const prices = usePrices();
  const [setting, setSetting] = useState(false);
  if (!owner || !prices.data) {
    return null;
  }
  const { market } = prices.data;
  return (
    <Section
      action={
        <Button onClick={() => setSetting(true)} size="sm" variant="outline">
          <Tags aria-hidden data-icon="inline-start" />
          {t(market ? "market.change" : "market.set")}
        </Button>
      }
      description={t("market.hint")}
      title={t("market.title")}
    >
      <p className="text-sm">
        {market
          ? t("market.line", {
              low: taka(market.lowBdtPerKg),
              high: taka(market.highBdtPerKg),
              day: market.setAt
                ? formatDate(new Date(market.setAt), language, "date")
                : "—",
            })
          : t("market.none")}
      </p>
      {setting ? (
        <MarketSheet market={market} onOpenChange={setSetting} />
      ) : null}
    </Section>
  );
};
