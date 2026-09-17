import { cn } from "@OpenFarm/ui/lib/utils";

import { useT } from "@/i18n/language-provider";

/** One word to narrow by: a toggle that says whether it is the one chosen. */
const Chip = ({
  chosen,
  label,
  onChoose,
}: {
  chosen: boolean;
  label: string;
  onChoose: () => void;
}) => (
  <button
    aria-pressed={chosen}
    className={cn(
      "focus-visible:ring-ring/50 inline-flex h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-3 md:h-8 md:px-3",
      chosen
        ? "border-primary bg-primary text-primary-foreground"
        : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
    )}
    onClick={onChoose}
    type="button"
  >
    {label}
  </button>
);

/**
 * The words the farm's own rounds have used lately, as a row of chips: whoever is reading
 * narrows what they see by the word somebody chose on the round, not by a category the
 * software invented.
 *
 * Shared by the Manager's sweep of what has been seen and the Vet's queue of what nobody has
 * answered — the same question, asked by two people with different jobs.
 */
export const SawFilter = ({
  chosen,
  kinds,
  onChoose,
}: {
  chosen: string;
  kinds: { saw: string; label: string }[];
  onChoose: (saw: string) => void;
}) => {
  const t = useT();
  return (
    <fieldset className="flex flex-wrap gap-2">
      <legend className="sr-only">{t("observations.col.saw")}</legend>
      <Chip
        chosen={chosen === ""}
        label={t("observations.all")}
        onChoose={() => onChoose("")}
      />
      {kinds.map((kind) => (
        <Chip
          chosen={chosen === kind.saw}
          key={kind.saw}
          label={kind.label}
          onChoose={() => onChoose(kind.saw)}
        />
      ))}
    </fieldset>
  );
};
