import { Input as InputPrimitive } from "@base-ui/react/input";
import { numberAsTyped } from "@OpenFarm/i18n";
import { cn } from "@OpenFarm/ui/lib/utils";
import * as React from "react";

/**
 * A field. One asked for as `type="number"` is drawn as text with the number keypad, because a browser's number field
 * throws away digits it does not know: a Bangla keyboard's ১২.৫ arrives as nothing. What is typed is read back in the
 * digits a figure is stored in, so every figure on the farm can be typed in either.
 */
function Input({
  className,
  type,
  inputMode,
  onChange,
  ...props
}: React.ComponentProps<"input">) {
  const typesAFigure = type === "number";
  const readFigure = (event: React.ChangeEvent<HTMLInputElement>) => {
    const figure = numberAsTyped(event.target.value);
    if (figure !== event.target.value) {
      event.target.value = figure;
    }
    onChange?.(event);
  };
  return (
    <InputPrimitive
      inputMode={typesAFigure ? (inputMode ?? "decimal") : inputMode}
      onChange={typesAFigure ? readFigure : onChange}
      type={typesAFigure ? "text" : type}
      data-slot="input"
      className={cn(
        "border-input file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 disabled:bg-input/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 bg-card h-11 w-full min-w-0 rounded-md border px-3 py-1.5 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-1 md:h-9 md:text-sm",
        className
      )}
      {...props}
    />
  );
}

export { Input };
