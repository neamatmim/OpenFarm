import {
  farmDayOf,
  feedUnitWord,
  LIVE_STATES,
  SIDES,
  sideOfState,
} from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { cn } from "@OpenFarm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ChevronRight,
  CircleCheck,
  ListX,
  Store,
  TrendingDown,
} from "lucide-react";
import type { ReactNode } from "react";

import { stillHeld } from "@/components/animal/animal-words";
import { useCullList } from "@/components/culling/cull-list";
import { useKeepings } from "@/components/fattening/animal-prices";
import { standingOf as gainStandingOf } from "@/components/fattening/fattening-types";
import { standingOf, valueOf } from "@/components/feed/feed-types";
import { MORE_LINK } from "@/components/home/queue";
import { categoryName } from "@/components/money";
import type { Tone } from "@/components/page";
import { Section } from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { useTaka } from "@/lib/taka";
import { orpc } from "@/utils/orpc";

export { useTaka } from "@/lib/taka";

/** How many kinds of spending the month's money names: the few that matter, not the whole register. */
const TOP_SPENDING = 4;

/** How many feeds running low a panel names before the store page says the rest. */
const LOW_FEEDS_NAMED = 3;

const TONE_TEXT: Record<Tone, string> = {
  neutral: "",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
};

/** The first of this month to today, on the farm's clock: the period an Owner reads money by, and the Money page opens on. */
export const thisMonth = () => {
  const today = farmDayOf(new Date());
  return { from: `${today.slice(0, "YYYY-MM".length)}-01`, to: today };
};

/** Taka as the farm writes it, a loss with its minus. */

/** The words on the way from a panel to the page that holds all of it. */
export const OpenWords = () => {
  const { t } = useLanguage();
  return (
    <>
      {t("owner.open")}
      <ChevronRight aria-hidden className="size-4" />
    </>
  );
};

/** One count a panel is read by: its name small, the figure large. */
const Tally = ({
  label,
  value,
  tone = "neutral",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: Tone;
  className?: string;
}) => (
  <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
    <dt className="text-muted-foreground text-xs">{label}</dt>
    <dd
      className={cn(
        "text-lg font-semibold tracking-tight tabular-nums sm:text-xl",
        TONE_TEXT[tone]
      )}
    >
      {value}
    </dd>
  </div>
);

/** A sum of money on a line of its own on a phone, and a column where there is room. */
const MONEY_LINE =
  "flex-row items-baseline justify-between gap-3 sm:flex-col sm:items-start";

/** A panel still waiting for the farm's answer. */
const Waiting = () => <Skeleton className="h-24 rounded-lg" />;

/** A line that says all is well, in words and colour both. */
const AllWell = ({ children }: { children: ReactNode }) => (
  <p className="text-success flex items-center gap-2 text-sm">
    <CircleCheck aria-hidden className="size-4 shrink-0" />
    {children}
  </p>
);

/**
 * The month's money so far: what came in, what went out, what that leaves, and where most of it went. Totals from a
 * list the server cut short say so.
 */
