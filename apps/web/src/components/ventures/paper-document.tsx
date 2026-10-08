import type {
  DocumentRow,
  NomineeRow,
  PaperDocument,
  PaperSection,
  Said,
  Worded,
} from "@OpenFarm/domain";
import { NOMINEE_HEADINGS, inLanguage } from "@OpenFarm/domain";
import type { Language } from "@OpenFarm/i18n";
import { formatDigits } from "@OpenFarm/i18n";
import type { ReactNode } from "react";
import { Fragment, createContext, useContext } from "react";

/** The id a paper is found by to print it alone (lib/print-alone). */
export const PAPER_DOCUMENT_ID = "paper-document";

/** The language the paper on screen is read in: one at a time, as its reader chose (ADR 0021). */
const PaperLanguage = createContext<Language>("bn");

/** Words as the paper being read writes them. */
const useSay = () => {
  const language = useContext(PaperLanguage);
  return (words: Worded) => inLanguage(words, language);
};

/** A number in the paper's own numerals. */
const useNumeral = () => {
  const language = useContext(PaperLanguage);
  return (number: number) => formatDigits(number, language);
};

/** A section of the paper: its number and its name, over a rule. */
const Section = ({
  number,
  heading,
  children,
}: {
  number: number;
  heading: Said;
  children: ReactNode;
}) => {
  const say = useSay();
  const numeral = useNumeral();
  return (
    <section className="flex break-inside-avoid flex-col gap-3">
      <h3 className="border-foreground/20 flex items-baseline gap-2 border-b pb-1.5 text-base font-semibold">
        <span className="text-muted-foreground tabular-nums">
          {numeral(number)}.
        </span>
        <span>{say(heading)}</span>
      </h3>
      {children}
    </section>
  );
};

/** Facts as the paper sets them: what each is, and what it says. */
const Rows = ({ rows }: { rows: DocumentRow[] }) => {
  const say = useSay();
  return (
    <dl className="grid grid-cols-[minmax(7rem,max-content)_1fr] gap-x-6 gap-y-1.5 text-sm">
      {rows.map((row) => (
        <div
          className="contents"
          key={`${row.label.en || row.label.bn}|${say(row.value)}`}
        >
          <dt className="text-muted-foreground">{say(row.label)}</dt>
          <dd className="font-medium break-words">{say(row.value)}</dd>
        </div>
      ))}
    </dl>
  );
};

/** A line to write on, with what goes on it beneath. */
const Blank = ({ said, value }: { said: Said; value?: Worded }) => {
  const say = useSay();
  return (
    <div className="flex flex-col gap-1">
      {/* What was written on it, where the paper is a copy of one already filled in. */}
      <div className="border-foreground/70 flex h-7 items-end border-b pb-0.5 text-sm font-medium">
        {value === undefined ? null : say(value)}
      </div>
      <span className="text-muted-foreground text-xs">{say(said)}</span>
    </div>
  );
};

/** The lines printed under a party, below what the farm writes of it — an Investor's nominee lines; nothing where
 *  there are none. */
const PartyLines = ({ lines }: { lines: Said[] }) => {
  const say = useSay();
  const noLines = lines.length === 0;
  if (noLines) {
    return null;
  }
  return (
    <div className="mt-4 flex flex-col gap-2 border-t pt-3 text-sm">
      {lines.map((line) => (
        <p key={line.bn}>{say(line)}</p>
      ))}
    </div>
  );
};

/** An Investor's Nominees as the paper prints them: one row each, a minor marked, and who collects for a minor on the
 *  row beneath. The farm's facts, printed whatever the wording's Version; nothing where there are none. */
