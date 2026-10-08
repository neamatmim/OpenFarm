import type { PaperDocument } from "@OpenFarm/domain";
import type { Language } from "@OpenFarm/i18n";
import { formatDate, translate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@OpenFarm/ui/components/dialog";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@OpenFarm/ui/components/toggle-group";
import { Printer } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

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
 * Which language a paper is read in: বাংলা or English, never both on one paper (ADR 0021). Each choice is its name in
 * its own language, as the app's own language button is, so it reads rightly to a screen reader in either.
 */
export const PaperLanguageSwitch = ({
  language,
  onChange,
}: {
  language: Language;
  onChange: (language: Language) => void;
}) => {
  const { t } = useLanguage();
  return (
    <ToggleGroup
      aria-label={t("papers.languageSwitch")}
      className="no-print"
      onValueChange={(chosen) => {
        const [next] = chosen;
        if (next === "bn" || next === "en") {
          onChange(next);
        }
      }}
      size="sm"
      spacing={0}
      value={[language]}
      variant="outline"
    >
      <ToggleGroupItem
        className="aria-pressed:bg-primary aria-pressed:text-primary-foreground px-3"
        lang="bn"
        value="bn"
      >
        {translate("bn", "language.bn")}
      </ToggleGroupItem>
      <ToggleGroupItem
        className="aria-pressed:bg-primary aria-pressed:text-primary-foreground px-3"
        lang="en"
        value="en"
      >
        {translate("en", "language.en")}
      </ToggleGroupItem>
    </ToggleGroup>
  );
};

/**
 * A paper laid out in a dialog wide enough for a page, and printed from there alone — in the language its switch shows,
 * starting on the reader's own. Which wording it was laid out in is said above the page, with the want of a lawyer's
 * approval where there is one, and never printed.
 */
export const PaperDialog = ({
  paper,
  wording,
  title,
  description,
  notice,
  action,
  onClose,
}: {
  paper: PaperDocument | null;
  wording: WordingSaid | null;
  title: ReactNode;
  description?: ReactNode;
  /** Something the reader must know before handing the paper over, above it and never printed. */
  notice?: ReactNode;
  /** What the reader does once the paper is printed, beside Print: never printed itself. */
  action?: ReactNode;
  onClose: () => void;
}) => {
  const { t, language: reads } = useLanguage();
  const [language, setLanguage] = useState<Language>(reads);
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
        <PaperLanguageSwitch language={language} onChange={setLanguage} />
        {paper ? (
          <PaperDocumentView document={paper} language={language} />
        ) : null}
        <div className="no-print flex flex-wrap justify-end gap-2">
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
          {action}
        </div>
      </DialogContent>
    </Dialog>
  );
};
