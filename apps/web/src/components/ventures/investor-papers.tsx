import type { PaperDocument } from "@OpenFarm/domain";
import type { Language, MessageKey } from "@OpenFarm/i18n";
import { Button, buttonVariants } from "@OpenFarm/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@OpenFarm/ui/components/dialog";
import { useMutation } from "@tanstack/react-query";
import { Download, FileText, Printer, Scale } from "lucide-react";
import { useState } from "react";

import {
  PaperDesk,
  PaperDialog,
  PaperToolbar,
} from "@/components/ventures/paper-dialog";
import { PaperDocumentView } from "@/components/ventures/paper-document";
import { useLanguage } from "@/i18n/language-provider";
import { printAlone } from "@/lib/print-alone";
import { useRefused } from "@/lib/refused";
import type { client } from "@/utils/orpc";
import { orpc } from "@/utils/orpc";

/**
 * Every word the three procedures refuse with, written out.
 *
 * A refusal travels as a thrown error rather than in a return type, so unlike the Settlement's charge
 * words there is nothing on the wire to derive this from. Naming the union all the same is what makes
 * the table below exhaustive: drop a word from it and the `satisfies` fails, rather than the Owner
 * being shown a blank line where the reason should have been. A word the server *adds* still has to be
 * brought here by hand — nothing in TypeScript can see that happen.
 */
type WhyNot =
  | "no_capital_yet"
  | "capital_returned"
  | "not_settled_yet"
  | "no_such_agreement"
  | "farm_identity_incomplete";

/** Why a paper cannot be made yet, in words the Owner can act on rather than the server's English. */
const WHY_NOT = {
  no_capital_yet: "statements.noCapitalYet",
  capital_returned: "statements.capitalReturned",
  not_settled_yet: "statements.notSettledYet",
  no_such_agreement: "statements.noSuchAgreement",
  farm_identity_incomplete: "statements.farmNotRegistered",
} as const satisfies Record<WhyNot, MessageKey>;

/** Which of the three a button asks for. */
export type StatementKind = "joining" | "progress" | "settlement";

/** One statement, produced and shown: the paper in both languages, and the photographs that travel with it. */
export interface Produced {
  kind: StatementKind;
  document: PaperDocument;
  photos: { tagNumber: string; contentType: string; data: string }[];
}

const PAPER_ID = {
  joining: "investor-joining-letter",
  progress: "investor-progress",
  settlement: "investor-settlement",
} as const satisfies Record<StatementKind, string>;

/** What each of the three is called, and its mark, in the order an Investor meets the papers. */
export const PAPER_KINDS: readonly {
  kind: StatementKind;
  label: MessageKey;
  icon: typeof FileText;
}[] = [
  { kind: "joining", label: "statements.joining", icon: FileText },
  { kind: "progress", label: "statements.progress", icon: Printer },
  { kind: "settlement", label: "statements.settlement", icon: Scale },
];

/** A copy of a signed Agreement, laid out to print, with the wording Version it was signed in. */
type AgreementCopy = Awaited<
  ReturnType<typeof client.investorStatements.agreementCopy>
>;

/** The photo of a signed Agreement's stamped paper, as the farm kept it; nothing for one never photographed. */
type SignedPaper = Awaited<ReturnType<typeof client.ventures.agreements.paper>>;

/**
 * The three papers an Investor ever receives, asked for from his own row on the Venture's Investors tab and shown
 * beneath the table, ready to print.
 *
 * Asked for by Agreement rather than by Investor, because the Agreement is what each paper is about — it froze his
 * Units, his split, his window and his Arbitrator, and the money was signed for on it.
 *
 * The paper goes when a later ask fails, as well as when another is made: a statement left standing under a table
 * it was not made for, with only a toast gone from the corner to say so, is how one Investor's figures end up read
 * as another's.
 */
export const useInvestorPapers = () => {
  const refused = useRefused(WHY_NOT);
  const [produced, setProduced] = useState<Produced | null>(null);
  const handling = (kind: StatementKind) => ({
    onError: (error: unknown) => {
      setProduced(null);
      refused(error);
    },
    onSuccess: (made: {
      document: PaperDocument;
      photos?: { tagNumber: string; contentType: string; data: string }[];
    }) =>
      setProduced({ kind, document: made.document, photos: made.photos ?? [] }),
  });
  const joining = useMutation(
    orpc.investorStatements.joining.mutationOptions(handling("joining"))
  );
  const progress = useMutation(
    orpc.investorStatements.progress.mutationOptions(handling("progress"))
  );
  const settlement = useMutation(
    orpc.investorStatements.settlement.mutationOptions(handling("settlement"))
  );
  const asking = { joining, progress, settlement };
  // The Agreement itself, again: a marked copy laid out from what was signed, and the photo of the stamped original.
  const [copy, setCopy] = useState<AgreementCopy | null>(null);
  const [photo, setPhoto] = useState<SignedPaper | null>(null);
  const copying = useMutation(
    orpc.investorStatements.agreementCopy.mutationOptions({
      onError: refused,
      onSuccess: setCopy,
    })
  );
  const seeing = useMutation(
    orpc.ventures.agreements.paper.mutationOptions({
      onError: refused,
      onSuccess: setPhoto,
    })
  );
  return {
    ask: (kind: StatementKind, agreementId: string) =>
      asking[kind].mutate({ agreementId }),
    busy:
      joining.isPending ||
      progress.isPending ||
      settlement.isPending ||
      copying.isPending ||
      seeing.isPending,
    produced,
    closeProduced: () => setProduced(null),
    askCopy: (agreementId: string) => copying.mutate({ agreementId }),
    copy,
    closeCopy: () => setCopy(null),
    askPhoto: (agreementId: string) => seeing.mutate({ agreementId }),
    photo,
    closePhoto: () => setPhoto(null),
  };
};

