import { cn } from "@OpenFarm/ui/lib/utils";

const PERCENT = 100;

/** A share of a whole as a width, never past the end of the bar however far past it the money went. */
const widthOf = (part: number, whole: number) =>
  `${Math.min(PERCENT, Math.max(0, whole > 0 ? (part / whole) * PERCENT : 0))}%`;

/**
 * What has come in against the target, with the Floor marked, because that is the line the button to start buying
 * waits on. Drawn for the eye only: whatever sits beside it says the same in words.
 */
export const RaisingBar = ({
  inBdt,
  floorBdt,
  targetBdt,
  className,
}: {
  inBdt: number;
  floorBdt: number;
  targetBdt: number;
  className?: string;
}) => {
  // Lighter until the Floor is reached, since until then buying cannot start.
  const pastTheFloor = inBdt >= floorBdt;
  return (
    <div
      aria-hidden
      className={cn(
        "bg-muted relative h-3 overflow-hidden rounded-full",
        className
      )}
    >
      <div
        className={cn(
          "h-full rounded-full",
          pastTheFloor ? "bg-primary" : "bg-primary/60"
        )}
        style={{ width: widthOf(inBdt, targetBdt) }}
      />
      <div
        className="bg-foreground/70 absolute inset-y-0 w-0.5"
        style={{ left: widthOf(floorBdt, targetBdt) }}
      />
    </div>
  );
};
