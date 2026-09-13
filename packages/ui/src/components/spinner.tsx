import { cn } from "@OpenFarm/ui/lib/utils";
import { Loader2Icon } from "lucide-react";

/** A turning mark beside a word that already says what is happening — decorative, so it is hidden from screen readers. */
const Spinner = ({ className, ...props }: React.ComponentProps<"svg">) => (
  <Loader2Icon
    aria-hidden
    className={cn("size-4 animate-spin", className)}
    data-slot="spinner"
    {...props}
  />
);

export { Spinner };
