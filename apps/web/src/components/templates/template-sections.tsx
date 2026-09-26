import type { FactLine, Said } from "@OpenFarm/domain";
import { MOST_WITNESSES, RECEIVER_FIELDS } from "@OpenFarm/domain";
import { formatDigits } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Checkbox } from "@OpenFarm/ui/components/checkbox";
import { Input } from "@OpenFarm/ui/components/input";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import { FormField, NativeSelect } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import type { DraftSection, Keyed } from "@/lib/template-draft";
import { moved, newClause, newFactLine } from "@/lib/template-draft";

import { SaidField } from "./said-field";

/** Up, down and out: the three buttons beside anything in a list the Owner orders. */
const ListControls = ({
  label,
  first,
  last,
  onMove,
  onRemove,
}: {
  label: string;
  first: boolean;
  last: boolean;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) => {
  const { t } = useLanguage();
  return (
    <div className="flex shrink-0 gap-1">
      <Button
        aria-label={t("templates.moveUp", { what: label })}
        disabled={first}
        onClick={() => onMove(-1)}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <ArrowUp aria-hidden />
      </Button>
      <Button
        aria-label={t("templates.moveDown", { what: label })}
        disabled={last}
        onClick={() => onMove(1)}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <ArrowDown aria-hidden />
      </Button>
      <Button
        aria-label={t("templates.remove", { what: label })}
        onClick={onRemove}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <Trash2 aria-hidden />
      </Button>
    </div>
  );
};

/** Passages the Owner orders, each in Bangla with the English beside it: a part's clauses, or the lines under the
 *  nominee. */
const SaidList = ({
  items,
  onChange,
  nameOf,
  addLabel,
}: {
  items: Keyed<Said>[];
  onChange: (items: Keyed<Said>[]) => void;
  /** What the passage at a place is called, from its number as the reader writes it. */
  nameOf: (number: string) => string;
  addLabel: string;
}) => {
  const { language } = useLanguage();
  return (
    <>
      <ol className="flex flex-col gap-3">
        {items.map((item, index) => {
          const name = nameOf(formatDigits(index + 1, language));
          return (
            <li
              className="flex items-start gap-2 rounded-md border p-3"
              key={item.key}
            >
              <div className="min-w-0 flex-1">
                <SaidField
                  id={item.key}
                  label={name}
                  onChange={(said) =>
                    onChange(
                      items.map((current, at) =>
                        at === index ? { ...item, ...said } : current
                      )
                    )
                  }
                  passage
                  value={item}
                />
              </div>
              <ListControls
                first={index === 0}
                label={name}
                last={index === items.length - 1}
                onMove={(by) => onChange(moved(items, index, by))}
                onRemove={() => onChange(items.filter((_, at) => at !== index))}
              />
            </li>
          );
        })}
      </ol>
      <Button
        className="self-start"
        onClick={() => onChange([...items, newClause()])}
        size="sm"
        type="button"
        variant="outline"
      >
        <Plus aria-hidden data-icon="inline-start" />
        {addLabel}
      </Button>
    </>
  );
};

/** An optional line nobody has written: left so in both languages, it is not printed. */
const NOTHING_WRITTEN = { bn: "", en: "" };

/**
 * The two parties' names on the paper — who they are is written from what the farm holds — and the lines printed
 * under each Investor beside their Nominees: the ones under every Investor, the one for each minor's Receiver, and the
 * one in place of the table when there is no Nominee.
 */
const PartiesBody = ({
  section,
  onChange,
}: {
  section: Extract<DraftSection, { kind: "parties" }>;
  onChange: (section: DraftSection) => void;
}) => {
  const { t } = useLanguage();
  return (
    <>
      <SaidField
        id={`${section.key}-first`}
        label={t("templates.firstParty")}
        onChange={(first) => onChange({ ...section, first })}
        value={section.first}
      />
      <SaidField
        id={`${section.key}-second`}
        label={t("templates.secondParty")}
        onChange={(second) => onChange({ ...section, second })}
        value={section.second}
      />
      <p className="text-muted-foreground text-xs">
        {t("templates.partiesHint")}
      </p>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-medium">{t("templates.nomineeLines")}</h3>
          <p className="text-muted-foreground text-xs">
            {t("templates.nomineeLinesHint")}
          </p>
        </div>
        <SaidList
          addLabel={t("templates.addLine")}
          items={section.nomineeLines}
          nameOf={(number) => t("templates.lineNumber", { number })}
          onChange={(nomineeLines) => onChange({ ...section, nomineeLines })}
        />
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-medium">{t("templates.receiverLine")}</h3>
          <p className="text-muted-foreground text-xs">
            {t("templates.receiverLineHint", {
              fields: Object.keys(RECEIVER_FIELDS)
                .map((name) => `{${name}}`)
                .join(" "),
            })}
          </p>
        </div>
        <SaidField
          id={`${section.key}-receiver`}
          label={t("templates.receiverLine")}
          onChange={(receiverLine) => onChange({ ...section, receiverLine })}
          passage
          value={section.receiverLine ?? NOTHING_WRITTEN}
        />
        <SaidField
          id={`${section.key}-no-nominee`}
          label={t("templates.noNomineeLine")}
          onChange={(noNomineeLine) => onChange({ ...section, noNomineeLine })}
          passage
          value={section.noNomineeLine ?? NOTHING_WRITTEN}
        />
        <p className="text-muted-foreground text-xs">
          {t("templates.noNomineeLineHint")}
        </p>
      </div>
    </>
  );
};

/** One line of the paper's facts: what it is called, and what it says with fields in braces. */
const FactLineFields = ({
  line,
  onChange,
}: {
  line: Keyed<FactLine>;
  onChange: (line: Keyed<FactLine>) => void;
}) => {
  const { t } = useLanguage();
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <SaidField
        id={`${line.key}-label`}
        label={t("templates.factLabel")}
        onChange={(label) => onChange({ ...line, label })}
        value={line.label}
      />
      <FormField id={`${line.key}-value`} label={t("templates.factValue")}>
        <Input
          id={`${line.key}-value`}
          lang="bn"
          onChange={(event) => onChange({ ...line, value: event.target.value })}
          value={line.value}
        />
      </FormField>
    </div>
  );
};

