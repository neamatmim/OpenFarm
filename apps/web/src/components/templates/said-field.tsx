import type { Said } from "@OpenFarm/domain";
import { Input } from "@OpenFarm/ui/components/input";
import { Textarea } from "@OpenFarm/ui/components/textarea";
import type { ReactNode } from "react";

import { FormField } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";

/**
 * One piece of a paper's wording in both of its languages: the Bangla, which is the paper, and the English beside it,
 * which may be left empty. A passage takes a box that grows with it; a heading or a label takes a line.
 */
export const SaidField = ({
  id,
  label,
  value,
  onChange,
  passage = false,
}: {
  id: string;
  label: ReactNode;
  value: Said;
  onChange: (value: Said) => void;
  passage?: boolean;
}) => {
  const { t } = useLanguage();
  const Box = passage ? Textarea : Input;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FormField id={`${id}-bn`} label={label}>
        <Box
          id={`${id}-bn`}
          lang="bn"
          onChange={(event) => onChange({ ...value, bn: event.target.value })}
          value={value.bn}
        />
      </FormField>
      <FormField
        id={`${id}-en`}
        label={
          <span className="text-muted-foreground font-normal">
            {t("templates.english")}
          </span>
        }
      >
        <Box
          id={`${id}-en`}
          lang="en"
          onChange={(event) => onChange({ ...value, en: event.target.value })}
          value={value.en}
        />
      </FormField>
    </div>
  );
};
