import { Button } from "@OpenFarm/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@OpenFarm/ui/components/dialog";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { cn } from "@OpenFarm/ui/lib/utils";
import { Eye, FileText } from "lucide-react";
import { useState } from "react";

import { useTheirPaper } from "@/components/portal/portal-source";
import type {
  Produced,
  StatementKind,
} from "@/components/ventures/investor-papers";
import { ProducedPaper } from "@/components/ventures/investor-papers";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";

/** What each paper is called, on its row and over it. */
const PAPER_WORD = {
  joining: "portal.paper.joining",
  progress: "portal.paper.progress",
  settlement: "portal.paper.settlement",
} as const satisfies Record<StatementKind, string>;

/** What each paper is for, in a line under its name. */
const PAPER_HINT = {
  joining: "portal.paper.joiningHint",
  progress: "portal.paper.progressHint",
  settlement: "portal.paper.settlementHint",
} as const satisfies Record<StatementKind, string>;

/** Every paper, in the order a Venture gives them. */
const KINDS: readonly StatementKind[] = ["joining", "progress", "settlement"];

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
 * One Agreement's papers, as a list of documents: each named, with what it is for, and a button that makes it as the
 * Owner would print it and shows it to read and print. All three are always listed, so nobody wonders where the
 * settlement statement is; one that cannot be made yet is dim and says when it will be — the joining letter and the
 * progress statement once capital has come in, the settlement statement once the Settlement is approved.
 */
export const PortalPapers = ({
  agreementId,
  hasCapital,
  settled,
}: {
  agreementId: string;
  hasCapital: boolean;
  settled: boolean;
}) => {
  const { t } = useLanguage();
  const refused = useRefused(REFUSALS);
  const [shown, setShown] = useState<Produced | null>(null);
  const making = useTheirPaper(refused);
  const notYet = (kind: StatementKind) => {
    if (!hasCapital) {
      return t("portal.paper.afterCapital");
    }
    if (kind === "settlement" && !settled) {
      return t("portal.paper.afterSettlement");
    }
    return null;
  };
  return (
    <>
      <ul className="flex flex-col divide-y">
        {KINDS.map((kind) => {
          const why = notYet(kind);
          const thisOne = making.isPending && making.variables?.kind === kind;
          return (
            <li
              className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
              key={kind}
            >
              <span
                aria-hidden
                className={cn(
                  "bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-md",
                  why === null && "bg-primary/10 text-primary"
                )}
              >
                <FileText className="size-4" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span
                  className={cn(
                    "text-sm font-medium",
                    why !== null && "text-muted-foreground"
                  )}
                >
                  {t(PAPER_WORD[kind])}
                </span>
                <span className="text-muted-foreground text-xs">
                  {why ?? t(PAPER_HINT[kind])}
                </span>
              </span>
              {why === null ? (
                <Button
                  aria-label={`${t("portal.paper.open")}: ${t(PAPER_WORD[kind])}`}
                  disabled={making.isPending}
                  onClick={() =>
                    making.mutate(
                      { agreementId, kind },
                      {
                        onSuccess: (made) =>
                          setShown({
                            kind,
                            text: made.text,
                            photos: made.photos,
                          }),
                      }
                    )
                  }
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {thisOne ? (
                    <Spinner />
                  ) : (
                    <Eye aria-hidden data-icon="inline-start" />
                  )}
                  {t("portal.paper.open")}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
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
    </>
  );
};
