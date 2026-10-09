import type { PaperDocument } from "@OpenFarm/domain";
import type { Language } from "@OpenFarm/i18n";
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
import { useId, useState } from "react";

import { SegmentedControl } from "@/components/page";
import type { PaperAttachment } from "@/components/ventures/paper-document";
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

/** Each language by its own name, whichever the app is read in: written here, not looked up, since the browser holds
 *  only the reader's own language's words. */
const LANGUAGE_NAMES: Record<Language, string> = { bn: "বাংলা", en: "English" };

/**
 * Which language a paper is read in: বাংলা or English, never both on one paper (ADR 0021) — the app's own segmented
 * control, as every other choice of a few is made. Each choice is its name in its own language, as the app's language
 * button is, so it reads rightly to a screen reader in either.
 */
export const PaperLanguageSwitch = ({
  language,
  onChange,
}: {
  language: Language;
  onChange: (language: Language) => void;
}) => {
  const { t } = useLanguage();
  const name = useId();
  return (
    <SegmentedControl
      label={t("papers.languageSwitch")}
      name={name}
      onChange={onChange}
      options={(["bn", "en"] as const).map((one) => ({
        value: one,
        label: <span lang={one}>{LANGUAGE_NAMES[one]}</span>,
      }))}
      value={language}
    />
  );
};

/**
 * What sits over every paper on the screen, and is never printed: its language on the left, and on the right Print —
 * which prints the paper in the language shown — and whatever else the reader does with it.
 */
export const PaperToolbar = ({
  language,
  onLanguage,
  printId,
  action,
}: {
  language: Language;
  onLanguage: (language: Language) => void;
  /** The id of the paper Print prints alone. */
  printId: string;
  action?: ReactNode;
}) => {
  const { t } = useLanguage();
  return (
    <div className="no-print flex flex-wrap items-center justify-between gap-3">
      <PaperLanguageSwitch language={language} onChange={onLanguage} />
      <div className="flex flex-wrap items-center gap-2">
        {action}
        <Button
          onClick={() => {
            const shown = document.querySelector<HTMLElement>(`#${printId}`);
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
    </div>
  );
};

/** The desk a paper lies on in a dialog: a quiet ground, so the white sheet reads as a page. */
export const PaperDesk = ({ children }: { children: ReactNode }) => (
  <div className="bg-muted/40 rounded-lg p-3 sm:p-6">{children}</div>
);

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
  attached,
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
  /** A photograph printed whole beneath the paper, where the paper is about it. */
  attached?: PaperAttachment | null;
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
        <PaperToolbar
          action={action}
          language={language}
          onLanguage={setLanguage}
          printId={PAPER_DOCUMENT_ID}
        />
        {paper ? (
          <PaperDesk>
            <PaperDocumentView
              attached={attached}
              document={paper}
              language={language}
            />
          </PaperDesk>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
