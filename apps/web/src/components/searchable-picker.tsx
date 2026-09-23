import { Input } from "@OpenFarm/ui/components/input";
import { cn } from "@OpenFarm/ui/lib/utils";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { useT } from "@/i18n/language-provider";

/** One thing to choose: what is chosen, what the reader knows it by, and what tells two alike apart. */
export interface PickerOption {
  value: string;
  label: string;
  detail?: string;
}

/**
 * Choosing one of many — a bull out of two hundred — without typing it from memory: a box to narrow the list by
 * what is typed, and the list beneath, each with what tells it apart. Only what may be chosen is offered, so a
 * choice cannot be one the farm will refuse for being the wrong kind.
 *
 * Plain radio buttons underneath, so a keyboard and a screen reader work it as any other choice in a form.
 */
export const SearchablePicker = ({
  id,
  options,
  value,
  onChange,
  placeholder,
  empty,
}: {
  /** The search box's id, which the field's label points at. */
  id: string;
  options: readonly PickerOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** What is said when there is nothing to choose at all — and why. */
  empty: ReactNode;
}) => {
  const t = useT();
  const [typed, setTyped] = useState("");
  if (options.length === 0) {
    return <p className="text-muted-foreground text-sm">{empty}</p>;
  }
  const looking = typed.trim().toLowerCase();
  const matching = looking
    ? options.filter((one) =>
        `${one.label} ${one.detail ?? ""}`.toLowerCase().includes(looking)
      )
    : options;
  // What is chosen stays in sight, first, whatever is typed after: a choice that vanished from the list would look
  // like no choice at all.
  const chosen = options.find((one) => one.value === value);
  const shown =
    chosen && !matching.includes(chosen) ? [chosen, ...matching] : matching;
  return (
    <div className="flex flex-col gap-2">
      <Input
        autoComplete="off"
        id={id}
        onChange={(event) => setTyped(event.target.value)}
        placeholder={placeholder}
        type="search"
        value={typed}
      />
      <div
        aria-labelledby={id}
        className="max-h-60 overflow-y-auto rounded-md border"
        role="radiogroup"
      >
        {shown.length === 0 ? (
          <p className="text-muted-foreground px-3 py-2 text-sm">
            {t("picker.noMatch")}
          </p>
        ) : (
          shown.map((one) => {
            const isChosen = one.value === value;
            return (
              <label
                className={cn(
                  "hover:bg-muted/60 has-[:focus-visible]:ring-ring flex cursor-pointer items-center gap-3 border-b px-3 py-2 ring-inset last:border-b-0 has-[:focus-visible]:ring-2",
                  isChosen && "bg-primary/10"
                )}
                key={one.value}
              >
                <input
                  checked={isChosen}
                  className="sr-only"
                  name={`${id}-choice`}
                  onChange={() => onChange(one.value)}
                  type="radio"
                  value={one.value}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-mono text-sm font-medium">
                    {one.label}
                  </span>
                  {one.detail ? (
                    <span className="text-muted-foreground truncate text-xs">
                      {one.detail}
                    </span>
                  ) : null}
                </span>
                {isChosen ? (
                  <Check aria-hidden className="text-primary size-4" />
                ) : null}
              </label>
            );
          })
        )}
      </div>
    </div>
  );
};
