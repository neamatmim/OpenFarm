import type {
  TemplateKind,
  TemplateProblem,
  TemplateSectionKind,
} from "@OpenFarm/domain";
import {
  FIELDS_OF,
  STANDARD_TEMPLATES,
  TEMPLATE_FIELDS,
  partsAllowed,
  templateProblems,
} from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatDigits } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { ArrowLeft, Copy, Eye, Plus, RotateCcw, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Notice, Page, PageHeader, Section } from "@/components/page";
import { FormField, NativeSelect } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import type { TemplateDraft } from "@/lib/template-draft";
import { fromDraft, moved, newSection, toDraft } from "@/lib/template-draft";

import { SaidField } from "./said-field";
import { SectionEditor } from "./template-sections";

/** The parts a paper may have, in the order the add-a-part list offers them. */
const PART_KINDS: readonly TemplateSectionKind[] = [
  "parties",
  "facts",
  "clauses",
  "stamp",
  "signatures",
];

/** What each problem says, by its code. */
const PROBLEM_WORDS: Record<TemplateProblem["code"], MessageKey> = {
  title_missing: "templates.problem.titleMissing",
  text_missing: "templates.problem.textMissing",
  unknown_field: "templates.problem.unknownField",
  no_clauses: "templates.problem.noClauses",
  part_twice: "templates.problem.partTwice",
  part_missing: "templates.problem.partMissing",
  part_not_here: "templates.problem.partNotHere",
  witnesses: "templates.problem.witnesses",
};

/** A problem in the reader's words: where it is, and what is wrong there. */
const useProblemWords = () => {
  const { t, language } = useLanguage();
  const where = (at: TemplateProblem["at"]) => {
    if (at === "title") {
      return t("templates.titleField");
    }
    if (at === "preamble") {
      return t("templates.preamble");
    }
    return t("templates.partAt", { number: formatDigits(at, language) });
  };
  const partName = (about: string | undefined) =>
    about && (PART_KINDS as readonly string[]).includes(about)
      ? t(`templates.part.${about as TemplateSectionKind}`)
      : "";
  return (problem: TemplateProblem) =>
    t(PROBLEM_WORDS[problem.code], {
      where: where(problem.at),
      field: `{${problem.about ?? ""}}`,
      part: partName(problem.about),
    });
};

