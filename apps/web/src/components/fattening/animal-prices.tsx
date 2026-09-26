import type { Keeping } from "@OpenFarm/domain";
import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { Scale, Tags, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Nothing } from "@/components/list-cells";
import type { Tone } from "@/components/page";
import { Section, StatusBadge } from "@/components/page";
import { FormField, FormSheet } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useKg } from "@/lib/kg";
import { useRange } from "@/lib/range";
import { useRefused } from "@/lib/refused";
import { useTaka, useTakaToThePaisa } from "@/lib/taka";
import { aFigure, figureOf } from "@/lib/typed-figure";
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

/**
 * Her cost and what it leaves unsaid — feed or a dose with no price yet, or no purchase in it for one born here — and
 * her break-even, each a line of its own that never breaks inside itself, so a narrow column stacks them rather than
 * leaving half a phrase alone.
 */
const CostLine = ({ one }: { one: AnimalPriced }) => {
  const { t } = useLanguage();
  const taka = useTaka();
  const parts = [
    t("price.cost", { cost: taka(one.costBdt) }),
    one.breakEvenBdtPerKg === null
      ? null
      : t("price.breakEven", { perKg: taka(one.breakEvenBdtPerKg) }),
    one.costIsWhole ? null : t("price.costShort"),
    one.bought ? null : t("price.born"),
  ].filter((part): part is string => part !== null);
  return (
    <span className="text-muted-foreground flex flex-col text-xs">
      {parts.map((part) => (
        <span className="whitespace-nowrap" key={part}>
          {part}
        </span>
      ))}
    </span>
  );
};

