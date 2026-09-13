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
  | "treatment-register"
  | "disease-history"
  | "sop-card";

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
}: {
  id: PaperId;
  text: string;
  /** A photograph printed under the text, for a paper that shows one — the Registration's certificate. */
  image?: { contentType: string; data: string; alt: string };
}) => {
  const { t } = useLanguage();
  return (
    <section className="space-y-2 rounded-xl border p-3 text-sm" id={id}>
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
