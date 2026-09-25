import type {
  DocumentRow,
  PaperDocument,
  PaperSection,
  Said,
} from "@OpenFarm/domain";
import { formatDigits } from "@OpenFarm/i18n";
import type { ReactNode } from "react";

/** The id a paper is found by to print it alone (lib/print-alone). */
export const PAPER_DOCUMENT_ID = "paper-document";

/** A section of the paper: its number in Bangla numerals, its Bangla name, and the English beside it. */
const Section = ({
  number,
  heading,
  children,
}: {
  number: number;
  heading: Said;
  children: ReactNode;
}) => (
  <section className="flex break-inside-avoid flex-col gap-3">
    <h3 className="border-foreground/80 flex items-baseline gap-2 border-b pb-1.5 text-sm font-semibold">
      <span>{formatDigits(number, "bn")}.</span>
      <span>{heading.bn}</span>
      {heading.en ? (
        <span className="text-muted-foreground text-xs font-normal">
          {heading.en}
        </span>
      ) : null}
    </h3>
    {children}
  </section>
);

/** A label in both languages, the English smaller beneath. */
const Label = ({ said }: { said: Said }) => (
  <span className="flex flex-col">
    <span>{said.bn}</span>
    {said.en ? (
      <span className="text-muted-foreground text-[0.75rem]">{said.en}</span>
    ) : null}
  </span>
);

/** A passage in Bangla, with the English beneath it where the wording has one. */
const Passage = ({ said }: { said: Said }) => (
  <>
    {said.bn}
    {said.en ? (
      <>
        <br />
        <span className="text-muted-foreground">{said.en}</span>
      </>
    ) : null}
  </>
);

/** Facts as the paper sets them: what each is, and what it says. */
const Rows = ({ rows }: { rows: DocumentRow[] }) => (
  <dl className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 gap-y-2 text-sm">
    {rows.map((row) => (
      <div
        className="contents"
        key={`${row.label.en || row.label.bn}|${row.value}`}
      >
        <dt className="text-muted-foreground">
          <Label said={row.label} />
        </dt>
        <dd className="font-medium break-words">{row.value}</dd>
      </div>
    ))}
  </dl>
);

/** A line to write on, with what goes on it beneath. */
const Blank = ({ said }: { said: Said }) => (
  <div className="flex flex-col gap-1">
    <div className="border-foreground/70 h-7 border-b" />
    <span className="text-muted-foreground text-xs">
      {said.bn}
      {said.en ? ` / ${said.en}` : ""}
    </span>
  </div>
);

/** Both languages of a label on one line, the English quieter. */
const Inline = ({ said }: { said: Said }) => (
  <>
    {said.bn}
    {said.en ? (
      <span className="text-muted-foreground font-normal"> · {said.en}</span>
    ) : null}
  </>
);

/** What goes under one section's heading, by the kind of section it is. */
const SectionBody = ({ section }: { section: PaperSection }) => {
  switch (section.kind) {
    case "parties": {
      return (
        <div className="grid gap-4 md:grid-cols-2 print:grid-cols-2">
          {section.parties.map((party, index) => (
            <div
              className="rounded-md border p-4"
              key={`${party.role.bn}-${party.rows[0]?.value ?? index}`}
            >
              <p className="mb-3 text-xs font-semibold">
                <Inline said={party.role} />
              </p>
              <Rows rows={party.rows} />
              {party.lines.length > 0 ? (
                <div className="mt-3 flex flex-col gap-2 border-t pt-3 text-xs">
                  {party.lines.map((line) => (
                    <p key={line.bn}>
                      <Passage said={line} />
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      );
    }
    case "facts": {
      return (
        <>
          <Rows rows={section.rows} />
          {section.note ? (
            <p className="bg-muted rounded-md px-3 py-2 text-sm">
              <Passage said={section.note} />
            </p>
          ) : null}
        </>
      );
    }
    case "clauses": {
      return (
        <ol className="flex list-[bengali] flex-col gap-2 pl-6 text-sm">
          {section.clauses.map((clause) => (
            <li className="pl-1" key={clause.bn}>
              <Passage said={clause} />
            </li>
          ))}
        </ol>
      );
    }
    case "stamp": {
      return (
        <div className="grid grid-cols-3 gap-4 rounded-md border border-dashed p-4">
          {section.blanks.map((blank) => (
            <Blank key={blank.en} said={blank} />
          ))}
        </div>
      );
    }
    default: {
      return (
        <>
          <div className="grid grid-cols-2 gap-8">
            {section.signers.map((signer) => (
              <div className="flex flex-col gap-1" key={signer.name}>
                <div className="h-14" />
                <div className="border-foreground border-t pt-1.5 text-sm">
                  <p className="font-medium">{signer.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {signer.role.bn}
                    {signer.role.en ? ` / ${signer.role.en}` : ""}
                  </p>
                </div>
                {section.dateBlank ? <Blank said={section.dateBlank} /> : null}
              </div>
            ))}
          </div>
          {section.witnesses.length > 0 ? (
            <div className="grid grid-cols-2 gap-8 pt-2">
              {section.witnesses.map((witness) => (
                <div className="flex flex-col gap-2" key={witness.en}>
                  <p className="text-xs font-semibold">
                    {witness.bn}
                    {witness.en ? ` / ${witness.en}` : ""}
                  </p>
                  {section.witnessBlanks.map((blank) => (
                    <Blank key={blank.en} said={blank} />
                  ))}
                </div>
              ))}
            </div>
          ) : null}
        </>
      );
    }
  }
};

/** The **Farm Identity** across the head of a paper: the farm's name, and its address, phone and registration beneath. */
export const Letterhead = ({
  letterhead,
}: {
  letterhead: PaperDocument["letterhead"];
}) => (
  <header className="border-foreground flex flex-col items-center gap-1 border-b-2 pb-4 text-center">
    <p className="text-lg font-semibold tracking-tight">{letterhead.name}</p>
    <p className="text-muted-foreground text-xs">
      {letterhead.details.join(" · ")}
    </p>
  </header>
);

/**
 * A paper an Investor signs, set as a document: the farm's letterhead, the title, the opening, each part numbered in
 * the order the wording puts them, and the closing lines. Everything it says comes from the farm's wording and its
 * facts, in both languages; this only lays it out, on screen and on A4.
 */
export const PaperDocumentView = ({
  document,
}: {
  document: PaperDocument;
}) => (
  <article
    className="bg-card text-card-foreground mx-auto flex w-full max-w-[210mm] flex-col gap-6 rounded-lg border p-6 md:p-10"
    id={PAPER_DOCUMENT_ID}
  >
    <Letterhead letterhead={document.letterhead} />

    <div className="flex flex-col items-center gap-1 text-center">
      <h2 className="text-2xl font-semibold tracking-tight">
        {document.title.bn}
      </h2>
      {document.title.en ? (
        <p className="text-muted-foreground text-xs tracking-[0.2em] uppercase">
          {document.title.en}
        </p>
      ) : null}
    </div>

    <p className="text-sm">
      <Passage said={document.preamble} />
    </p>

    {document.sections.map((section, index) => (
      <Section
        heading={section.heading}
        key={`${section.kind}-${section.heading.bn}`}
        number={index + 1}
      >
        <SectionBody section={section} />
      </Section>
    ))}

    <footer className="text-muted-foreground flex flex-col gap-0.5 border-t pt-3 text-xs">
      {document.closing.map((line) => (
        <p key={line}>{line}</p>
      ))}
      {document.produced.trim() === "·" ? null : (
        <p className="pt-1">{document.produced}</p>
      )}
    </footer>
  </article>
);
