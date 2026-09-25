import { Button } from "@OpenFarm/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@OpenFarm/ui/components/dialog";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { FileText } from "lucide-react";
import { useState } from "react";

import { useTheirPaper } from "@/components/portal/portal-source";
import type {
  Produced,
  StatementKind,
} from "@/components/ventures/investor-papers";
import { ProducedPaper } from "@/components/ventures/investor-papers";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";

/** What each paper is called, on its button and over it. */
const PAPER_WORD = {
  joining: "portal.paper.joining",
  progress: "portal.paper.progress",
  settlement: "portal.paper.settlement",
} as const satisfies Record<StatementKind, string>;

/** Why a paper did not come, in the Investor's words: nothing to acknowledge yet, no Settlement yet, the portal shut,
 *  their access taken away, or their sign-in's day over, while they read. */
const REFUSALS = {
  no_capital_yet: "statements.noCapitalYet",
  not_settled_yet: "statements.notSettledYet",
  not_an_investor: "portal.refused.notAnInvestor",
  signed_in_too_long: "portal.endedHint",
  no_such_agreement: "statements.noSuchAgreement",
} as const;

/**
 * One Agreement's papers, each a button that makes it as the Owner would print it and shows it to read and print.
 * A paper that cannot be made yet is dim, with why under the buttons: the joining letter and the progress statement
 * once capital has come in, the settlement statement once the Settlement is approved.
 */
export const PortalPapers = ({
  agreementId,
  hasCapital,
  settled,
  size = "default",
}: {
  agreementId: string;
  hasCapital: boolean;
  settled: boolean;
  size?: "default" | "sm";
}) => {
  const { t } = useLanguage();
  const refused = useRefused(REFUSALS);
  const [shown, setShown] = useState<Produced | null>(null);
  const making = useTheirPaper(refused);
  const kinds: StatementKind[] = settled
    ? ["joining", "progress", "settlement"]
    : ["joining", "progress"];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {kinds.map((kind) => (
          <Button
            disabled={making.isPending || !hasCapital}
            key={kind}
            onClick={() =>
              making.mutate(
                { agreementId, kind },
                {
                  onSuccess: (made) =>
                    setShown({ kind, text: made.text, photos: made.photos }),
                }
              )
            }
            size={size}
            type="button"
            variant="outline"
          >
            {making.isPending && making.variables?.kind === kind ? (
              <Spinner />
            ) : (
              <FileText aria-hidden data-icon="inline-start" />
            )}
            {t(PAPER_WORD[kind])}
          </Button>
        ))}
      </div>
      {hasCapital ? null : (
        <p className="text-muted-foreground text-xs">
          {t("statements.noCapitalYet")}
        </p>
      )}
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setShown(null);
          }
        }}
        open={shown !== null}
      >
        <DialogContent
          className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"
          closeLabel={t("common.close")}
        >
          <DialogHeader>
            <DialogTitle>{shown ? t(PAPER_WORD[shown.kind]) : ""}</DialogTitle>
          </DialogHeader>
          {shown ? <ProducedPaper produced={shown} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};
