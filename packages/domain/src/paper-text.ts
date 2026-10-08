import type { Language } from "@OpenFarm/i18n";
import { formatDigits } from "@OpenFarm/i18n";

import type { PaperDocument, PaperSection } from "./paper-template";
import type { Worded } from "./papers";
import { inLanguage } from "./papers";

/** What one part of a paper says, as lines of text in one language. */
const sectionLines = (
  section: PaperSection,
  say: (words: Worded) => string,
  language: Language
): string[] => {
  switch (section.kind) {
    case "parties": {
      return section.parties.flatMap((party) => [
        ...(say(party.role).trim() ? [say(party.role)] : []),
        ...party.rows.map((row) => `${say(row.label)}: ${say(row.value)}`),
        ...party.nominees.map((one) =>
          [
            one.name,
            one.relation ? say(one.relation) : null,
            one.born ? say(one.born) : null,
            one.idNumber,
            one.phone,
            say(one.share),
            one.receiver ? say(one.receiver) : null,
          ]
            .filter(Boolean)
            .join(" · ")
        ),
        ...party.lines.map(say),
      ]);
    }
    case "facts": {
      return [
        ...section.rows.map((row) => `${say(row.label)}: ${say(row.value)}`),
        ...(section.note ? [say(section.note)] : []),
      ];
    }
    case "clauses": {
      return section.clauses.map(
        (clause, index) =>
          `${formatDigits(index + 1, language)}. ${say(clause)}`
      );
    }
    case "table": {
      return [
        section.columns.map((column) => say(column.label)).join(" · "),
        ...section.rows.map((row) => row.map(say).join(" · ")),
        ...(section.foot ? [section.foot.map(say).join(" · ")] : []),
        ...(section.note ? [say(section.note)] : []),
      ];
    }
    case "stamp": {
      return section.blanks.map(
        (blank, at) =>
          `${say(blank)}: ${section.filled?.[at] ? say(section.filled[at]) : ""}`
      );
    }
    default: {
      return section.signers.map(
        (signer) => `${say(signer.role)}: ${signer.name}`
      );
    }
  }
};

/**
 * A paper as plain text in one language, part by part: what a screen reader, a search, or a test reads of it. The paper
 * itself is drawn from the document; this only says the same words in order.
 */
export const paperText = (
  document: PaperDocument,
  language: Language
): string => {
  const say = (words: Worded) => inLanguage(words, language);
  return [
    document.letterhead.name,
    ...document.letterhead.details.map(say),
    say(document.title),
    ...(document.copyOf ? [say(document.copyOf)] : []),
    say(document.preamble),
    ...document.sections.flatMap((section) => [
      say(section.heading),
      ...sectionLines(section, say, language),
    ]),
    ...document.closing.map(say),
    say(document.produced),
  ]
    .filter((one) => one.trim() !== "")
    .join("\n");
};