/** What she might fetch, low to high, and what that leaves over her cost — or that no price a kilo is set for her. */
const EstimateLine = ({ one }: { one: AnimalPriced }) => {
  const { t } = useLanguage();
  const taka = useTaka();
  const range = useRange();
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
        {range(taka(one.low.priceBdt), taka(one.high.priceBdt))}
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

/** Each answer to keep or sell as it is drawn: its colour, its mark and its words. */
const KEEPING_LOOK: Record<
  Keeping,
  {
    tone: Tone;
    text: string;
    icon: LucideIcon;
    word: "keep.pays" | "keep.close" | "keep.costsMore";
  }
> = {
  pays: {
    tone: "success",
    text: "text-success",
    icon: TrendingUp,
    word: "keep.pays",
  },
  close: {
    tone: "warning",
    text: "text-warning",
    icon: Scale,
    word: "keep.close",
  },
  costs_more: {
    tone: "danger",
    text: "text-danger",
    icon: TrendingDown,
    word: "keep.costsMore",
  },
};

/** Why the farm cannot say yet, in words. */
const UNKNOWN_WORD = {
  too_new: "keep.tooNew",
  not_fed: "keep.notFed",
  no_rate: "keep.noRate",
} as const;

/**
 * Keep her or sell her: whether another fortnight pays, and what it leaves over its keep at each end of her price —
 * or, while she is putting nothing on, what the fortnight costs for nothing. `full` adds the kilos, their keep and
 * what a kilo costs to put on, for her own page; a list keeps to the verdict and the sum.
 */
const KeepLine = ({ one, full }: { one: AnimalPriced; full: boolean }) => {
  const { t } = useLanguage();
  const taka = useTaka();
  const perKg = useTakaToThePaisa();
  const range = useRange();
  const kg = useKg();
  // An answer this phone kept from before the farm weighed keeping has none.
  const keep = one.keep ?? null;
  if (keep === null) {
    return null;
  }
  if (!keep.known) {
    return (
      <span className="text-muted-foreground text-xs">
        {t(UNKNOWN_WORD[keep.because])}
      </span>
    );
  }
  const { ahead } = keep;
  const look = keep.keeping ? KEEPING_LOOK[keep.keeping] : null;
  const gaining = keep.costOfGainNowBdt !== null;
  const gain = `${ahead.gainKg < 0 ? "−" : "+"}${kg(Math.abs(ahead.gainKg))}`;
  const details = [
    full || !look ? t("keep.ahead", { gain, keep: taka(ahead.keepBdt) }) : null,
    (full || !look) && keep.costOfGainNowBdt !== null
      ? t("keep.perKg", { perKg: perKg(keep.costOfGainNowBdt) })
      : null,
    keep.whole ? null : t("keep.short"),
  ].filter((part): part is string => part !== null);
  return (
    <>
      {look ? (
        <StatusBadge icon={look.icon} tone={look.tone}>
          {t(look.word)}
        </StatusBadge>
      ) : null}
      {gaining && ahead.low && ahead.high ? (
        <span className={cn("text-xs tabular-nums", look?.text)}>
          {t("keep.over", {
            days: ahead.days,
            over: range(
              taka(ahead.low.overKeepBdt),
              taka(ahead.high.overKeepBdt)
            ),
          })}
        </span>
      ) : null}
      {gaining ? null : (
        <span className="text-danger text-xs tabular-nums">
          {t("keep.notGaining", {
            days: ahead.days,
            keep: taka(ahead.keepBdt),
          })}
        </span>
      )}
      {details.map((part) => (
        <span
          className="text-muted-foreground text-xs whitespace-nowrap tabular-nums"
          key={part}
        >
          {part}
        </span>
      ))}
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
    <span className="flex flex-col items-end gap-0.5 text-end whitespace-nowrap">
      <EstimateLine one={one} />
      <CostLine one={one} />
      <span className="flex flex-col items-end gap-0.5 pt-1">
        <KeepLine full={false} one={one} />
      </span>
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
      <span className="flex flex-col items-start gap-0.5 pt-1">
        <KeepLine full={false} one={one} />
      </span>
    </span>
  );
};

/**
 * Whether keeping each animal another fortnight pays, by Tag Number — or why the farm cannot say — for the Owner's
 * filters and counts. Nothing while it is read, and nothing for anybody else.
 */
export const useKeepings = (): Map<string, Keeping | "unknown"> | null => {
  const prices = usePrices();
  if (!prices.data) {
    return null;
  }
  return new Map(
    prices.data.animals.map((one) => {
      // An answer this phone kept from before the farm weighed keeping has none.
      const keep = one.keep ?? null;
      const said = keep?.known ? keep.keeping : null;
      return [one.tagNumber, said ?? "unknown"] as const;
    })
  );
};

/** Her price and cost on her own page, under what she has cost: for the Owner, while she is on the fattening side
 *  and priced; nothing for anybody else. */
export const HerPrice = ({ tagNumber }: { tagNumber: string }) => {
  const { t } = useLanguage();
  const owner = useIsOwner();
  const one = useHerPrice(tagNumber);
  // The farm's keep days, for the hint to say; missing from an answer this phone kept from before it was a setting.
  const keepReadDays = usePrices().data?.keepReadDays;
  if (!owner || !one) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1 pt-4">
      <h3 className="font-semibold">{t("price.col")}</h3>
      <EstimateLine one={one} />
      <CostLine one={one} />
      <h3 className="pt-3 font-semibold">{t("keep.title")}</h3>
      <div className="flex flex-col items-start gap-1">
        <KeepLine full one={one} />
      </div>
      <p className="text-muted-foreground text-xs">
        {keepReadDays === undefined
          ? t("keep.hintUnset")
          : t("keep.hint", { days: keepReadDays })}
      </p>
    </div>
  );
};

/** The two prices a kilo as the sheet holds them while they are typed. */
interface Typed {
  low: string;
  high: string;
}

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
  const ready = aFigure(low) && aFigure(high) && !lowAboveHigh;
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
  // An answer this phone kept from before the farm read its own sales has none.
  const recent = prices.data.recentSales ?? null;
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
      <p className="text-muted-foreground text-sm">
        {recent
          ? t("market.recent", {
              days: recent.days,
              perKg: taka(recent.bdtPerKg),
              animals: recent.animals,
            })
          : t("market.noRecent", { days: 60 })}
      </p>
      {setting ? (
        <MarketSheet market={market} onOpenChange={setSetting} />
      ) : null}
    </Section>
  );
};
