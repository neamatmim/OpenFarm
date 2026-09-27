import { farmDayOf, startOfFarmDay } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Milk, Tag } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useIsOwner } from "@/components/fattening/animal-prices";
import { EmptyState, Section, StatusBadge } from "@/components/page";
import { FormField, FormSheet } from "@/components/page-kit";
import type { ReturnsPage } from "@/components/returns/returns-page";
import {
  Gaps,
  LEFT_WORD,
  Result,
  ReturnLines,
  RunningLines,
  TodayRange,
} from "@/components/returns/returns-page";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { useTaka } from "@/lib/taka";
import { aFigure, figureOf } from "@/lib/typed-figure";
import type { client } from "@/utils/orpc";
import { orpc } from "@/utils/orpc";

type Dairy = ReturnsPage["dairy"];
type DairyRun = Dairy["standing"][number];
type HeadPrice = Dairy["headPrices"][number];
type ToPrice = Dairy["toPrice"][number];
type HeadPriceKind = Parameters<typeof client.returns.setHeadPrice>[0]["kind"];

/** An answer the phone kept from before the dairy herd was on the page has none of it: read as an empty herd. */
const NO_DAIRY: Dairy = {
  herdNow: { head: 0, milkBdt: 0, running: null, gaps: [] },
  standing: [],
  gone: [],
  headPrices: [],
  toPrice: [],
};

/** The dairy part of the Returns page's answer, or an empty herd for one kept from before it had one. */
const dairyPart = (page: ReturnsPage): Dairy => page.dairy ?? NO_DAIRY;

/** The word for a kind of dairy Animal, as her State is called everywhere else. */
const KIND_WORD = {
  calf: "state.calf",
  heifer: "state.heifer",
  pregnant_heifer: "state.pregnant_heifer",
  milking: "state.milking",
  dry: "state.dry",
} as const satisfies Record<HeadPriceKind, MessageKey>;

const isHeadPriceKind = (state: string): state is HeadPriceKind =>
  state in KIND_WORD;

const stateSaid = (state: string, t: (key: MessageKey) => string): string =>
  isHeadPriceKind(state) ? t(KIND_WORD[state]) : state;

/** How her run began: bred here from her birth, from the Owner's price and its day, or not priced yet. */
const useCameSaid = () => {
  const { t, language } = useLanguage();
  return (run: DairyRun): string => {
    if (run.came === "born") {
      return t("returns.cameBorn");
    }
    if (run.came === "priced" && run.from) {
      return t("returns.camePriced", {
        day: formatDate(new Date(run.from), language),
      });
    }
    return t("returns.cameUnpriced");
  };
};

/** What her run is made of: how it began, what she cost, her milk and its price, and what she went for. */
const DairyRunFacts = ({ run }: { run: DairyRun }) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const came = useCameSaid();
  return (
    <div className="text-muted-foreground flex flex-col gap-0.5 text-sm tabular-nums">
      <p>{came(run)}</p>
      <p>
        {t("returns.dairyCost", { bdt: taka(run.costBdt) })}
        {" · "}
        {t("returns.dairyMilk", {
          litres: run.milkLitres,
          bdt: taka(run.milkBdt),
        })}
        {run.endBdt === null
          ? null
          : ` · ${t("returns.dairyEnd", { bdt: taka(run.endBdt) })}`}
      </p>
      {run.milkPricedEarlier.length > 0 ? (
        <p className="text-xs">
          {t("returns.milkEarlier", {
            months: run.milkPricedEarlier
              .map((month) =>
                formatDate(startOfFarmDay(`${month}-01`), language, "monthYear")
              )
              .join(", "),
          })}
        </p>
      ) : null}
    </div>
  );
};

/** Her figure: a result once she has gone, a range while she is here, or why there is none yet. */
const DairyRunFigure = ({
  run,
  floorDays,
}: {
  run: DairyRun;
  floorDays: number;
}) => {
  if (run.returnOnCost) {
    return (
      <ReturnLines
        bank={null}
        floorDays={floorDays}
        on="onCost"
        shares={run.returnOnCost}
      />
    );
  }
  if (run.running) {
    return <RunningLines running={run.running} />;
  }
  return <Gaps gaps={run.gaps} ventureId={null} />;
};