export const MoneyMonth = () => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const money = useQuery(orpc.money.list.queryOptions({ input: thisMonth() }));
  const rows = money.data?.events ?? [];
  const moneyIn = rows
    .filter((row) => row.direction === "in")
    .reduce((sum, row) => sum + row.amountBdt, 0);
  const out = rows.filter((row) => row.direction === "out");
  const moneyOut = out.reduce((sum, row) => sum + row.amountBdt, 0);
  const byCategory = new Map<string, { name: string; amount: number }>();
  for (const row of out) {
    // A Category the farm made itself has no key, only its name.
    const key = row.categoryKey ?? row.categoryBn;
    const line = byCategory.get(key) ?? {
      name: categoryName(row, language),
      amount: 0,
    };
    line.amount += row.amountBdt;
    byCategory.set(key, line);
  }
  const top = [...byCategory.values()]
    .toSorted((a, b) => b.amount - a.amount)
    .slice(0, TOP_SPENDING);
  const biggest = top[0]?.amount ?? 1;

  return (
    <Section
      action={
        <Link className={MORE_LINK} to="/money">
          <OpenWords />
        </Link>
      }
      description={money.data?.more ? t("money.shownOnly") : undefined}
      title={t("owner.moneyMonth")}
    >
      {money.data ? (
        <>
          {/* Three sums in lakhs do not fit side by side on a phone: there each is a line, its figure at the end. */}
          <dl className="flex flex-col gap-2 sm:grid sm:grid-cols-3 sm:gap-4">
            <Tally
              className={MONEY_LINE}
              label={t("money.totalIn")}
              tone="success"
              value={taka(moneyIn)}
            />
            <Tally
              className={MONEY_LINE}
              label={t("money.totalOut")}
              value={taka(moneyOut)}
            />
            <Tally
              className={MONEY_LINE}
              label={t("money.net")}
              tone={moneyIn - moneyOut < 0 ? "danger" : "neutral"}
              value={taka(moneyIn - moneyOut)}
            />
          </dl>
          {top.length > 0 ? (
            <div className="flex flex-col gap-3 border-t pt-4">
              <h3 className="text-sm font-semibold">
                {t("owner.topSpending")}
              </h3>
              <ul className="flex flex-col gap-2.5">
                {top.map((line) => (
                  <li className="flex flex-col gap-1 text-sm" key={line.name}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate">{line.name}</span>
                      <span className="font-medium tabular-nums">
                        {taka(line.amount)}
                      </span>
                    </div>
                    <span
                      aria-hidden
                      className="bg-muted block h-1.5 overflow-hidden rounded-full"
                    >
                      <span
                        className="bg-primary/60 block h-full rounded-full"
                        style={{ width: `${(line.amount / biggest) * 100}%` }}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("money.none")}</p>
          ) : null}
        </>
      ) : (
        <Waiting />
      )}
    </Section>
  );
};

type Animal = Awaited<ReturnType<typeof orpc.animals.list.call>>[number];

/** One Side of the herd: how many, and how many in each of its States. */
const SideOfHerd = ({
  side,
  animals,
}: {
  side: (typeof SIDES)[number];
  animals: Animal[];
}) => {
  const { t, language } = useLanguage();
  const mine = animals.filter((animal) => animal.side === side);
  const states = LIVE_STATES.filter((state) => sideOfState(state) === side);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">{t(`animals.side.${side}`)}</h3>
        <span className="text-muted-foreground text-sm tabular-nums">
          {formatNumber(mine.length, language)}
        </span>
      </div>
      <dl className="grid grid-cols-3 gap-x-4 gap-y-3">
        {states.map((state) => {
          const count = mine.filter((animal) => animal.state === state).length;
          return (
            <Tally
              key={state}
              label={t(`state.${state}`)}
              value={
                <span className={cn(count === 0 && "text-muted-foreground")}>
                  {formatNumber(count, language)}
                </span>
              }
            />
          );
        })}
      </dl>
    </div>
  );
};

/**
 * The herd as it stands: each Side by State, how many a Withdrawal holds back from the tank or from sale, and what the
 * farm has lost in thirty days — said in a line, and loudly only when it is not nothing.
 */
export const HerdPanel = ({
  died,
  culled,
}: {
  died: number;
  culled: number;
}) => {
  const { t, language } = useLanguage();
  const animals = useQuery(
    orpc.animals.list.queryOptions({ input: { includeExited: false } })
  );
  const herd = animals.data ?? [];
  const culling = useCullList();
  const mightCull = (culling.data?.cows ?? []).filter(
    (cow) => cow.reasons.length > 0
  ).length;
  const milkHeld = herd.filter((a) => stillHeld(a.milkWithdrawalUntil)).length;
  const meatHeld = herd.filter((a) => stillHeld(a.meatWithdrawalUntil)).length;
  const lost = died + culled;

  return (
    <Section
      action={
        <Link className={MORE_LINK} to="/animals">
          <OpenWords />
        </Link>
      }
      title={t("nav.group.herd")}
    >
      {animals.data ? (
        <>
          {SIDES.map((side) => (
            <SideOfHerd animals={herd} key={side} side={side} />
          ))}
          <dl className="grid grid-cols-3 gap-4 border-t pt-4">
            <Tally
              label={t("animals.milkHeld")}
              tone={milkHeld > 0 ? "warning" : "neutral"}
              value={formatNumber(milkHeld, language)}
            />
            <Tally
              label={t("animals.meatHeld")}
              tone={meatHeld > 0 ? "warning" : "neutral"}
              value={formatNumber(meatHeld, language)}
            />
          </dl>
          {lost > 0 ? (
            <p className="text-danger text-sm">
              {t("owner.losses", {
                died: formatNumber(died, language),
                culled: formatNumber(culled, language),
              })}
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">
              {t("owner.noLosses")}
            </p>
          )}
          {mightCull > 0 ? (
            <Link
              className="bg-warning-surface text-warning hover:bg-warning-surface/80 focus-visible:ring-ring flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium outline-none focus-visible:ring-2"
              to="/culling"
            >
              <ListX aria-hidden className="size-4 shrink-0" />
              <span className="flex-1">
                {t("owner.mightCull", { count: mightCull })}
              </span>
              <ChevronRight aria-hidden className="size-4 shrink-0" />
            </Link>
          ) : null}
        </>
      ) : (
        <Waiting />
      )}
    </Section>
  );
};