/** The facts this kind of paper can say, each by its braces and its name; a tap copies it to paste in. */
const FieldPalette = ({ kind }: { kind: TemplateKind }) => {
  const { t, language } = useLanguage();
  const copy = async (field: string) => {
    try {
      await navigator.clipboard.writeText(`{${field}}`);
      toast.success(t("templates.fieldCopied", { field: `{${field}}` }));
    } catch {
      toast.error(t("templates.fieldNotCopied", { field: `{${field}}` }));
    }
  };
  return (
    <Section
      description={t("templates.fieldsHint")}
      id="template-fields"
      title={t("templates.fields")}
    >
      <ul className="flex flex-wrap gap-2">
        {FIELDS_OF[kind].map((field) => (
          <li key={field}>
            <Button
              onClick={() => {
                void copy(field);
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              <Copy aria-hidden data-icon="inline-start" />
              <span className="font-mono text-xs">{`{${field}}`}</span>
              <span className="text-muted-foreground text-xs">
                {TEMPLATE_FIELDS[field][language]}
              </span>
            </Button>
          </li>
        ))}
      </ul>
    </Section>
  );
};

/** The problems that stop this wording being published, each where it is. */
const ProblemsNotice = ({ problems }: { problems: TemplateProblem[] }) => {
  const { t } = useLanguage();
  const said = useProblemWords();
  if (problems.length === 0) {
    return null;
  }
  const lines = [...new Set(problems.map(said))];
  return (
    <Notice title={t("templates.cannotPublish")} tone="warning">
      <ul className="list-disc pl-5">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </Notice>
  );
};

/** Adds a part of the chosen kind at the end of the paper: only the parts this kind of paper may have. */
const AddPart = ({
  paper,
  onAdd,
}: {
  paper: TemplateKind;
  onAdd: (kind: TemplateSectionKind) => void;
}) => {
  const { t } = useLanguage();
  const [kind, setKind] = useState<TemplateSectionKind>("clauses");
  const offered = partsAllowed(paper, PART_KINDS);
  return (
    <div className="flex flex-wrap items-end gap-2">
      <FormField id="template-add-part" label={t("templates.addPart")}>
        <NativeSelect
          id="template-add-part"
          onChange={(event) =>
            setKind(event.target.value as TemplateSectionKind)
          }
          value={kind}
        >
          {offered.map((one) => (
            <option key={one} value={one}>
              {t(`templates.part.${one}`)}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <Button onClick={() => onAdd(kind)} type="button" variant="outline">
        <Plus aria-hidden data-icon="inline-start" />
        {t("templates.add")}
      </Button>
    </div>
  );
};

/**
 * Changing one kind of paper's wording, as a page of its own: its title and opening, each part in order, and the
 * facts it can say. Publishing makes it the next Version, which papers are printed and signed in from then; nothing
 * goes while anything in it would print wrong, and what would is listed above the act. A preview shows the paper
 * with each fact named where it will go.
 */
export const TemplateEditor = ({
  kind,
  initial,
  pending,
  onPublish,
  onPreview,
  onCancel,
}: {
  kind: TemplateKind;
  initial: TemplateDraft;
  pending: boolean;
  onPublish: (draft: TemplateDraft, note: string) => void;
  onPreview: (draft: TemplateDraft) => void;
  onCancel: () => void;
}) => {
  const { t } = useLanguage();
  const [draft, setDraft] = useState(initial);
  const [note, setNote] = useState("");
  const problems = templateProblems(kind, fromDraft(draft));
  const said = useProblemWords();
  const problemsAt = (number: number) => {
    const here = problems.filter((problem) => problem.at === number);
    return here.length > 0 ? (
      <ul className="text-warning list-disc pl-5 text-sm">
        {[...new Set(here.map(said))].map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    ) : null;
  };
  const setSections = (sections: TemplateDraft["sections"]) =>
    setDraft({ ...draft, sections });
  return (
    <Page>
      <PageHeader
        actions={
          <>
            <Button
              onClick={() => setDraft(toDraft(STANDARD_TEMPLATES[kind]))}
              type="button"
              variant="outline"
            >
              <RotateCcw aria-hidden data-icon="inline-start" />
              {t("templates.startFromStandard")}
            </Button>
            <Button onClick={onCancel} type="button" variant="ghost">
              <ArrowLeft aria-hidden data-icon="inline-start" />
              {t("templates.back")}
            </Button>
          </>
        }
        description={t("templates.editorHint")}
        eyebrow={t("templates.pageTitle")}
        title={t(`templates.kind.${kind}`)}
      />
      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (problems.length === 0) {
            onPublish(draft, note.trim());
          }
        }}
      >
        <Section
          description={t("templates.openingHint")}
          id="template-opening"
          title={t("templates.opening")}
        >
          <SaidField
            id="template-title"
            label={t("templates.titleField")}
            onChange={(title) => setDraft({ ...draft, title })}
            value={draft.title}
          />
          <SaidField
            id="template-preamble"
            label={t("templates.preamble")}
            onChange={(preamble) => setDraft({ ...draft, preamble })}
            passage
            value={draft.preamble}
          />
        </Section>

        <FieldPalette kind={kind} />

        {draft.sections.map((section, index) => (
          <SectionEditor
            first={index === 0}
            key={section.key}
            last={index === draft.sections.length - 1}
            number={index + 1}
            onChange={(next) =>
              setSections(
                draft.sections.map((current, at) =>
                  at === index ? next : current
                )
              )
            }
            onMove={(by) => setSections(moved(draft.sections, index, by))}
            onRemove={() =>
              setSections(draft.sections.filter((_, at) => at !== index))
            }
            problems={problemsAt(index + 1)}
            section={section}
          />
        ))}

        <AddPart
          onAdd={(part) => setSections([...draft.sections, newSection(part)])}
          paper={kind}
        />

        <ProblemsNotice problems={problems} />

        <div className="bg-card flex flex-col gap-4 rounded-xl border p-4 md:p-5">
          <FormField
            hint={t("templates.noteHint")}
            id="template-note"
            label={t("templates.note")}
          >
            <Input
              id="template-note"
              onChange={(event) => setNote(event.target.value)}
              value={note}
            />
          </FormField>
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={onCancel} type="button" variant="outline">
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => onPreview(draft)}
              type="button"
              variant="outline"
            >
              <Eye aria-hidden data-icon="inline-start" />
              {t("templates.preview")}
            </Button>
            <Button disabled={problems.length > 0 || pending} type="submit">
              {pending ? <Spinner /> : null}
              <Send aria-hidden data-icon="inline-start" />
              {t("templates.publish")}
            </Button>
          </div>
        </div>
      </form>
    </Page>
  );
};
