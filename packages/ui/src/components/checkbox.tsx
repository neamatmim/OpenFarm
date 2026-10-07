"use client";

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { cn } from "@OpenFarm/ui/lib/utils";
import { CheckIcon, MinusIcon } from "lucide-react";

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer border-input focus-visible:border-ring focus-visible:ring-ring aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary dark:bg-input/12 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground data-indeterminate:border-primary data-indeterminate:bg-primary data-indeterminate:text-primary-foreground dark:data-checked:bg-primary relative flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-1 max-md:after:-inset-3.5",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&:not([data-indeterminate])>svg:last-child]:hidden [&>svg]:size-3.5 data-indeterminate:[&>svg:first-child]:hidden"
      >
        {/* Some of a list ticked, not all: a dash, not a tick. */}
        <CheckIcon />
        <MinusIcon />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