/**
 * A paper made for one Investor, as it prints: read in Bangla or in English as its reader chooses, starting on their own
 * language (ADR 0021), with the photographs that travel with it — and printed in the language on the screen.
 */
export const ProducedPaper = ({ produced }: { produced: Produced }) => {
  const { t, language: reads } = useLanguage();
  const [language, setLanguage] = useState<Language>(reads);
  const id = PAPER_ID[produced.kind];
  return (
    <div className="flex flex-col gap-4">
      <PaperToolbar language={language} onLanguage={setLanguage} printId={id} />
      <PaperDesk>
        <PaperDocumentView
          document={produced.document}
          id={id}
          language={language}
          photographs={produced.photos.map((one) => ({
            alt: t("statements.photoOf", { tag: one.tagNumber }),
            caption: one.tagNumber,
            contentType: one.contentType,
            data: one.data,
            id: one.tagNumber,
          }))}
        />
      </PaperDesk>
    </div>
  );
};

/** What each statement is called, by the kind it is. */
const STATEMENT_WORD = Object.fromEntries(
  PAPER_KINDS.map((one) => [one.kind, one.label])
) as Record<StatementKind, MessageKey>;

/**
 * A statement in a dialog over the page it was asked from, as the Agreement's copy is: read and printed there in the
 * language its switch shows, and gone when closed — never left standing under a table it was not made for.
 */
export const StatementDialog = ({
  papers,
}: {
  papers: ReturnType<typeof useInvestorPapers>;
}) => {
  const { t } = useLanguage();
  const { produced, closeProduced } = papers;
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          closeProduced();
        }
      }}
      open={produced !== null}
    >
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-4xl"
        closeLabel={t("common.close")}
      >
        <DialogHeader>
          <DialogTitle>
            {produced ? t(STATEMENT_WORD[produced.kind]) : ""}
          </DialogTitle>
        </DialogHeader>
        {produced ? <ProducedPaper produced={produced} /> : null}
      </DialogContent>
    </Dialog>
  );
};

/** Where the photo of a signed paper is drawn in its dialog: what Print prints, alone. */
const SIGNED_PAPER_ID = "signed-agreement-paper";

/**
 * The Agreement again, for its row's menu: a copy laid out from what was signed, marked as a copy on every page, and
 * the photo of the stamped original as the farm kept it — each to print, the photo to save as well.
 */
export const AgreementAgain = ({
  papers,
}: {
  papers: ReturnType<typeof useInvestorPapers>;
}) => {
  const { t } = useLanguage();
  const { photo, copy, closeCopy, closePhoto } = papers;
  const source = photo ? `data:${photo.contentType};base64,${photo.data}` : "";
  return (
    <>
      <PaperDialog
        description={t("statements.copyHint")}
        onClose={closeCopy}
        paper={copy?.document ?? null}
        title={t("statements.copyTitle")}
        wording={copy?.wording ?? null}
      />
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            closePhoto();
          }
        }}
        open={photo !== null}
      >
        <DialogContent
          className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"
          closeLabel={t("common.close")}
        >
          <DialogHeader>
            <DialogTitle>{t("statements.paperTitle")}</DialogTitle>
            <DialogDescription>{t("statements.paperHint")}</DialogDescription>
          </DialogHeader>
          <div id={SIGNED_PAPER_ID}>
            <img
              alt={t("statements.paperTitle")}
              className="mx-auto max-h-[70vh] w-auto rounded-md border"
              src={source}
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <a
              className={buttonVariants({ variant: "outline" })}
              download={`agreement-paper.${photo?.contentType.split("/")[1] ?? "jpg"}`}
              href={source}
            >
              <Download aria-hidden data-icon="inline-start" />
              {t("statements.download")}
            </a>
            <Button
              onClick={() => {
                const shown = document.querySelector<HTMLElement>(
                  `#${SIGNED_PAPER_ID}`
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
    </>
  );
};
