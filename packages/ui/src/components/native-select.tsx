import { cn } from "@OpenFarm/ui/lib/utils";
import { ChevronDownIcon } from "lucide-react";
import type * as React from "react";

/**
 * The phone's own picker, drawn as the kit's input is: shadcn's native select (base-lyra), with the browser's arrow
 * taken off and the kit's chevron in its place, so a dropdown is as tall, as bordered and as focused as the field
 * beside it, in either theme. A phone still opens its own list, which a gloved thumb in a shed can work.
 *
 * The class given is the wrapper's — its width or its place in a grid — as in shadcn's.
 */
const NativeSelect = ({
  className,
  ...props
}: React.ComponentProps<"select">) => (
  <div
    className={cn(
      "group/native-select relative w-full has-[select:disabled]:opacity-50",
      className
    )}
    data-slot="native-select-wrapper"
  >
    <select
      className="border-input focus-visible:border-ring focus-visible:ring-ring aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/12 dark:hover:bg-input/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 bg-card h-11 w-full min-w-0 appearance-none truncate rounded-md border py-1.5 ps-3 pe-9 text-base transition-colors outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:cursor-not-allowed aria-invalid:ring-1 md:h-9 md:text-sm"
      data-slot="native-select"
      {...props}
    />
    <ChevronDownIcon
      aria-hidden
      className="text-muted-foreground pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2"
      data-slot="native-select-icon"
    />
  </div>
);

export { NativeSelect };
