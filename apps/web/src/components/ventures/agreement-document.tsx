import type { AgreementDocument, DocumentRow, Said } from "@OpenFarm/domain";
import { formatDigits } from "@OpenFarm/i18n";
import type { ReactNode } from "react";

/** The id the document is found by to print it alone (lib/print-alone). */
export const AGREEMENT_DOCUMENT_ID = "investment-agreement";

/** A section of the deed: its number in Bangla numerals, its Bangla name, and the English beside it. */
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
      <span className="text-muted-foreground text-xs font-normal">
        {heading.en}
      </span>
    </h3>
    {children}
  </section>
);

/** A label in both languages, the English smaller beneath. */
const Label = ({ said }: { said: Said }) => (
  <span className="flex flex-col leading-tight">
    <span>{said.bn}</span>
    <span className="text-muted-foreground text-[0.75rem]">{said.en}</span>
  </span>
);

/** Facts as the deed sets them: what each is, and what it says. */
const Rows = ({ rows }: { rows: DocumentRow[] }) => (
  <dl className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 gap-y-2 text-sm">
    {rows.map((row) => (
      <div className="contents" key={row.label.en}>
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
      {said.bn} / {said.en}
    </span>
  </div>
);

/**
 * The Investment Agreement set as a document: the farm's letterhead, the title, the two parties side by side, the
 * Venture and the capital, the terms numbered, a box for the stamp or e-challan, and room for both signatures and two
 * witnesses. Everything it says comes from the farm, in both languages; this only lays it out, on screen and on A4.
 */
export const AgreementDocumentView = ({
  document,
}: {
  document: AgreementDocument;
}) => (
  <article
    className="bg-card text-card-foreground mx-auto flex w-full max-w-[210mm] flex-col gap-6 rounded-lg border p-6 md:p-10"
    id={AGREEMENT_DOCUMENT_ID}
  >
    <header className="border-foreground flex flex-col items-center gap-1 border-b-2 pb-4 text-center">
      <p className="text-lg font-semibold tracking-tight">
        {document.letterhead.name}
      </p>
      <p className="text-muted-foreground text-xs">
        {document.letterhead.details.join(" · ")}
      </p>
    </header>

    <div className="flex flex-col items-center gap-1 text-center">
      <h2 className="text-2xl font-semibold tracking-tight">
        {document.title.bn}
      </h2>
      <p className="text-muted-foreground text-xs tracking-[0.2em] uppercase">
        {document.title.en}
      </p>
    </div>

    <p className="text-sm">
      {document.preamble.bn}
      <br />
      <span className="text-muted-foreground">{document.preamble.en}</span>
    </p>

    <Section heading={document.partiesHeading} number={1}>
      <div className="grid gap-4 md:grid-cols-2 print:grid-cols-2">
        {document.parties.map((party) => (
          <div className="rounded-md border p-4" key={party.role.en}>
            <p className="mb-3 text-xs font-semibold">
              {party.role.bn}
              <span className="text-muted-foreground font-normal">
                {" "}
                · {party.role.en}
              </span>
            </p>
            <Rows rows={party.rows} />
          </div>
        ))}
      </div>
    </Section>

    <Section heading={document.venture.heading} number={2}>
      <Rows rows={document.venture.rows} />
      <p className="bg-muted rounded-md px-3 py-2 text-sm">
        {document.payment.bn}
        <br />
        <span className="text-muted-foreground">{document.payment.en}</span>
      </p>
    </Section>

    <Section heading={document.terms.heading} number={3}>
      <ol className="flex list-[bengali] flex-col gap-1.5 pl-6 text-sm">
        {document.terms.clauses.map((clause) => (
          <li className="pl-1" key={clause}>
            {clause}
          </li>
        ))}
      </ol>
    </Section>

    <Section heading={document.stamp.heading} number={4}>
      <div className="grid grid-cols-3 gap-4 rounded-md border border-dashed p-4">
        {document.stamp.blanks.map((blank) => (
          <Blank key={blank.en} said={blank} />
        ))}
      </div>
    </Section>

    <Section heading={document.signatures.heading} number={5}>
      <div className="grid grid-cols-2 gap-8">
        {document.signatures.signers.map((signer) => (
          <div className="flex flex-col gap-1" key={signer.role.en}>
            <div className="h-14" />
            <div className="border-foreground border-t pt-1.5 text-sm">
              <p className="font-medium">{signer.name}</p>
              <p className="text-muted-foreground text-xs">
                {signer.role.bn} / {signer.role.en}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-8 pt-2">
        {document.signatures.witnesses.map((witness) => (
          <div className="flex flex-col gap-2" key={witness.en}>
            <p className="text-xs font-semibold">
              {witness.bn} / {witness.en}
            </p>
            {document.signatures.witnessBlanks.map((blank) => (
              <Blank key={blank.en} said={blank} />
            ))}
          </div>
        ))}
      </div>
    </Section>

    <footer className="text-muted-foreground flex flex-col gap-0.5 border-t pt-3 text-xs">
      {document.closing.map((line) => (
        <p key={line}>{line}</p>
      ))}
      <p className="pt-1">{document.produced}</p>
    </footer>
  </article>
);
