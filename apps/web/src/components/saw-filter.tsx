import { Chip } from "@/components/page";
import { useT } from "@/i18n/language-provider";

/**
 * The words the farm's own rounds have used lately, as a row of chips: the Vet narrows the queue of what nobody has
 * answered by the word somebody chose on the round, not by a category the software invented. The Manager's sweep of
 * what has been seen asks the same with a dropdown, as the filters over a desk's table do.
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