/** The paper's facts, line by line, and a note under them where the paper wants one. */
const FactsBody = ({
  section,
  onChange,
}: {
  section: Extract<DraftSection, { kind: "facts" }>;
  onChange: (section: DraftSection) => void;
}) => {
  const { t, language } = useLanguage();
  const lineAt = (index: number, line: Keyed<FactLine>) =>
    onChange({
      ...section,
      rows: section.rows.map((current, at) => (at === index ? line : current)),
    });
  const noteId = `${section.key}-has-note`;
  return (
    <>
      <ol className="flex flex-col gap-3">
        {section.rows.map((line, index) => (
          <li
            className="flex items-start gap-2 rounded-md border p-3"
            key={line.key}
          >
            <FactLineFields
              line={line}
              onChange={(next) => lineAt(index, next)}
            />
            <ListControls
              first={index === 0}
              label={t("templates.lineNumber", {
                number: formatDigits(index + 1, language),
              })}
              last={index === section.rows.length - 1}
              onMove={(by) =>
                onChange({ ...section, rows: moved(section.rows, index, by) })
              }
              onRemove={() =>
                onChange({
                  ...section,
                  rows: section.rows.filter((_, at) => at !== index),
                })
              }
            />
          </li>
        ))}
      </ol>
      <Button
        className="self-start"
        onClick={() =>
          onChange({ ...section, rows: [...section.rows, newFactLine()] })
        }
        size="sm"
        type="button"
        variant="outline"
      >
        <Plus aria-hidden data-icon="inline-start" />
        {t("templates.addLine")}
      </Button>
      <div className="flex items-center gap-2">
        <Checkbox
          checked={section.note !== null}
          id={noteId}
          onCheckedChange={(checked) =>
            onChange({
              ...section,
              note: checked === true ? { bn: "", en: "" } : null,
            })
          }
        />
        <label className="text-sm" htmlFor={noteId}>
          {t("templates.withNote")}
        </label>
      </div>
      {section.note ? (
        <SaidField
          id={`${section.key}-note`}
          label={t("templates.note")}
          onChange={(note) => onChange({ ...section, note })}
          passage
          value={section.note}
        />
      ) : null}
    </>
  );
};

