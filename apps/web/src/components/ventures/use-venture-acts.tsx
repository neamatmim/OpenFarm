import type { MessageKey } from "@OpenFarm/i18n";
import { useMutation } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { AdvanceSheet } from "@/components/ventures/advance-sheet";
import { AmendSheet } from "@/components/ventures/amend-sheet";
import { BankCheckSheet } from "@/components/ventures/bank-check-sheet";
import { BuyWhatIsLeftSheet } from "@/components/ventures/buy-what-is-left-sheet";
import { CallOffSheet } from "@/components/ventures/call-off-sheet";
import { CountFloatSheet } from "@/components/ventures/count-float-sheet";
import { DrawFloatSheet } from "@/components/ventures/draw-float-sheet";
import { EconomicsSheet } from "@/components/ventures/economics-sheet";
import { ReimburseSheet } from "@/components/ventures/reimburse-sheet";
import { SettlementSheet } from "@/components/ventures/settlement-sheet";
import { SignAgreementSheet } from "@/components/ventures/sign-agreement-sheet";
import { TakeCapitalSheet } from "@/components/ventures/take-capital-sheet";
import type { VentureActs } from "@/components/ventures/venture-card";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import type { Venture } from "@/lib/ventures";
import { orpc } from "@/utils/orpc";

/**
 * The acts that open a sheet about one Venture — which is every act but the two that are a single mutation
 * each, said and done with no form to fill.
 *
 * Taken from `VentureActs` rather than listed again, so a new act is a compiler error here until it is either
 * given a sheet or named as one that needs none.
 */
type ActOnOneVenture = Exclude<
  keyof VentureActs,
  "startBuying" | "startFattening"
>;

/**
 * Everything that can be done to one Venture, and the sheets it is done in — one of them, the list and a
 * Venture's own page both, so a button on either opens the same sheet with the same rules.
 *
 * One slot for what is staged, because one sheet is open at a time: fifteen separate slots could each hold a
 * Venture at once, and neither page has a meaning for two — nor for a sheet holding last week's Venture behind
 * the one on show, which is what a slot nobody cleared amounted to.
 *
 * Capital is the one act that may be staged on one Investor's paper as well as the Venture: taken from his row.
 */
export const useVentureActs = (): { acts: VentureActs; sheets: ReactNode } => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [staged, setStaged] = useState<{
    act: ActOnOneVenture;
    venture: Venture;
    agreementId?: string;
  } | null>(null);
  /**
   * Moving a Venture along. Two acts with no form to fill: she says buying has started, and later that it is
   * over.
   */
  const moved = (said: MessageKey) => ({
    onError: refused,
    onSuccess: () => {
      toast.success(t(said));
    },
  });
  const moving = useMutation(
    orpc.ventures.startBuying.mutationOptions(moved("ventures.buyingStarted"))
  );
  const fattening = useMutation(
    orpc.ventures.startFattening.mutationOptions(
      moved("ventures.fatteningStarted")
    )
  );
  const opens = (act: ActOnOneVenture) => (venture: Venture) =>
    setStaged({ act, venture });
  const acts: VentureActs = {
    sign: opens("sign"),
    takeCapital: (venture, agreementId) =>
      setStaged({ act: "takeCapital", venture, agreementId }),
    callOff: opens("callOff"),
    drawFloat: opens("drawFloat"),
    countFloat: opens("countFloat"),
    reimburse: opens("reimburse"),
    buyWhatIsLeft: opens("buyWhatIsLeft"),
    settle: opens("settle"),
    advance: opens("advance"),
    checkTheBank: opens("checkTheBank"),
    economics: opens("economics"),
    amend: opens("amend"),
    // Once, however often it is pressed while the first is on its way: a second press lands on a Venture that
    // has already moved and comes back refused, straight after the toast saying it worked.
    startBuying: (one) => {
      if (!moving.isPending) {
        moving.mutate({ id: one.id });
      }
    },
    startFattening: (one) => {
      if (!fattening.isPending) {
        fattening.mutate({ id: one.id });
      }
    },
  };
  /** The Venture a sheet is showing, which is a Venture only while that sheet is the one on show. */
  const stagedOn = (act: ActOnOneVenture): Venture | null =>
    staged?.act === act ? staged.venture : null;
  /** Closing is the sheets' only say over what is staged; opening is the buttons'. */
  const closes = (wanted: boolean) => {
    if (!wanted) {
      setStaged(null);
    }
  };
  /** Everything a sheet about one Venture is given. */
  const staging = (act: ActOnOneVenture) => ({
    onOpenChange: closes,
    open: staged?.act === act,
    venture: stagedOn(act),
  });
  const sheets = (
    <>
      <TakeCapitalSheet
        {...staging("takeCapital")}
        agreementId={
          staged?.act === "takeCapital" ? (staged.agreementId ?? null) : null
        }
      />
      <BankCheckSheet {...staging("checkTheBank")} />
      <AdvanceSheet {...staging("advance")} />
      <ReimburseSheet {...staging("reimburse")} />
      <SettlementSheet {...staging("settle")} />
      <BuyWhatIsLeftSheet {...staging("buyWhatIsLeft")} />
      <CountFloatSheet {...staging("countFloat")} />
      <DrawFloatSheet {...staging("drawFloat")} />
      <CallOffSheet {...staging("callOff")} />
      <AmendSheet {...staging("amend")} />
      <EconomicsSheet {...staging("economics")} />
      <SignAgreementSheet {...staging("sign")} />
    </>
  );
  return { acts, sheets };
};