const NomineeTable = ({ nominees }: { nominees: NomineeRow[] }) => {
  const say = useSay();
  const noNominees = nominees.length === 0;
  if (noNominees) {
    return null;
  }
  const head = NOMINEE_HEADINGS;
  const heading = "px-2 py-1.5 font-medium";
  const cell = "px-2 py-1.5 align-top";
  return (
    <div className="mt-4 overflow-x-auto rounded-md border">
      <table className="w-full border-collapse text-left text-xs">
        <thead className="bg-muted/60 text-muted-foreground">
          <tr>
            <th className={heading}>{say(head.name)}</th>
            <th className={heading}>{say(head.relation)}</th>
            <th className={heading}>{say(head.born)}</th>
            <th className={heading}>{say(head.idNumber)}</th>
            <th className={heading}>{say(head.phone)}</th>
            <th className={`${heading} text-right`}>{say(head.share)}</th>
          </tr>
        </thead>
        <tbody>
          {nominees.map((one) => (
            <Fragment key={`${one.name}-${say(one.share)}`}>
              <tr className="border-t">
                <td className={`${cell} font-medium`}>{one.name}</td>
                <td className={cell}>
                  {one.relation ? say(one.relation) : "—"}
                </td>
                <td className={cell}>
                  {one.born ? say(one.born) : "—"}
                  {one.minor ? (
                    <span className="bg-muted ml-1.5 rounded px-1 py-px text-[0.6875rem] whitespace-nowrap">
                      {say(head.minor)}
                    </span>
                  ) : null}
                </td>
                <td className={`${cell} tabular-nums`}>
                  {one.idNumber ?? "—"}
                </td>
                <td className={`${cell} tabular-nums`}>{one.phone ?? "—"}</td>
                <td className={`${cell} text-right font-semibold tabular-nums`}>
                  {say(one.share)}
                </td>
              </tr>
              {one.receiver ? (
                <tr className="text-muted-foreground">
                  <td className="px-2 pb-1.5 pl-4" colSpan={6}>
                    ↳ {say(head.receiver)}: {say(one.receiver)}
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/** The numbered clauses of a part, numbered in the paper's own numerals rather than the browser's. */
const Clauses = ({ clauses }: { clauses: Said[] }) => {
  const say = useSay();
  const numeral = useNumeral();
  return (
    <ol className="flex flex-col gap-2.5 text-sm">
      {clauses.map((clause, index) => (
        <li className="grid grid-cols-[1.75rem_1fr]" key={clause.bn}>
          <span className="text-muted-foreground tabular-nums">
            {numeral(index + 1)}.
          </span>
          <span>{say(clause)}</span>
        </li>
      ))}
    </ol>
  );
};

/** Figures and lines as a table: a heading to each column, figures to the right, and a total set apart beneath. */
const Table = ({
  section,
}: {
  section: Extract<PaperSection, { kind: "table" }>;
}) => {
  const say = useSay();
  const align = (at: number) =>
    section.columns[at]?.figures ? "text-right tabular-nums" : "text-left";
  return (
    <>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/60 text-muted-foreground text-xs">
            <tr>
              {section.columns.map((column, at) => (
                <th
                  className={`px-3 py-1.5 font-medium ${align(at)}`}
                  key={column.label.en || column.label.bn}
                >
                  {say(column.label)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {section.rows.map((line, index) => (
              // A line's cells may repeat another's — the same day, the same sum — so its place is part of its key.
              // oxlint-disable-next-line react/no-array-index-key
              <tr
                className="border-t"
                key={`${index}-${line.map(say).join("|")}`}
              >
                {line.map((cell, at) => (
                  <td
                    className={`px-3 py-1.5 align-top ${align(at)}`}
                    // oxlint-disable-next-line react/no-array-index-key
                    key={at}
                  >
                    {say(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {section.foot ? (
            <tfoot>
              <tr className="border-foreground/30 border-t-2 font-semibold">
                {section.foot.map((cell, at) => (
                  <td
                    className={`px-3 py-1.5 ${align(at)}`}
                    // oxlint-disable-next-line react/no-array-index-key
                    key={at}
                  >
                    {say(cell)}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      {section.note ? (
        <p className="bg-muted/60 rounded-md px-3 py-2 text-sm">
          {say(section.note)}
        </p>
      ) : null}
    </>
  );
};

/** What goes under one section's heading, by the kind of section it is. */
const SectionBody = ({ section }: { section: PaperSection }) => {
  const say = useSay();
  switch (section.kind) {
    case "parties": {
      // A Nominee table is too wide for half a page: with one, the parties stand one above the other.
      const anyNominees = section.parties.some(
        (party) => party.nominees.length > 0
      );
      return (
        <div
          className={
            anyNominees
              ? "grid gap-4"
              : "grid gap-4 md:grid-cols-2 print:grid-cols-2"
          }
        >
          {section.parties.map((party, index) => (
            <div
              className="rounded-md border p-4"
              key={`${party.role.bn}-${party.rows[0] ? say(party.rows[0].value) : index}`}
            >
              {say(party.role).trim() ? (
                <p className="text-muted-foreground mb-3 text-xs font-semibold">
                  {say(party.role)}
                </p>
              ) : null}
              <Rows rows={party.rows} />
              <NomineeTable nominees={party.nominees ?? []} />
              <PartyLines lines={party.lines} />
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
            <p className="bg-muted/60 rounded-md px-3 py-2 text-sm">
              {say(section.note)}
            </p>
          ) : null}
        </>
      );
    }
    case "clauses": {
      return <Clauses clauses={section.clauses} />;
    }
    case "table": {
      return <Table section={section} />;
    }
    case "stamp": {
      return (
        <div className="grid grid-cols-3 gap-4 rounded-md border border-dashed p-4">
          {section.blanks.map((blank, at) => (
            <Blank key={blank.en} said={blank} value={section.filled?.[at]} />
          ))}
        </div>
      );
    }
    default: {
      return (
        <>
          <div className="grid grid-cols-2 gap-x-10 gap-y-6">
            {section.signers.map((signer) => (
              <div className="flex flex-col gap-2" key={signer.name}>
                <div className="h-14" />
                <div className="border-foreground border-t pt-1.5 text-sm">
                  <p className="font-medium">{signer.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {say(signer.role)}
                  </p>
                </div>
                {section.dateBlank ? <Blank said={section.dateBlank} /> : null}
              </div>
            ))}
          </div>
          {section.witnesses.length > 0 ? (
            <div className="grid grid-cols-2 gap-x-10 gap-y-6 pt-2">
              {section.witnesses.map((witness) => (
                <div className="flex flex-col gap-2" key={witness.en}>
                  <p className="text-sm font-semibold">{say(witness)}</p>
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
const LetterheadRead = ({
  letterhead,
}: {
  letterhead: PaperDocument["letterhead"];
}) => {
  const say = useSay();
  return (
    <header className="border-foreground flex flex-col items-center gap-1 border-b-4 border-double pb-4 text-center">
      <p className="text-xl font-semibold">{letterhead.name}</p>
      <p className="text-muted-foreground text-xs">
        {letterhead.details.map(say).join(" · ")}
      </p>
    </header>
  );
};

/** The letterhead in the language of the paper around it — or, on a paper drawn by hand like the Welcome Letter, in the
 *  language it is given. */
export const Letterhead = ({
  letterhead,
  language,
}: {
  letterhead: PaperDocument["letterhead"];
  language?: Language;
}) =>
  language ? (
    <PaperLanguage.Provider value={language}>
      <LetterheadRead letterhead={letterhead} />
    </PaperLanguage.Provider>
  ) : (
    <LetterheadRead letterhead={letterhead} />
  );

/** The word across a copy, in the paper's language. */
const COPY_MARK: Said = { bn: "অনুলিপি", en: "COPY" };

/**
 * "Copy" across the page, faint, behind the words: on screen once across the paper, and on every printed sheet — fixed in
 * print, which a browser repeats on each page — so no one sheet of a copy reads as an original on its own.
 */
const CopyWatermark = () => {
  const say = useSay();
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden print:fixed"
    >
      <span className="text-foreground/10 -rotate-30 text-7xl font-bold whitespace-nowrap select-none">
        {say(COPY_MARK)}
      </span>
    </div>
  );
};

/** A photograph that travels with a paper — a face per Animal on a progress statement — and what is written under it. */
export interface PaperPhotograph {
  id: string;
  contentType: string;
  data: string;
  alt: string;
  caption: string;
}

/**
 * The photographs a paper carries, inside it rather than beside it: only the paper's own element is printed, so a face
 * laid out next to it would be on the screen and off the page.
 */
const Photographs = ({ photographs }: { photographs: PaperPhotograph[] }) => (
  <div className="flex break-inside-avoid flex-wrap gap-3">
    {photographs.map((one) => (
      <figure className="w-24" key={one.id}>
        <img
          alt={one.alt}
          className="ring-border h-24 w-24 rounded-lg object-cover ring-1"
          src={`data:${one.contentType};base64,${one.data}`}
        />
        <figcaption className="text-muted-foreground mt-1 text-center text-xs">
          {one.caption}
        </figcaption>
      </figure>
    ))}
  </div>
);

/** A paper with no photographs: one list, so a paper drawn again is not a new one each time. */
const NO_PHOTOGRAPHS: PaperPhotograph[] = [];

/** The body of a paper, read in the language around it. */
const PaperBody = ({
  document,
  photographs,
}: {
  document: PaperDocument;
  photographs: PaperPhotograph[];
}) => {
  const say = useSay();
  const produced = say(document.produced);
  return (
    <>
      {document.copyOf ? <CopyWatermark /> : null}
      <Letterhead letterhead={document.letterhead} />

      <h2 className="text-center text-2xl font-semibold">
        {say(document.title)}
      </h2>

      {/* A copy of a paper already signed says so before anything else, in words a reader cannot miss. */}
      {document.copyOf ? (
        <p className="border-foreground rounded-md border-2 border-dashed px-3 py-2 text-center text-sm font-semibold">
          {say(document.copyOf)}
        </p>
      ) : null}

      {say(document.preamble).trim() ? (
        <p className="text-sm">{say(document.preamble)}</p>
      ) : null}

      {document.sections.map((section, index) => (
        <Section
          heading={section.heading}
          key={`${section.kind}-${section.heading.bn}`}
          number={index + 1}
        >
          <SectionBody section={section} />
        </Section>
      ))}

      {photographs.length > 0 ? (
        <Photographs photographs={photographs} />
      ) : null}

      <footer className="flex flex-col gap-2 border-t pt-3 text-xs">
        {document.copyOf ? (
          <p className="font-semibold">{say(document.copyOf)}</p>
        ) : null}
        {document.closing.length > 0 ? (
          <div className="bg-muted/60 rounded-md px-3 py-2 font-medium">
            {document.closing.map((line) => (
              <p key={say(line)}>{say(line)}</p>
            ))}
          </div>
        ) : null}
        {produced.trim() === "·" ? null : (
          <p className="text-muted-foreground">{produced}</p>
        )}
      </footer>
    </>
  );
};

/**
 * A paper an Investor signs, set as a document: the farm's letterhead, the title, the opening, each part numbered in
 * the order the wording puts them, and the closing lines. Read in one language, Bangla or English, as its reader
 * chose (ADR 0021): the paper carries both, and this draws the one asked for — in that language's type, whatever the
 * app around it is read in.
 */
export const PaperDocumentView = ({
  document,
  language,
  id = PAPER_DOCUMENT_ID,
  photographs = NO_PHOTOGRAPHS,
}: {
  document: PaperDocument;
  language: Language;
  /** The id it is printed by, where more than one paper may be on the page at once. */
  id?: string;
  photographs?: PaperPhotograph[];
}) => (
  <PaperLanguage.Provider value={language}>
    <article
      className="paper-sheet bg-card text-card-foreground relative mx-auto flex w-full max-w-[210mm] flex-col gap-6 rounded-lg border p-6 md:p-12"
      id={id}
      lang={language}
    >
      <PaperBody document={document} photographs={photographs} />
    </article>
  </PaperLanguage.Provider>
);
