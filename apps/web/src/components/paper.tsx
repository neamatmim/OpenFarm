import { Button } from "@OpenFarm/ui/components/button";

import { useLanguage } from "@/i18n/language-provider";

/** The papers the farm prints. A closed list, because the id is written straight into a
 *  stylesheet and anything a caller could compose does not belong in one. */
export type PaperId =
  | "sale-receipt"
  | "transport-card"
  | "animal-passport"
  | "withdrawal-summary"
  | "dls-letter"
  | "milk-dispatch-record"
  | "accountant-summary"
  | "registration-record"
  | "herd-summary"
  | "vaccination-register"
  | "treatment-register"
  | "disease-history"
  | "mortality-register"
  | "sop-card"
  | "investment-agreement-draft"
  | "investor-joining-letter"
  | "investor-progress"
  | "investor-settlement";

/**
 * A document the farm hands somebody, on one page.
 *
 * Pre-formatted, because the line breaks *are* the document: these are papers the farm may have
 * to produce again years later, and they should read the same every time. The print rules are
 * the DLS letter's — one page, and only the paper on it.
 */
export const Paper = ({
  id,
  text,
  image,
  photographs,
}: {
  id: PaperId;
  text: string;
  /** A photograph printed under the text, for a paper that shows one — the Registration's certificate. */
  image?: { contentType: string; data: string; alt: string };
  /**
   * A face per Animal, printed with the text, for a paper that shows the herd it is about.
   *
   * Inside this element rather than beside it, because the print rules hide everything outside it: a
   * photograph laid out next to the paper would be on the screen and off the page.
   */
  photographs?: {
    /** What the caller knows her by, which is what keeps the list in order across a redraw. */
    id: string;
    contentType: string;
    data: string;
    alt: string;
    /** What to write under it — a tag number, so a reader can match face to row. */
    caption: string;
  }[];
}) => {
  const { t } = useLanguage();
  return (
    <section className="surface space-y-2 p-4 text-sm" id={id}>
      <style>{`@page { size: A4; margin: 20mm }
        @media print {
          body * { visibility: hidden }
          #${id}, #${id} * { visibility: visible }
          #${id} { position: absolute; inset: 0; border: 0 }
          .no-print { display: none }
          body { font-size: 12pt }
        }`}</style>
      <pre className="overflow-x-auto font-sans text-sm whitespace-pre-wrap">
        {text}
      </pre>
      {image ? (
        <img
          alt={image.alt}
          className="max-h-[140mm] rounded-lg"
          src={`data:${image.contentType};base64,${image.data}`}
        />
      ) : null}
      {photographs?.length ? (
        <div className="flex flex-wrap gap-3">
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
      ) : null}
      <Button
        className="no-print"
        onClick={() => window.print()}
        size="sm"
        type="button"
        variant="outline"
      >
        {t("common.print")}
      </Button>
    </section>
  );
};
