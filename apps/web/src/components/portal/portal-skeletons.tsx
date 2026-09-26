import { Skeleton } from "@OpenFarm/ui/components/skeleton";
import { cn } from "@OpenFarm/ui/lib/utils";

/**
 * What each portal page looks like before the farm has answered: its own layout in grey, so the page does not jump
 * when the figures arrive and the reader can see what is coming rather than one grey block.
 */

/** A card with a heading and a few lines, as a Section draws one. */
const CardSkeleton = ({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) => (
  <div className={cn("surface flex flex-col gap-4 p-4 md:p-5", className)}>
    <Skeleton className="h-5 w-40" />
    <div className="flex flex-col gap-3">
      {Array.from({ length: lines }, (_, at) => (
        <Skeleton className="h-4 w-full" key={at} />
      ))}
    </div>
  </div>
);

/** A page's few figures: one small card on a phone, tiles where there is room — as `SummaryFigures` lays them. */
const FiguresSkeleton = ({ count }: { count: number }) => {
  const figures = Array.from({ length: count }, (_, at) => at);
  return (
    <>
      <div className="surface grid grid-cols-2 gap-x-4 gap-y-3 p-4 md:hidden">
        {figures.map((at) => (
          <div className="flex flex-col gap-1.5" key={at}>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-24" />
          </div>
        ))}
      </div>
      <div
        className={cn(
          "hidden grid-cols-2 gap-4 md:grid",
          count === 4 && "xl:grid-cols-4",
          count === 3 && "xl:grid-cols-3"
        )}
      >
        {figures.map((at) => (
          <Skeleton className="h-28 rounded-xl" key={at} />
        ))}
      </div>
    </>
  );
};

/** Their portfolio: the capital account, where it sits, and a card per Venture. */
export const HomeSkeleton = () => (
  <>
    <div className="surface grid gap-6 p-5 md:p-6 lg:grid-cols-2 lg:gap-8">
      <div className="flex flex-col justify-center gap-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-1.5 w-full max-w-sm" />
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-5">
        {[0, 1, 2, 3].map((at) => (
          <div className="flex flex-col gap-1.5" key={at}>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-24" />
          </div>
        ))}
      </div>
    </div>
    <CardSkeleton lines={2} />
    <div className="grid gap-3 md:grid-cols-2">
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="hidden h-40 rounded-xl md:block" />
    </div>
  </>
);

/** One Venture: its stages, four figures, the row of tabs, and a tab's card with the key dates beside it. */
export const VentureSkeleton = () => (
  <>
    <div className="flex flex-col gap-2">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-4 w-full max-w-md" />
    </div>
    <Skeleton className="h-9 w-full max-w-2xl rounded-lg" />
    <FiguresSkeleton count={4} />
    <Skeleton className="h-9 w-72 rounded-lg" />
    <div className="grid items-start gap-4 lg:grid-cols-3">
      <CardSkeleton className="lg:col-span-2" lines={5} />
      <CardSkeleton lines={4} />
    </div>
  </>
);

/** Their money: the totals, then the ledger. */
export const MoneySkeleton = () => (
  <>
    <FiguresSkeleton count={3} />
    <CardSkeleton lines={4} />
  </>
);

/** A page that is one card of lines: their papers, their account. */
export const ListSkeleton = ({ lines = 3 }: { lines?: number }) => (
  <CardSkeleton lines={lines} />
);

/** The Ventures offered to them, a card each. */
export const CardsSkeleton = () => (
  <div className="grid gap-3 md:grid-cols-2">
    <Skeleton className="h-44 rounded-xl" />
    <Skeleton className="hidden h-44 rounded-xl md:block" />
  </div>
);

/** An offered Venture: its name, then its words and terms with the Request to Join beside them where there is room. */
export const OfferSkeleton = () => (
  <>
    <div className="flex flex-col gap-2">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-4 w-full max-w-md" />
    </div>
    <div className="grid items-start gap-4 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <CardSkeleton lines={4} />
        <CardSkeleton lines={3} />
      </div>
      <CardSkeleton lines={3} />
    </div>
  </>
);