/** The fattening side: how many are on it, who will miss their target weight, who the farm thinks may be sold, and
 *  which cost more to keep another fortnight than they would put on. */
export const FatteningPanel = () => {
  const { t, language } = useLanguage();
  const board = useQuery(orpc.fattening.board.queryOptions({ input: {} }));
  const ready = useQuery(orpc.ready.suggestions.queryOptions());
  const keepings = useKeepings();
  const rows = board.data ?? [];
  const costsMore = rows.filter(
    (row) => keepings?.get(row.tagNumber) === "costs_more"
  ).length;
  const behind = rows.filter(
    (row) => gainStandingOf(row.onTrack) === "behind"
  ).length;
  const onTrack = rows.filter(
    (row) => gainStandingOf(row.onTrack) === "onTrack"
  ).length;
  const maySell = ready.data?.length ?? 0;

  return (
    <Section
      action={
        <Link className={MORE_LINK} to="/fattening">
          <OpenWords />
        </Link>
      }
      title={t("owner.fatteningTitle")}
    >
      {board.data ? (
        <>
          <dl className="grid grid-cols-3 gap-4">
            <Tally
              label={t("gain.onSide")}
              value={formatNumber(rows.length, language)}
            />
            <Tally
              label={t("gain.behind")}
              tone={behind > 0 ? "warning" : "neutral"}
              value={formatNumber(behind, language)}
            />
            <Tally
              label={t("gain.onTrack")}
              tone={onTrack > 0 ? "success" : "neutral"}
              value={formatNumber(onTrack, language)}
            />
          </dl>
          {maySell > 0 ? (
            <Link
              className="bg-success-surface text-success hover:bg-success-surface/80 focus-visible:ring-ring flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium outline-none focus-visible:ring-2"
              to="/ready"
            >
              <Store aria-hidden className="size-4 shrink-0" />
              <span className="flex-1">
                {t("owner.maySell", {
                  count: formatNumber(maySell, language),
                })}
              </span>
              <ChevronRight aria-hidden className="size-4 shrink-0" />
            </Link>
          ) : (
            <p className="text-muted-foreground text-sm">
              {t("owner.noneToSell")}
            </p>
          )}
          {costsMore > 0 ? (
            <Link
              className="bg-danger-surface text-danger hover:bg-danger-surface/80 focus-visible:ring-ring flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium outline-none focus-visible:ring-2"
              search={{ keeping: "costs_more" }}
              to="/fattening"
            >
              <TrendingDown aria-hidden className="size-4 shrink-0" />
              <span className="flex-1">
                {t("owner.costsMoreToKeep", { count: costsMore })}
              </span>
              <ChevronRight aria-hidden className="size-4 shrink-0" />
            </Link>
          ) : null}
        </>
      ) : (
        <Waiting />
      )}
    </Section>
  );
};

/** The store: what it is worth, and which feeds are running low or out, by name. */
export const FeedPanel = () => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const stock = useQuery(orpc.stock.onHand.queryOptions());
  const live = (stock.data ?? []).filter((line) => !line.retiredAt);
  const short = live.filter((line) =>
    ["low", "out"].includes(standingOf(line))
  );
  const worth = live.reduce((sum, line) => sum + (valueOf(line) ?? 0), 0);

  return (
    <Section
      action={
        <Link className={MORE_LINK} to="/admin/feed">
          <OpenWords />
        </Link>
      }
      title={t("nav.feed")}
    >
      {stock.data ? (
        <>
          <dl className="grid grid-cols-2 gap-4">
            <Tally
              label={t("feed.kpi.items")}
              value={formatNumber(live.length, language)}
            />
            <Tally
              label={t("feed.kpi.low")}
              tone={short.length > 0 ? "warning" : "neutral"}
              value={formatNumber(short.length, language)}
            />
            <Tally
              className="col-span-2"
              label={t("feed.kpi.value")}
              value={taka(worth)}
            />
          </dl>
          {short.length > 0 ? (
            <ul className="flex flex-col gap-1 text-sm">
              {short.slice(0, LOW_FEEDS_NAMED).map((line) => (
                <li className="text-warning" key={line.feedItemId}>
                  {t("owner.feedLow", {
                    feed: line.nameBn,
                    onHand: formatNumber(Math.max(line.onHand, 0), language),
                    unit: feedUnitWord(line.unit, language),
                  })}
                </li>
              ))}
            </ul>
          ) : (
            <AllWell>{t("owner.allStocked")}</AllWell>
          )}
        </>
      ) : (
        <Waiting />
      )}
    </Section>
  );
};
