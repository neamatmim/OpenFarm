import { buttonVariants } from "@OpenFarm/ui/components/button";
import { cn } from "@OpenFarm/ui/lib/utils";
import { Link } from "@tanstack/react-router";

import { TagLink } from "@/components/fattening/fattening-words";
import type { Gap } from "@/components/returns/return-figure";
import { useLanguage } from "@/i18n/language-provider";

/** Where what puts a gap right is done: a weight on her page, a Venture's price on its plan, the farm's on the board. */
const GapFix = ({ gap, ventureId }: { gap: Gap; ventureId: string | null }) => {
  const { t } = useLanguage();
  const className = cn(
    buttonVariants({ size: "sm", variant: "outline" }),
    "shrink-0 self-start sm:self-center"
  );
  const label = t(`returns.fix.${gap.why}`);
  if (gap.why === "no_milk_price") {
    return (
      <Link className={className} to="/milk">
        {label}
      </Link>
    );
  }
  const onThePricesTab =
    gap.why === "not_priced" ||
    gap.why === "no_entry_price" ||
    gap.why === "no_head_price";
  if (onThePricesTab) {
    return (
      <Link className={className} to="/returns/head-prices">
        {label}
      </Link>
    );
  }
  if (gap.why === "no_weight") {
    return (
      <Link
        className={className}
        params={{ tagNumber: gap.tagNumber }}
        to="/animals/$tagNumber"
      >
        {label}
      </Link>
    );
  }
  return ventureId ? (
    <Link
      className={className}
      params={{ ventureId }}
      to="/ventures/$ventureId"
    >
      {label}
    </Link>
  ) : (
    <Link className={className} to="/fattening">
      {label}
    </Link>
  );
};

/** Gaps by what is missing, in the order each was first met: one reason, one way to put it right, many animals. */
const byWhy = (gaps: Gap[]): { first: Gap; list: Gap[] }[] => {
  const groups = new Map<Gap["why"], { first: Gap; list: Gap[] }>();
  for (const gap of gaps) {
    const group = groups.get(gap.why);
    groups.set(gap.why, {
      first: group?.first ?? gap,
      list: [...(group?.list ?? []), gap],
    });
  }
  return [...groups.values()];
};

/**
 * The standing animals left out of a figure, whole: a line for each thing missing, its animals' tags beneath, and what
 * puts it right. Never weighed is put right on each animal's own page, so several of those have only their tags.
 */
export const Gaps = ({
  gaps,
  ventureId,
}: {
  gaps: Gap[];
  ventureId: string | null;
}) => {
  const { t } = useLanguage();
  if (gaps.length === 0) {
    return null;
  }
  return (
    <div className="border-warning/30 bg-warning/5 flex flex-col gap-2 rounded-md border p-3">
      <p className="text-sm font-medium">
        {t("returns.gapsTitle", { count: gaps.length })}
      </p>
      <ul className="divide-warning/20 flex flex-col divide-y">
        {byWhy(gaps).map(({ first, list }) => {
          // Never weighed is put right on her own page: with several, each tag is the way there.
          const eachOnHerPage = first.why === "no_weight" && list.length !== 1;
          return (
            <li
              className="flex flex-col gap-2 py-2 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              key={first.why}
            >
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="text-muted-foreground text-sm">
                  {t(`returns.gap.${first.why}`)}
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {list.map((gap) => (
                    <TagLink key={gap.tagNumber} tagNumber={gap.tagNumber} />
                  ))}
                </span>
              </div>
              {eachOnHerPage ? null : (
                <GapFix gap={first} ventureId={ventureId} />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};
