import type { MessageKey } from "@OpenFarm/i18n";
import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@OpenFarm/ui/components/sheet";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FileText, Printer, Scale } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useInvestorNames } from "@/components/investors/investor-names";
import { RecordList, RecordRow } from "@/components/page";
import type { PaperId } from "@/components/paper";
import { Paper } from "@/components/paper";
import { useLanguage } from "@/i18n/language-provider";
import { sayWhy } from "@/lib/saying";
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
type StatementKind = "joining" | "progress" | "settlement";

/** One statement, produced and shown: the sheet's text, and the photographs that travel with it. */
interface Produced {
  kind: StatementKind;
  text: string;
  photos: { tagNumber: string; contentType: string; data: string }[];
}

const PAPER_ID = {
  joining: "investor-joining-letter",
  progress: "investor-progress",
  settlement: "investor-settlement",
} as const satisfies Record<StatementKind, PaperId>;

/**
 * The three papers an Investor ever receives, produced for one named man.
 *
 * Listed by Agreement rather than by Investor, because the Agreement is what each paper is about — it
 * froze his Units, his split, his window and his Arbitrator, and the money was signed for on it. And
 * listed before the Settlement is approved, which is the whole reason this sheet exists: the only
 * per-Investor rows the app had were the approved Settlement's shares, so the two papers wanted while
 * the run is on had nowhere to be asked for.
 */
export const StatementsSheet = ({
  venture,
  open,
  onOpenChange,
}: {
  venture: { id: string; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t, language } = useLanguage();
  const nameOf = useInvestorNames();
  const [produced, setProduced] = useState<Produced | null>(null);
  const agreements = useQuery({
    ...orpc.ventures.agreements.queryOptions({
      input: { ventureId: venture?.id ?? "" },
    }),
    enabled: venture !== null,
  });
  /**
   * What every one of the three does with its answer, and with a refusal.
   *
   * The paper goes when a later click fails, as well as when the sheet closes: a statement left
   * standing under a row it was not made for, with only a toast gone from the corner to say so, is how
   * one Investor's figures end up read as another's.
   */
  const handling = (kind: StatementKind) => ({
    onError: (error: unknown) => {
      setProduced(null);
      toast.error(sayWhy(error, t, WHY_NOT));
    },
    onSuccess: (made: {
      text: string;
      photos?: { tagNumber: string; contentType: string; data: string }[];
    }) => setProduced({ kind, text: made.text, photos: made.photos ?? [] }),
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
  /** The three buttons, in the order an Investor meets the papers. */
  const asking: readonly {
    icon: typeof FileText;
    label: MessageKey;
    mutation: {
      isPending: boolean;
      mutate: (input: { agreementId: string }) => void;
    };
  }[] = [
    { icon: FileText, label: "statements.joining", mutation: joining },
    { icon: Printer, label: "statements.progress", mutation: progress },
    { icon: Scale, label: "statements.settlement", mutation: settlement },
  ];
  const busy = asking.some((one) => one.mutation.isPending);
  return (
    <Sheet
      onOpenChange={(next) => {
        if (!next) {
          setProduced(null);
        }
        onOpenChange(next);
      }}
      open={open}
    >
      <SheetContent
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-3xl"
        closeLabel={t("common.close")}
      >
        <SheetHeader className="border-b">
          <SheetTitle>{venture?.name ?? t("statements.title")}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          <p className="text-muted-foreground text-sm">
            {t("statements.hint")}
          </p>
          <RecordList>
            {(agreements.data ?? []).map((one) => (
              <RecordRow
                key={one.id}
                meta={
                  <span>
                    {t("statements.unitsHeld", {
                      units: formatNumber(one.units, language),
                    })}
                  </span>
                }
                title={nameOf(one.investorId)}
                trailing={
                  <span className="flex flex-wrap justify-end gap-2">
                    {asking.map(({ icon: Icon, label, mutation }) => (
                      <Button
                        disabled={busy}
                        key={label}
                        onClick={() => mutation.mutate({ agreementId: one.id })}
                        type="button"
                        variant="outline"
                      >
                        {mutation.isPending ? (
                          <Spinner />
                        ) : (
                          <Icon aria-hidden data-icon="inline-start" />
                        )}
                        {t(label)}
                      </Button>
                    ))}
                  </span>
                }
              />
            ))}
          </RecordList>
          {produced ? (
            <Paper
              id={PAPER_ID[produced.kind]}
              // Inside the paper, not beneath it: the print rules hide everything outside the sheet's
              // own element, so a face put below it would show on the screen and vanish off the page.
              photographs={produced.photos.map((one) => ({
                alt: t("statements.photoOf", { tag: one.tagNumber }),
                caption: one.tagNumber,
                contentType: one.contentType,
                data: one.data,
                id: one.tagNumber,
              }))}
              text={produced.text}
            />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
};
