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
  isPenNeed,
  nameAsCompared,
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
  const options = isPenNeed(need) ? pens : products;
  const none = isPenNeed(need)
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
  /** Adopted with the standard it is: the farm keeps which, so it is not offered again however it is renamed. */
  onAdopt: (content: SopContent, standardKey: PlaybookKey) => void;
}) => {
  const { t, language } = useLanguage();
  const [chosen, setChosen] = useState<StandardSopChoices>({});
  const choices = { ...suggested(products), ...chosen };
  // The names of the procedures in force, in either language and as the farm compares them — the farm refuses a
  // second procedure of a name already in force, so one is not offered. A retired one raises nothing, and is offered.
  const have = new Set(
    sops.flatMap((sop) => {
      const content = contentOf(sop);
      return content && !sop.retiredAt
        ? [content.name.bn, content.name.en ?? ""]
            .filter(Boolean)
            .map(nameAsCompared)
        : [];
    })
  );
  // Which standards a procedure in force was adopted from: had, whatever it has been renamed since. One adopted before
  // the farm kept which is known by its names, as it always was.
  const adopted = new Set(
    sops.flatMap((sop) =>
      sop.standardKey && !sop.retiredAt ? [sop.standardKey] : []
    )
  );
  const written = standardPlaybook(choices);
  const missing = (Object.keys(written) as PlaybookKey[]).filter((key) => {
    const { bn, en } = written[key].name;
    return !(
      adopted.has(key) ||
      [bn, en ?? ""]
        .filter(Boolean)
        .some((name) => have.has(nameAsCompared(name)))
    );
  });
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
                onClick={() => onAdopt(content, key)}
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
