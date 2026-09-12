import { useT } from "@/i18n/language-provider";

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
    className={`rounded-md border px-3 py-1 text-sm ${chosen ? "bg-neutral-800 text-neutral-100" : ""}`}
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
    <div className="flex flex-wrap gap-2">
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
    </div>
  );
};
