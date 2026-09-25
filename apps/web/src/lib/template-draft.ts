import type {
  FactLine,
  Said,
  TemplateContent,
  TemplateSection,
  TemplateSectionKind,
} from "@OpenFarm/domain";

// A Template's wording as the editor holds it while the Owner changes it: the same parts, clauses and lines, each with
// a key of its own so a list keeps its boxes straight when one is moved or taken out. The keys are the editor's and
// never leave it — what is published is the wording alone.

/** A clause or a fact line with the editor's key on it. */
export type Keyed<T> = T & { key: string };

export type DraftSection =
  | Keyed<Extract<TemplateSection, { kind: "stamp" | "signatures" }>>
  | Keyed<
      Omit<Extract<TemplateSection, { kind: "parties" }>, "nomineeLines"> & {
        nomineeLines: Keyed<Said>[];
      }
    >
  | Keyed<
      Omit<Extract<TemplateSection, { kind: "facts" }>, "rows"> & {
        rows: Keyed<FactLine>[];
      }
    >
  | Keyed<
      Omit<Extract<TemplateSection, { kind: "clauses" }>, "clauses"> & {
        clauses: Keyed<Said>[];
      }
    >;

export interface TemplateDraft {
  title: Said;
  preamble: Said;
  sections: DraftSection[];
}

let made = 0;
/** A key no other part, clause or line in the editor has. */
export const freshKey = (): string => {
  made += 1;
  return `k${made}`;
};

const keyed = <T extends object>(value: T): Keyed<T> => ({
  ...value,
  key: freshKey(),
});

const draftSection = (section: TemplateSection): DraftSection => {
  switch (section.kind) {
    case "parties": {
      return keyed({
        ...section,
        nomineeLines: (section.nomineeLines ?? []).map(keyed),
      });
    }
    case "facts": {
      return keyed({ ...section, rows: section.rows.map(keyed) });
    }
    case "clauses": {
      return keyed({ ...section, clauses: section.clauses.map(keyed) });
    }
    default: {
      return keyed(section);
    }
  }
};

/** The wording, ready to edit. */
export const toDraft = (content: TemplateContent): TemplateDraft => ({
  title: content.title,
  preamble: content.preamble,
  sections: content.sections.map(draftSection),
});

const unkeyed = <T extends object>({ key: _key, ...rest }: Keyed<T>): T =>
  rest as unknown as T;

const plainSection = (section: DraftSection): TemplateSection => {
  switch (section.kind) {
    case "parties": {
      // A parties part with no lines under the nominee is published as one worded before there were any.
      const { key: _key, nomineeLines, ...rest } = section;
      return nomineeLines.length > 0
        ? { ...rest, nomineeLines: nomineeLines.map(unkeyed) }
        : rest;
    }
    case "facts": {
      const { key: _key, rows, ...rest } = section;
      return { ...rest, rows: rows.map(unkeyed) };
    }
    case "clauses": {
      const { key: _key, clauses, ...rest } = section;
      return { ...rest, clauses: clauses.map(unkeyed) };
    }
    default: {
      return unkeyed(section) as TemplateSection;
    }
  }
};

/** The wording as it is published: the editor's keys taken off. */
export const fromDraft = (draft: TemplateDraft): TemplateContent => ({
  title: draft.title,
  preamble: draft.preamble,
  sections: draft.sections.map(plainSection),
});

const EMPTY: Said = { bn: "", en: "" };

/** A new part of the given kind, with nothing yet written in it. */
export const newSection = (kind: TemplateSectionKind): DraftSection => {
  switch (kind) {
    case "parties": {
      return keyed({
        kind,
        heading: EMPTY,
        first: EMPTY,
        second: EMPTY,
        nomineeLines: [],
      });
    }
    case "facts": {
      return keyed({ kind, heading: EMPTY, rows: [], note: null });
    }
    case "clauses": {
      return keyed({ kind, heading: EMPTY, clauses: [keyed(EMPTY)] });
    }
    case "stamp": {
      return keyed({ kind, heading: EMPTY });
    }
    default: {
      return keyed({ kind: "signatures", heading: EMPTY, witnesses: 2 });
    }
  }
};

/** An empty clause, or an empty fact line, to add to a part. */
export const newClause = (): Keyed<Said> => keyed(EMPTY);
export const newFactLine = (): Keyed<FactLine> =>
  keyed({ label: EMPTY, value: "" });

/** A list with the item at `from` moved one place up or down; unchanged at either end. */
export const moved = <T>(list: readonly T[], from: number, by: -1 | 1): T[] => {
  const to = from + by;
  const item = list[from];
  if (item === undefined || to < 0 || to >= list.length) {
    return [...list];
  }
  const rest = list.filter((_, index) => index !== from);
  return [...rest.slice(0, to), item, ...rest.slice(to)];
};
