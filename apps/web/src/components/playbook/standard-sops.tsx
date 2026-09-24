import type {
  PlaybookKey,
  SopContent,
  StandardSopChoices,
  StandardSopNeed,
} from "@OpenFarm/domain";
import {
  STANDARD_DRUGS,
  STANDARD_DRUG_FOR,
  STANDARD_SOP_NEEDS,
  standardPlaybook,
} from "@OpenFarm/domain";
import { Button } from "@OpenFarm/ui/components/button";
import { BookOpen } from "lucide-react";
import { useState } from "react";

import { Section } from "@/components/page";
import { FormField, NativeSelect } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";

import type { Sop } from "./playbook-types";
import { contentOf, whenWords } from "./playbook-types";

interface Pen {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
}

/** The product on the farm's Drug List with the standard's own name, offered first where there is one. */
const suggested = (products: Product[]): StandardSopChoices => {
  const choices: StandardSopChoices = {};
  for (const [need, drug] of Object.entries(STANDARD_DRUG_FOR)) {
    const found = products.find(
      (product) => product.name === STANDARD_DRUGS[drug].bn
    );
    if (found) {
      choices[need as StandardSopNeed] = found.id;
    }
  }
  return choices;
};

/** The farm's own Pen or product a standard procedure asks for, chosen from what the farm has. */
const NeedField = ({
  id,
  need,
  value,
  pens,
  products,
  onChange,
}: {
  id: string;
  need: StandardSopNeed;
  value: string;
  pens: Pen[];
  products: Product[];
  onChange: (value: string) => void;
}) => {
  const { t } = useLanguage();
  const options = need === "calvingPen" ? pens : products;
  const none =
    need === "calvingPen"
      ? t("sop.standard.noPens")
      : t("sop.standard.noProducts");
  return (
    <FormField
      hint={options.length === 0 ? none : undefined}
      id={id}
      label={t(`sop.standard.need.${need}`)}
    >
      <NativeSelect
        disabled={options.length === 0}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">{t("sop.standard.choose")}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </NativeSelect>
    </FormField>
  );
};

/**
 * The Standard Playbook's procedures the farm does not have yet, a card each, for the Owner to open in the editor
 * already written — naming first the farm's own Pen or product where one asks for it. Nothing here raises work: a
 * procedure is the farm's only once it is published.
 */
export const StandardSops = ({
  sops,
  pens,
  products,
  onAdopt,
}: {
  sops: Sop[];
  pens: Pen[];
  /** What a campaign may give: the Drug List's products whose withdrawal days are known. */
  products: Product[];
  onAdopt: (content: SopContent) => void;
}) => {
  const { t, language } = useLanguage();
  const [chosen, setChosen] = useState<StandardSopChoices>({});
  const choices = { ...suggested(products), ...chosen };
  const have = new Set(
    sops.flatMap((sop) => {
      const content = contentOf(sop);
      return content ? [content.name.bn] : [];
    })
  );
  const written = standardPlaybook(choices);
  const missing = (Object.keys(written) as PlaybookKey[]).filter(
    (key) => !have.has(written[key].name.bn)
  );
  if (missing.length === 0) {
    return null;
  }

  return (
    <Section
      description={t("sop.standard.hint")}
      id="standard-sops"
      title={t("sop.standard.title")}
    >
      <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {missing.map((key) => {
          const content = written[key];
          const need = STANDARD_SOP_NEEDS[key];
          const named = need ? Boolean(choices[need]) : true;
          return (
            <li
              className="bg-background flex min-w-0 flex-col gap-3 rounded-xl border p-4"
              key={key}
            >
              <div className="flex min-w-0 flex-col gap-1">
                <p className="font-semibold">{content.name.bn}</p>
                <p className="text-muted-foreground line-clamp-2 text-sm">
                  {content.purpose.bn}
                </p>
                <p className="text-muted-foreground text-xs tabular-nums">
                  {whenWords(content, t, language).join(" · ") ||
                    t("sop.byHand")}
                </p>
              </div>
              {need ? (
                <NeedField
                  id={`standard-${key}-need`}
                  need={need}
                  onChange={(value) =>
                    setChosen((now) => ({ ...now, [need]: value }))
                  }
                  pens={pens}
                  products={products}
                  value={choices[need] ?? ""}
                />
              ) : null}
              <Button
                className="self-start"
                disabled={!named}
                onClick={() => onAdopt(content)}
                type="button"
                variant="outline"
              >
                <BookOpen aria-hidden data-icon="inline-start" />
                {t("sop.standard.adopt")}
              </Button>
            </li>
          );
        })}
      </ul>
    </Section>
  );
};