/** One line for a run in a list: her result, her range today, or that she has no figure yet. */
const DairyRunShort = ({ run }: { run: DairyRun }) => {
  const { t } = useLanguage();
  const taka = useTaka();
  if (run.returnOnCost) {
    return <Result bdt={run.returnOnCost.resultBdt} />;
  }
  // Gone and counted, but no share to say: a calf who cost nothing and fetched nothing is a result of nothing.
  const result = run.resultBdt ?? null;
  if (result !== null) {
    return <Result bdt={result} />;
  }
  if (run.running) {
    return (
      <span className="tabular-nums">
        <TodayRange running={run.running} />
      </span>
    );
  }
  // Here and counted, but nothing spent on her yet: no share, only what a head of her kind would fetch.
  const worth = run.worthToday ?? null;
  if (worth) {
    return (
      <span className="text-muted-foreground tabular-nums">
        {t("returns.worthToday", {
          low: taka(worth.lowBdt),
          high: taka(worth.highBdt),
        })}
      </span>
    );
  }
  return <span className="text-muted-foreground">{t("returns.noFigure")}</span>;
};

type Words = Pick<ReturnType<typeof useLanguage>, "t" | "language">;

/** How and when she left, in the reader's words; nothing while she is here. */
const leftSaid = (run: DairyRun, { t, language }: Words): string | null =>
  run.left
    ? t("returns.leftOn", {
        how: t(LEFT_WORD[run.left.how]),
        day: formatDate(new Date(run.left.on), language),
      })
    : null;

/** Her calves, each her own run, beneath her. */
const Calves = ({ calves }: { calves: DairyRun[] }) => {
  const words = useLanguage();
  const { t } = words;
  if (calves.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-medium">{t("returns.calvesTitle")}</p>
      <ul className="divide-border flex flex-col divide-y">
        {calves.map((calf) => (
          <li
            className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm"
            key={calf.animalId}
          >
            <span>
              <Link
                className="font-medium underline-offset-4 hover:underline"
                params={{ tagNumber: calf.tagNumber }}
                to="/animals/$tagNumber"
              >
                {calf.tagNumber}
              </Link>
              <span className="text-muted-foreground">
                {" · "}
                {leftSaid(calf, words) ?? stateSaid(calf.state, t)}
              </span>
            </span>
            <DairyRunShort run={calf} />
          </li>
        ))}
      </ul>
    </div>
  );
};

/** The herd still here, together: a range at its Head Prices, its milk already back, and whoever could not be counted,
 *  named. */
export const DairyHerdNow = ({ page }: { page: ReturnsPage }) => {
  const { t } = useLanguage();
  const taka = useTaka();
  const { herdNow } = dairyPart(page);
  if (herdNow.head === 0) {
    return <EmptyState bare icon={Milk} title={t("returns.dairyNone")} />;
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        {t("returns.herdNowHead", { count: herdNow.head })}
      </p>
      {herdNow.running ? <RunningLines running={herdNow.running} /> : null}
      {herdNow.milkBdt > 0 ? (
        <p className="text-muted-foreground text-sm tabular-nums">
          {t("returns.herdMilk", { bdt: taka(herdNow.milkBdt) })}
        </p>
      ) : null}
      <Gaps gaps={herdNow.gaps} ventureId={null} />
    </div>
  );
};

