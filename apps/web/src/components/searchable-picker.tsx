import { Input } from "@OpenFarm/ui/components/input";
import { Skeleton } from "@OpenFarm/ui/components/skeleton";
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

/** What every picker is told, however many it lets be chosen. */
interface PickerProps {
  /** The search box's id, which the field's label points at. */
  id: string;
  options: readonly PickerOption[];
  placeholder: string;
  /** What is said when there is nothing to choose at all — and why. */
  empty: ReactNode;
  /** Still being read: nothing to choose yet is not the same as nothing to choose. */
  loading?: boolean;
}

/**
 * Choosing from many — a bull out of two hundred, the animals a Vet saw — without typing them from memory: a box to
 * narrow the list by what is typed, and the list beneath, each with what tells it apart. Only what may be chosen is
 * offered, so a choice cannot be one the farm will refuse for being the wrong kind.
 *
 * Plain radio buttons or tick boxes underneath, so a keyboard and a screen reader work it as any other choice in a
 * form. What is chosen stays in sight, first, whatever is typed after: a choice that vanished from the list would
 * look like no choice at all.
 */
const Picker = ({
  id,
  options,
  placeholder,
  empty,
  loading = false,
  chosen,
  onToggle,
  many,
}: PickerProps & {
  chosen: ReadonlySet<string>;
  onToggle: (value: string) => void;
  many: boolean;
}) => {
  const t = useT();
  const [typed, setTyped] = useState("");
  if (loading) {
    return <Skeleton className="h-24 w-full rounded-md" />;
  }
  if (options.length === 0) {
    return <p className="text-muted-foreground text-sm">{empty}</p>;
  }
  const looking = typed.trim().toLowerCase();
  const matching = looking
    ? options.filter((one) =>
        `${one.label} ${one.detail ?? ""}`.toLowerCase().includes(looking)
      )
    : options;
  const kept = options.filter(
    (one) => chosen.has(one.value) && !matching.includes(one)
  );
  const shown = [...kept, ...matching];
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
        role={many ? "group" : "radiogroup"}
      >
        {shown.length === 0 ? (
          <p className="text-muted-foreground px-3 py-2 text-sm">
            {t("picker.noMatch")}
          </p>
        ) : (
          shown.map((one) => {
            const isChosen = chosen.has(one.value);
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
                  onChange={() => onToggle(one.value)}
                  type={many ? "checkbox" : "radio"}
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

/** One chosen out of many. */
export const SearchablePicker = ({
  value,
  onChange,
  ...rest
}: PickerProps & { value: string; onChange: (value: string) => void }) => (
  <Picker
    {...rest}
    chosen={new Set(value ? [value] : [])}
    many={false}
    onToggle={onChange}
  />
);

/** Several chosen out of many — the animals a Vet saw on one visit. Kept in the order they were ticked. */
export const SearchableMultiPicker = ({
  values,
  onChange,
  ...rest
}: PickerProps & {
  values: readonly string[];
  onChange: (values: string[]) => void;
}) => (
  <Picker
    {...rest}
    chosen={new Set(values)}
    many
    onToggle={(value) =>
      onChange(
        values.includes(value)
          ? values.filter((one) => one !== value)
          : [...values, value]
      )
    }
  />
);
