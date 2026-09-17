import { cn } from "@OpenFarm/ui/lib/utils";
import type { ReactNode } from "react";

/** A record read as facts: what each is, small and muted, and what it says beneath — two across on a phone, more where
 *  there is room. Nothing here is a form: a record that happened once reads as a record. */
export const FactGrid = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <dl
    className={cn(
      "grid grid-cols-2 gap-x-4 gap-y-4 text-sm sm:grid-cols-3",
      className
    )}
  >
    {children}
  </dl>
);

/** One fact of a record: what it is, and what it says. */
export const Fact = ({
  label,
  children,
  wide = false,
}: {
  label: ReactNode;
  children: ReactNode;
  /** A fact too long to share its row: an address, a lorry and its driver. */
  wide?: boolean;
}) => (
  <div className={cn("flex min-w-0 flex-col gap-0.5", wide && "col-span-2")}>
    <dt className="text-muted-foreground text-xs">{label}</dt>
    <dd className="font-medium break-words">{children}</dd>
  </div>
);