/** Every dairy Animal gone from the herd, latest first, each opening into her stay, her figure and her calves. */
export const DairyGone = ({ page }: { page: ReturnsPage }) => {
  const words = useLanguage();
  const { t } = words;
  const { gone } = dairyPart(page);
  if (gone.length === 0) {
    return <EmptyState bare icon={Milk} title={t("returns.dairyNone")} />;
  }
  return (
    <ul className="flex flex-col gap-3">
      {gone.map((run) => (
        <li key={run.animalId}>
          <details className="group surface">
            <summary className="flex cursor-pointer list-none flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              <span className="flex flex-wrap items-center gap-2">
                <ChevronDown
                  aria-hidden
                  className="text-muted-foreground size-4 shrink-0 transition-transform group-open:rotate-180"
                />
                <span className="font-medium">{run.tagNumber}</span>
                <span className="text-muted-foreground text-sm">
                  {leftSaid(run, words)}
                </span>
              </span>
              <DairyRunShort run={run} />
            </summary>
            <div className="flex flex-col gap-3 border-t p-4">
              <DairyRunFacts run={run} />
              <DairyRunFigure floorDays={page.floorDays} run={run} />
              <Calves calves={run.calves ?? []} />
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
};

const HeadPriceSheet = ({
  price,
  onOpenChange,
}: {
  price: HeadPrice;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [low, setLow] = useState(
    price.lowBdt === null ? "" : String(price.lowBdt)
  );
  const [high, setHigh] = useState(
    price.highBdt === null ? "" : String(price.highBdt)
  );
  const saving = useMutation(
    orpc.returns.setHeadPrice.mutationOptions({
      onError: refused,
      onSuccess: () => {
        onOpenChange(false);
        toast.success(t("returns.headPriceSaved"));
      },
    })
  );
  const lowBdt = figureOf(low);
  const highBdt = figureOf(high);
  return (
    <FormSheet
      description={t("returns.headPricesHint")}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        saving.mutate({
          kind: price.kind,
          lowBdt: Math.round(lowBdt ?? 0),
          highBdt: Math.round(highBdt ?? 0),
        })
      }
      open
      pending={saving.isPending}
      ready={aFigure(lowBdt) && aFigure(highBdt)}
      submitLabel={t("returns.setHeadPrice")}
      title={t("returns.headPriceTitle", { kind: t(KIND_WORD[price.kind]) })}
    >
      <FormField id="head-low" label={t("returns.low")}>
        <Input
          autoComplete="off"
          id="head-low"
          inputMode="numeric"
          onChange={(event) => setLow(event.target.value)}
          value={low}
        />
      </FormField>
      <FormField id="head-high" label={t("returns.high")}>
        <Input
          autoComplete="off"
          id="head-high"
          inputMode="numeric"
          onChange={(event) => setHigh(event.target.value)}
          value={high}
        />
      </FormField>
    </FormSheet>
  );
};

/** The five Head Prices, each with what it is set at or that it is not, and the act that sets it. */
export const HeadPriceList = ({ page }: { page: ReturnsPage }) => {
  const { t } = useLanguage();
  const taka = useTaka();
  const [setting, setSetting] = useState<HeadPrice | null>(null);
  return (
    <>
      <ul className="divide-border flex flex-col divide-y">
        {dairyPart(page).headPrices.map((one) => (
          <li
            className="flex flex-wrap items-center justify-between gap-2 py-2"
            key={one.kind}
          >
            <span className="flex flex-col">
              <span className="font-medium">{t(KIND_WORD[one.kind])}</span>
              <span className="text-muted-foreground text-sm tabular-nums">
                {one.lowBdt === null || one.highBdt === null
                  ? t("returns.headPriceNone")
                  : t("returns.headPriceRange", {
                      low: taka(one.lowBdt),
                      high: taka(one.highBdt),
                    })}
              </span>
            </span>
            <Button onClick={() => setSetting(one)} size="sm" variant="outline">
              {t("returns.setHeadPrice")}
            </Button>
          </li>
        ))}
      </ul>
      {setting ? (
        <HeadPriceSheet
          onOpenChange={(open) => {
            if (!open) {
              setSetting(null);
            }
          }}
          price={setting}
        />
      ) : null}
    </>
  );
};

/** The price a dairy Animal was taken on at, from a day — the day she went on the books unless the Owner says — and
 *  where it came from. */
const EntryPriceSheet = ({
  cow,
  onOpenChange,
}: {
  cow: { animalId: string; tagNumber: string; asOf: string };
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [price, setPrice] = useState("");
  const [asOf, setAsOf] = useState(cow.asOf);
  const [note, setNote] = useState("");
  const saving = useMutation(
    orpc.returns.priceCow.mutationOptions({
      onError: refused,
      onSuccess: () => {
        onOpenChange(false);
        toast.success(t("returns.entryPriceSaved"));
      },
    })
  );
  const priceBdt = figureOf(price);
  const today = farmDayOf(new Date());
  return (
    <FormSheet
      description={t("returns.toPriceHint")}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        saving.mutate({
          animalId: cow.animalId,
          priceBdt: Math.round(priceBdt ?? 0),
          asOf,
          note: note.trim(),
        })
      }
      open
      pending={saving.isPending}
      ready={aFigure(priceBdt) && note.trim().length > 0 && asOf.length > 0}
      submitLabel={t("returns.priceIt")}
      title={t("returns.entryPriceTitle", { tag: cow.tagNumber })}
    >
      <FormField id="cow-price" label={t("returns.entryPrice")}>
        <Input
          autoComplete="off"
          id="cow-price"
          inputMode="numeric"
          onChange={(event) => setPrice(event.target.value)}
          value={price}
        />
      </FormField>
      <FormField id="cow-as-of" label={t("returns.asOf")}>
        <Input
          id="cow-as-of"
          max={today}
          onChange={(event) => setAsOf(event.target.value)}
          type="date"
          value={asOf}
        />
      </FormField>
      <FormField id="cow-note" label={t("returns.entryPriceNote")}>
        <Input
          autoComplete="off"
          id="cow-note"
          onChange={(event) => setNote(event.target.value)}
          value={note}
        />
      </FormField>
    </FormSheet>
  );
};

/** Every dairy Animal still waiting on the Owner's price, each with the act that prices her. */
export const AnimalsToPrice = ({ page }: { page: ReturnsPage }) => {
  const { t, language } = useLanguage();
  const [pricing, setPricing] = useState<ToPrice | null>(null);
  const cows = dairyPart(page).toPrice;
  if (cows.length === 0) {
    return <EmptyState bare icon={Tag} title={t("returns.toPriceNone")} />;
  }
  return (
    <>
      <ul className="divide-border flex flex-col divide-y">
        {cows.map((cow) => (
          <li
            className="flex flex-wrap items-center justify-between gap-2 py-2"
            key={cow.animalId}
          >
            <span className="text-sm">
              {t("returns.toPriceLine", {
                tag: cow.tagNumber,
                state: stateSaid(cow.state, t),
                day: formatDate(startOfFarmDay(cow.onTheBooksFrom), language),
              })}
            </span>
            <Button onClick={() => setPricing(cow)} size="sm" variant="outline">
              {t("returns.priceIt")}
            </Button>
          </li>
        ))}
      </ul>
      {pricing ? (
        <EntryPriceSheet
          cow={{
            animalId: pricing.animalId,
            tagNumber: pricing.tagNumber,
            asOf: pricing.onTheBooksFrom,
          }}
          onOpenChange={(open) => {
            if (!open) {
              setPricing(null);
            }
          }}
        />
      ) : null}
    </>
  );
};

/**
 * What a dairy Animal has returned, on her own page: how her run began, what she cost, her milk and what she went for,
 * her figure, and her calves beneath — with the act that prices her, for a cow bought or here before the books.
 */
export const DairyReturnsPanel = ({ animalId }: { animalId: string }) => {
  const { t } = useLanguage();
  const owner = useIsOwner();
  const [pricing, setPricing] = useState(false);
  // Asked only for the Owner: an animal's money is hers alone, and a Manager's page never requests it.
  const hers = useQuery({
    ...orpc.returns.animal.queryOptions({ input: { animalId } }),
    enabled: owner,
  });
  const found = hers.data;
  if (!(owner && found)) {
    return null;
  }
  const { run, calves, floorDays } = found;
  const priceable = run.came !== "born";
  return (
    <Section title={t("returns.dairyPanelTitle")}>
      <div className="flex flex-col gap-3">
        <DairyRunFacts run={run} />
        <DairyRunFigure floorDays={floorDays} run={run} />
        {priceable ? (
          <Button
            className="self-start"
            onClick={() => setPricing(true)}
            size="sm"
            variant="outline"
          >
            {run.came === "priced"
              ? t("returns.entryPriceAgain")
              : t("returns.priceIt")}
          </Button>
        ) : null}
        <Calves calves={calves} />
        {pricing ? (
          <EntryPriceSheet
            cow={{
              animalId: run.animalId,
              tagNumber: run.tagNumber,
              asOf: run.from
                ? farmDayOf(new Date(run.from))
                : farmDayOf(new Date()),
            }}
            onOpenChange={setPricing}
          />
        ) : null}
      </div>
    </Section>
  );
};

/**
 * A cow's return so far, for the Cull list: beside her reasons, never one of them. Read from the Returns page's own
 * answer, asked once for the whole list and only by the Owner, whose list it is.
 */
export const CullListReturn = ({
  tagNumber,
  labelled,
}: {
  tagNumber: string;
  /** Said with its words, on a phone's card where no column header says it. */
  labelled: boolean;
}) => {
  const { t } = useLanguage();
  const owner = useIsOwner();
  const page = useQuery({
    ...orpc.returns.page.queryOptions(),
    enabled: owner,
  });
  const run = page.data
    ? dairyPart(page.data).standing.find((one) => one.tagNumber === tagNumber)
    : undefined;
  if (!run) {
    return null;
  }
  return (
    <span className="flex flex-wrap items-center gap-2 text-sm">
      {labelled ? (
        <span className="text-muted-foreground">{t("returns.soFar")}</span>
      ) : null}
      <DairyRunShort run={run} />
      {run.running ? (
        <StatusBadge tone="warning">{t("returns.estimate")}</StatusBadge>
      ) : null}
    </span>
  );
};
