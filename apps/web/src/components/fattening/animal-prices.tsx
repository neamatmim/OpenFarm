import type { Keeping } from "@OpenFarm/domain";
import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { Scale, Tags, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";

import { Nothing } from "@/components/list-cells";
import type { Tone } from "@/components/page";
import { SUBHEADING, Section, StatusBadge } from "@/components/page";
import { FormField, FormSheet } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useKg } from "@/lib/kg";
import { useMoney, useMoneyRate } from "@/lib/money";
import { useRange } from "@/lib/range";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
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

/** What her cost leaves unsaid and her break-even, after whatever `parts` open it, a line each. */
const CostNotes = ({ one, parts }: { one: AnimalPriced; parts: string[] }) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  const lines = [
    ...parts,
    one.breakEvenMoneyPerKg === null
      ? null
      : t("price.breakEven", { perKg: asMoney(one.breakEvenMoneyPerKg) }),
    one.costIsWhole ? null : t("price.costShort"),
    one.bought ? null : t("price.born"),
  ].filter((part): part is string => part !== null);
  return (
    <span className="text-muted-foreground flex flex-col text-xs">
      {lines.map((part) => (
        <span className="whitespace-nowrap" key={part}>
          {part}
        </span>
      ))}
    </span>
  );
};

/**
 * Her cost and what it leaves unsaid — feed or a dose with no price yet, or no purchase in it for one born here — and
 * her break-even, each a line of its own that never breaks inside itself, so a narrow column stacks them rather than
 * leaving half a phrase alone.
 */
const CostLine = ({ one }: { one: AnimalPriced }) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  return (
    <CostNotes
      one={one}
      parts={[t("price.cost", { cost: asMoney(one.costMoney) })]}
    />
  );
};

/** What she might fetch, low to high, and what that leaves over her cost — or that no price a kilo is set for her. */
const EstimateLine = ({ one }: { one: AnimalPriced }) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  const range = useRange();
  if (!one.low || !one.high) {
    return (
      <span className="text-muted-foreground text-xs">
        {t("price.noPrice")}
      </span>
    );
  }
  const short = one.low.marginMoney < 0;
  return (
    <>
      <span className="font-medium tabular-nums">
        {range(asMoney(one.low.priceMoney), asMoney(one.high.priceMoney))}
      </span>
      <span
        className={cn(
          "text-xs tabular-nums",
          short ? "text-warning" : "text-success"
        )}
      >
        {t("price.margin", {
          low: asMoney(one.low.marginMoney),
          high: asMoney(one.high.marginMoney),
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
  const asMoney = useMoney();
  const perKg = useMoneyRate();
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
  const gaining = keep.costOfGainNowMoney !== null;
  const gain = `${ahead.gainKg < 0 ? "−" : "+"}${kg(Math.abs(ahead.gainKg))}`;
  const details = [
    full || !look
      ? t("keep.ahead", { gain, keep: asMoney(ahead.keepMoney) })
      : null,
    (full || !look) && keep.costOfGainNowMoney !== null
      ? t("keep.perKg", { perKg: perKg(keep.costOfGainNowMoney) })
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
              asMoney(ahead.low.overKeepMoney),
              asMoney(ahead.high.overKeepMoney)
            ),
          })}
        </span>
      ) : null}
      {gaining ? null : (
        <span className="text-danger text-xs tabular-nums">
          {t("keep.notGaining", {
            days: ahead.days,
            keep: asMoney(ahead.keepMoney),
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
      {/* The verdict and what the next days leave over their keep wrap, held to a width: on one line they pushed
          the whole column wider than the board. */}
      <span className="flex max-w-64 flex-col items-end gap-0.5 pt-1 whitespace-normal">
        <KeepLine full={false} one={one} />
      </span>
    </span>
  );
};

/**
 * The same three answers as three columns, for a list with the room: what she might fetch, what she has cost, and keep
 * or sell. Each a line or two, so a row stays one animal tall rather than six lines of money.
 */
export const EstimateCell = ({ tagNumber }: { tagNumber: string }) => {
  const one = useHerPrice(tagNumber);
  if (!one) {
    return <Nothing />;
  }
  return (
    <span className="flex flex-col items-end gap-0.5 text-end whitespace-nowrap">
      <EstimateLine one={one} />
    </span>
  );
};

/** What she has cost so far as the figure, with her break-even and what the cost leaves out beneath. */
export const CostCell = ({ tagNumber }: { tagNumber: string }) => {
  const asMoney = useMoney();
  const one = useHerPrice(tagNumber);
  if (!one) {
    return <Nothing />;
  }
  return (
    <span className="flex flex-col items-end gap-0.5 text-end">
      <span className="font-medium whitespace-nowrap tabular-nums">
        {asMoney(one.costMoney)}
      </span>
      <CostNotes one={one} parts={[]} />
    </span>
  );
};

/** Keep or sell as the verdict and what the next days leave over their keep, or why the farm cannot say. */
export const KeepCell = ({ tagNumber }: { tagNumber: string }) => {
  const one = useHerPrice(tagNumber);
  if (!one?.keep) {
    return <Nothing />;
  }
  return (
    <span className="flex flex-col items-start gap-0.5 whitespace-nowrap">
      <KeepLine full={false} one={one} />
    </span>
  );
};

/** Her price and cost under her on a phone's card, for the Owner; nothing for anybody else. */
export const PriceLine = ({
  tagNumber,
  compact = false,
}: {
  tagNumber: string;
  /** What she might fetch and whether to keep her, without what she has cost — her own page says that — for a card
   *  that is one of many down a phone. */
  compact?: boolean;
}) => {
  const owner = useIsOwner();
  const one = useHerPrice(tagNumber);
  if (!owner || !one) {
    return null;
  }
  return (
    <span className="flex flex-col gap-0.5 text-sm">
      <EstimateLine one={one} />
      {compact ? null : <CostLine one={one} />}
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
  // How far back the farm reads a keep and how far ahead it works keeping her, for the hint to say; either is missing
  // from an answer this phone kept from before it was a setting.
  const prices = usePrices();
  const keepReadDays = prices.data?.keepReadDays;
  const keepAheadDays = prices.data?.keepAheadDays;
  if (!owner || !one) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1 pt-4">
      <h3 className={SUBHEADING}>{t("price.col")}</h3>
      <EstimateLine one={one} />
      <CostLine one={one} />
      <h3 className={cn(SUBHEADING, "pt-3")}>{t("keep.title")}</h3>
      <div className="flex flex-col items-start gap-1">
        <KeepLine full one={one} />
      </div>
      <p className="text-muted-foreground text-xs">
        {keepReadDays === undefined || keepAheadDays === undefined
          ? t("keep.hintUnset")
          : t("keep.hint", { days: keepReadDays, ahead: keepAheadDays })}
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
    low: market ? String(market.lowMoneyPerKg) : "",
    high: market ? String(market.highMoneyPerKg) : "",
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
        saving.mutate({ lowMoneyPerKg: low ?? 0, highMoneyPerKg: high ?? 0 })
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
 * `compact` leaves out what the price is for, for a page that shows it in a row beside others; setting it still says.
 */
export const MarketPrice = ({ compact = false }: { compact?: boolean }) => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
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
      description={compact ? undefined : t("market.hint")}
      title={t("market.title")}
    >
      <p className="text-sm">
        {market
          ? t("market.line", {
              low: asMoney(market.lowMoneyPerKg),
              high: asMoney(market.highMoneyPerKg),
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
              perKg: asMoney(recent.moneyPerKg),
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
