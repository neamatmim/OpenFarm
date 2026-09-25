import type { PaperDocument } from "@OpenFarm/domain";
import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@OpenFarm/ui/components/dialog";
import { Printer } from "lucide-react";
import type { ReactNode } from "react";

import {
  PAPER_DOCUMENT_ID,
  PaperDocumentView,
} from "@/components/ventures/paper-document";
import { useLanguage } from "@/i18n/language-provider";
import { printAlone } from "@/lib/print-alone";

/** Which wording a paper was laid out in, and whether a lawyer has approved it. */
export interface WordingSaid {
  number: number;
  reviewedBy: string | null;
  reviewedOn: string | null;
}

/** The wording's Version, and the lawyer's approval or the want of one — said above the page, never on it. */
const WordingLine = ({ wording }: { wording: WordingSaid }) => {
  const { t, language } = useLanguage();
  if (wording.reviewedOn && wording.reviewedBy) {
    return (
      <p className="text-muted-foreground no-print text-sm">
        {t("templates.approvedLine", {
          number: wording.number,
          lawyer: wording.reviewedBy,
          day: formatDate(
            new Date(`${wording.reviewedOn}T00:00:00Z`),
            language,
            "date"
          ),
        })}
      </p>
    );
  }
  return (
    <p className="bg-warning-surface text-warning no-print rounded-md px-3 py-2 text-sm">
      {t("templates.notApprovedLine", { number: wording.number })}
    </p>
  );
};

/**
 * A paper laid out in a dialog wide enough for a page, and printed from there alone. Which wording it was laid out in
 * is said above the page, with the want of a lawyer's approval where there is one, and never printed.
 */
export const PaperDialog = ({
  paper,
  wording,
  title,
  description,
  notice,
  onClose,
}: {
  paper: PaperDocument | null;
  wording: WordingSaid | null;
  title: ReactNode;
  description?: ReactNode;
  /** Something the reader must know before handing the paper over, above it and never printed. */
  notice?: ReactNode;
  onClose: () => void;
}) => {
  const { t } = useLanguage();
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open={paper !== null}
    >
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-4xl"
        closeLabel={t("common.close")}
      >
        <DialogHeader className="no-print">
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        {notice ? <div className="no-print">{notice}</div> : null}
        {wording ? <WordingLine wording={wording} /> : null}
        {paper ? <PaperDocumentView document={paper} /> : null}
        <div className="no-print flex justify-end">
          <Button
            onClick={() => {
              const shown = document.querySelector<HTMLElement>(
                `#${PAPER_DOCUMENT_ID}`
              );
              if (shown) {
                void printAlone(shown);
              }
            }}
            type="button"
          >
            <Printer aria-hidden data-icon="inline-start" />
            {t("common.print")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