/** The numbered clauses, each in Bangla with the English beside it. */
const ClausesBody = ({
  section,
  onChange,
}: {
  section: Extract<DraftSection, { kind: "clauses" }>;
  onChange: (section: DraftSection) => void;
}) => {
  const { t } = useLanguage();
  return (
    <SaidList
      addLabel={t("templates.addClause")}
      items={section.clauses}
      nameOf={(number) => t("templates.clauseNumber", { number })}
      onChange={(clauses) => onChange({ ...section, clauses })}
    />
  );
};

/** How many witnesses sign; who the parties are and where they sign is the farm's. */
const SignaturesBody = ({
  section,
  onChange,
}: {
  section: Extract<DraftSection, { kind: "signatures" }>;
  onChange: (section: DraftSection) => void;
}) => {
  const { t, language } = useLanguage();
  const id = `${section.key}-witnesses`;
  return (
    <FormField
      className="sm:max-w-56"
      hint={t("templates.signaturesHint")}
      id={id}
      label={t("templates.witnesses")}
    >
      <NativeSelect
        id={id}
        onChange={(event) =>
          onChange({ ...section, witnesses: Number(event.target.value) })
        }
        value={String(section.witnesses)}
      >
        {Array.from({ length: MOST_WITNESSES + 1 }, (_, count) => (
          <option key={count} value={String(count)}>
            {formatDigits(count, language)}
          </option>
        ))}
      </NativeSelect>
    </FormField>
  );
};

/** What is written under a part's heading, by the kind of part it is. */
const SectionBody = ({
  section,
  onChange,
}: {
  section: DraftSection;
  onChange: (section: DraftSection) => void;
}) => {
  const { t } = useLanguage();
  switch (section.kind) {
    case "parties": {
      return <PartiesBody onChange={onChange} section={section} />;
    }
    case "facts": {
      return <FactsBody onChange={onChange} section={section} />;
    }
    case "clauses": {
      return <ClausesBody onChange={onChange} section={section} />;
    }
    case "stamp": {
      return (
        <p className="text-muted-foreground text-xs">
          {t("templates.stampHint")}
        </p>
      );
    }
    default: {
      return <SignaturesBody onChange={onChange} section={section} />;
    }
  }
};

/**
 * One part of the paper in the editor: its number and kind, the buttons that move it or take it out, its heading in
 * both languages, and what is written under it.
 */
export const SectionEditor = ({
  section,
  number,
  first,
  last,
  problems,
  onChange,
  onMove,
  onRemove,
}: {
  section: DraftSection;
  number: number;
  first: boolean;
  last: boolean;
  problems: ReactNode;
  onChange: (section: DraftSection) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) => {
  const { t, language } = useLanguage();
  const name = t(`templates.part.${section.kind}`);
  return (
    <section
      aria-labelledby={`${section.key}-title`}
      className="bg-card flex flex-col gap-4 rounded-xl border p-4 md:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-base font-semibold" id={`${section.key}-title`}>
            {t("templates.partNumber", {
              number: formatDigits(number, language),
              part: name,
            })}
          </h2>
          <p className="text-muted-foreground text-xs">
            {t(`templates.partHint.${section.kind}`)}
          </p>
        </div>
        <ListControls
          first={first}
          label={name}
          last={last}
          onMove={onMove}
          onRemove={onRemove}
        />
      </div>
      {problems}
      <SaidField
        id={`${section.key}-heading`}
        label={t("templates.heading")}
        onChange={(heading) => onChange({ ...section, heading })}
        value={section.heading}
      />
      <SectionBody onChange={onChange} section={section} />
    </section>
  );
};
