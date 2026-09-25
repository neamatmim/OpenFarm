import type { TemplateContent } from "@OpenFarm/domain";
import { MOST_WITNESSES, TEMPLATE_KINDS } from "@OpenFarm/domain";
import { z } from "zod";

// The wire's check on a Template's wording, before the domain's own rules say whether it may be published. Shape only:
// which fields a kind of paper may use, and what must not be empty, are the domain's to say.

/** The longest any one piece of wording may be: a clause is a paragraph, not a chapter. */
const LONGEST = 2000;
/** The most clauses, and fact lines, one part may hold. */
const MOST_LINES = 40;
/** The most parts a paper may have. */
const MOST_PARTS = 12;

const said = z.object({
  bn: z.string().max(LONGEST),
  en: z.string().max(LONGEST),
});

const section = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("parties"),
    heading: said,
    first: said,
    second: said,
    nomineeLines: z.array(said).max(MOST_LINES).optional(),
  }),
  z.object({
    kind: z.literal("facts"),
    heading: said,
    rows: z
      .array(z.object({ label: said, value: z.string().max(LONGEST) }))
      .max(MOST_LINES),
    note: said.nullable(),
  }),
  z.object({
    kind: z.literal("clauses"),
    heading: said,
    clauses: z.array(said).max(MOST_LINES),
  }),
  z.object({ kind: z.literal("stamp"), heading: said }),
  z.object({
    kind: z.literal("signatures"),
    heading: said,
    witnesses: z.number().int().min(0).max(MOST_WITNESSES),
  }),
]);

export const templateContentSchema: z.ZodType<TemplateContent> = z.object({
  title: said,
  preamble: said,
  sections: z.array(section).min(1).max(MOST_PARTS),
});

export const templateKindSchema = z.enum(TEMPLATE_KINDS);
