import { Button } from "@OpenFarm/ui/components/button";
import { useRef } from "react";

import { useLanguage } from "@/i18n/language-provider";
import { printAlone } from "@/lib/print-alone";

/** The papers the farm prints as text, each by its own name on the page. */
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
  | "investor-joining-letter"
  | "investor-progress"
  | "investor-settlement";

/**
 * A document the farm hands somebody, on one page.
 *
 * Pre-formatted, because the line breaks *are* the document: these are papers the farm may have
 * to produce again years later, and they should read the same every time. Printed alone
 * (lib/print-alone): only the paper, on white, whatever theme the app is in.
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
   * Inside this element rather than beside it, because only this element is printed: a photograph laid out
   * next to the paper would be on the screen and off the page.
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
  const paper = useRef<HTMLElement>(null);
  return (
    <section className="surface space-y-2 p-4 text-sm" id={id} ref={paper}>
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
        onClick={() => {
          if (paper.current) {
            void printAlone(paper.current, {
              margin: "20mm",
              fontSize: "12pt",
            });
          }
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        {t("common.print")}
      </Button>
    </section>
  );
};
