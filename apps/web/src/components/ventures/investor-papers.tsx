import type { MessageKey } from "@OpenFarm/i18n";
import { useMutation } from "@tanstack/react-query";
import { FileText, Printer, Scale } from "lucide-react";
import { useState } from "react";

import type { PaperId } from "@/components/paper";
import { Paper } from "@/components/paper";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
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

/** One statement, produced and shown: the paper's text, and the photographs that travel with it. */
export interface Produced {
  kind: StatementKind;
  text: string;
  photos: { tagNumber: string; contentType: string; data: string }[];
}

const PAPER_ID = {
  joining: "investor-joining-letter",
  progress: "investor-progress",
  settlement: "investor-settlement",
} as const satisfies Record<StatementKind, PaperId>;

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
  const asking = { joining, progress, settlement };
  return {
    ask: (kind: StatementKind, agreementId: string) =>
      asking[kind].mutate({ agreementId }),
    busy: joining.isPending || progress.isPending || settlement.isPending,
    produced,
  };
};

/** A paper made for one Investor, as it prints: its text, and the photographs that travel with it. */
export const ProducedPaper = ({ produced }: { produced: Produced }) => {
  const { t } = useLanguage();
  return (
    <Paper
      id={PAPER_ID[produced.kind]}
      // Inside the paper, not beneath it: the print rules hide everything outside the sheet's own element, so a
      // face put below it would show on the screen and vanish off the page.
      photographs={produced.photos.map((one) => ({
        alt: t("statements.photoOf", { tag: one.tagNumber }),
        caption: one.tagNumber,
        contentType: one.contentType,
        data: one.data,
        id: one.tagNumber,
      }))}
      text={produced.text}
    />
  );
};
