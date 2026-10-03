import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@OpenFarm/ui/components/sheet";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { TagLink } from "@/components/fattening/fattening-words";
import { Loaded, Notice, Section, StatusBadge } from "@/components/page";
import {
  Adjustments,
  RaiseAdjustmentSheet,
  WaiveAdjustmentSheet,
} from "@/components/ventures/adjustments";
import { PayOutSheet } from "@/components/ventures/settling-up";
import { useLanguage } from "@/i18n/language-provider";
import { CHARGE_WORD } from "@/lib/charge-words";
import { useMoney } from "@/lib/money";
import { saidMonth } from "@/lib/months";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

type Settlement = Awaited<ReturnType<typeof orpc.ventures.settlement.get.call>>;
type Approved = NonNullable<
  Awaited<ReturnType<typeof orpc.ventures.settlement.approved.call>>
>;
type Block = Settlement["blocks"][number];

/**
 * What a Settlement's figures are, whether they are still being worked out or were frozen at approval.
 *
 * Once approved, what an Investor is shown is what he was shown on the day — so from then on the screen
 * reads the frozen row, and never the live sum, which a late cost may already have moved.
 */
type Figures = Omit<Settlement, "blocks" | "units">;

/** The frozen answer read as the same figures the working one gives, so one set of panels draws both. */
const asFigures = (approved: Approved): Figures => ({
  ...approved,
  payouts: approved.shares,
});

/** What each thing standing in the way is called. Bound to the words the farm can actually send, so a
 *  new one fails here rather than printing an empty line. */
const BLOCK_WORD = {
  agreements_disagree: "refusal.agreementsDisagree",
  an_animal_still_stands: "refusal.anAnimalStillStands",
  a_price_is_missing: "refusal.aPriceIsMissing",
  a_float_is_open: "refusal.aFloatIsOpen",
  sale_cash_in_a_hand: "refusal.saleCashInAHand",
  a_reimbursement_is_owed: "refusal.aReimbursementIsOwed",
  the_account_does_not_add_up: "refusal.theAccountDoesNotAddUp",
  the_bank_disagrees: "refusal.theBankDisagrees",
  nobody_has_signed: "refusal.nobodyHasSigned",
} as const satisfies Record<Block["word"], MessageKey>;

const Line = ({
  label,
  children,
  strong,
}: {
  label: string;
  children: React.ReactNode;
  strong?: boolean;
}) => (
  <div className={`flex justify-between gap-2 ${strong ? "font-medium" : ""}`}>
    <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
    <span className="tabular-nums">{children}</span>
  </div>
);

/**
 * A figure that may have gone the wrong way, said as what it is.
 *
 * A loss is not a small profit, and reading it off a minus sign tucked in after the taka mark is how an
 * Owner learns her run lost money by squinting. It is called a loss, shown as a figure without a sign,
 * and marked — so she knows before she has read the number.
 */
const Outcome = ({
  amount,
  made,
  lost,
}: {
  amount: number;
  made: MessageKey;
  lost: MessageKey;
}) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  const down = amount < 0;
  return (
    <div className={down ? "text-warning" : ""}>
      <Line label={t(down ? lost : made)} strong>
        {asMoney(Math.abs(amount))}
      </Line>
    </div>
  );
};

/**
 * Which months the bank has not agreed to, told apart — and what each needs doing about it.
 *
 * A month nobody ever opened the statement for wants opening, one the farm has since changed its mind
 * about wants reading again, and one the statement plainly disagreed with wants explaining. Three
 * different afternoons, so never one list.
 */
const WhatTheBankSays = ({
  block,
}: {
  block: Extract<Block, { word: "the_bank_disagrees" }>;
}) => {
  const { t, language } = useLanguage();
  // Worded, not joined raw: "2026-08" inside a Bangla sentence is the defect `saidMonth` exists for,
  // and the Venture's own card has said আগস্ট ২০২৬ for it all along.
  const months = (list: string[]) =>
    list.map((month) => saidMonth(month, language)).join(", ");
  const said = [
    block.neverRead.length === 0
      ? null
      : t("ventures.neverRead", { months: months(block.neverRead) }),
    block.stale.length === 0
      ? null
      : t("ventures.wentStale", { months: months(block.stale) }),
    block.disagreed.length === 0
      ? null
      : t("ventures.didNotAgree", { months: months(block.disagreed) }),
  ].filter((one) => one !== null);
  return (
    <>
      {said.map((one) => (
        <p key={one}>{one}</p>
      ))}
    </>
  );
};

/**
 * What one thing standing in the way is about, in the reader's own numerals.
 *
 * Never the word alone: told only that a price is missing she has nowhere to go; told which three
 * hundred kilos, she has an afternoon's work.
 */
const WhatItIsAbout = ({ block }: { block: Block }) => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  const count = (howMany: number) => formatNumber(howMany, language);
  switch (block.word) {
    case "an_animal_still_stands": {
      return (
        <span className="flex flex-wrap gap-1">
          {/* Each a way to her page, where what stands in the way is dealt with. */}
          {block.tagNumbers.map((tag) => (
            <TagLink key={tag} tagNumber={tag} />
          ))}
        </span>
      );
    }
    case "a_price_is_missing": {
      return (
        <span>
          {[
            block.unpricedKg === 0
              ? null
              : t("ventures.unpricedKg", { kg: count(block.unpricedKg) }),
            block.uncostedDoses === 0
              ? null
              : t("ventures.uncostedDoses", {
                  doses: count(block.uncostedDoses),
                }),
          ]
            .filter((one) => one !== null)
            .join(" · ")}
        </span>
      );
    }
    case "a_float_is_open": {
      return <span>{asMoney(block.openFloatMoney)}</span>;
    }
    case "sale_cash_in_a_hand": {
      return (
        <span className="flex flex-wrap items-center gap-1">
          {block.tagNumbers.map((tag) => (
            <TagLink key={tag} tagNumber={tag} />
          ))}
          <span>· {block.hands.join(", ")}</span>
        </span>
      );
    }
    case "a_reimbursement_is_owed": {
      // The months never repaid, and what months already repaid have moved by since — the next Reimbursement carries
      // it. Missing from an answer cached before it was said.
      const carry = block.carryMoney ?? 0;
      return (
        <span>
          {[
            block.months.length === 0
              ? null
              : block.months
                  .map((month) => saidMonth(month, language))
                  .join(", "),
            carry === 0
              ? null
              : t(carry > 0 ? "ventures.toCarry" : "ventures.toCarryBack", {
                  amount: asMoney(Math.abs(carry)),
                }),
          ]
            .filter((one) => one !== null)
            .join(" · ")}
        </span>
      );
    }
    case "the_bank_disagrees": {
      return <WhatTheBankSays block={block} />;
    }
    // Over, the account holds money nobody has explained; short, it cannot pay what the sum says it owes.
    case "the_account_does_not_add_up": {
      return (
        <span>
          {block.overMoney > 0
            ? t("ventures.accountOver", { amount: asMoney(block.overMoney) })
            : t("ventures.accountShort", { amount: asMoney(-block.overMoney) })}
        </span>
      );
    }
    // Its title says the whole of it: there is nobody to settle with.
    case "nobody_has_signed": {
      return null;
    }
    default: {
      return (
        <span>{block.percents.map((one) => `${count(one)}%`).join(" · ")}</span>
      );
    }
  }
};

/** Everything that makes this Settlement a guess, each saying what it is about. */
const WhatBlocksIt = ({ blocks }: { blocks: readonly Block[] }) => {
  const { t } = useLanguage();
  if (blocks.length === 0) {
    return (
      <StatusBadge tone="success">{t("ventures.nothingBlocksIt")}</StatusBadge>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {blocks.map((one) => (
        <Notice key={one.word} title={t(BLOCK_WORD[one.word])} tone="warning">
          <WhatItIsAbout block={one} />
        </Notice>
      ))}
    </div>
  );
};

/** What the run made: what its Animals fetched, every charge as its own line, and the profit. */
const WhatItCameTo = ({ settlement }: { settlement: Figures }) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  return (
    <Section plain title={t("ventures.whatItMade")}>
      <div className="bg-muted flex flex-col gap-1 rounded-md px-3 py-2 text-sm">
        <Line label={t("ventures.proceeds")}>
          {asMoney(settlement.proceedsMoney)}
        </Line>
        {settlement.charges.map((one) => (
          <Line key={one.word} label={`· ${t(CHARGE_WORD[one.word])}`}>
            {asMoney(one.amount)}
          </Line>
        ))}
        <Line label={t("ventures.charged")}>
          {asMoney(settlement.chargedMoney)}
        </Line>
        <div className="mt-1 border-t pt-1">
          <Outcome
            amount={settlement.profitMoney}
            lost="ventures.loss"
            made="ventures.profit"
          />
        </div>
      </div>
    </Section>
  );
};

/** How the profit divides: the Investors' share, what a Unit takes, and the Farm's. */
const HowItSplits = ({ settlement }: { settlement: Figures }) => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  return (
    <Section plain title={t("ventures.howItSplits")}>
      <div className="flex flex-col gap-1 text-sm">
        <Line
          label={t("ventures.investorsShare", {
            percent: formatNumber(settlement.investorsPercent, language),
          })}
        >
          {asMoney(settlement.investorsMoney)}
        </Line>
        <Outcome
          amount={settlement.perUnitMoney}
          lost="ventures.perUnitLoss"
          made="ventures.perUnit"
        />
        {settlement.roundingMoney === 0 ? null : (
          <Line label={t("ventures.rounding")}>
            {asMoney(settlement.roundingMoney)}
          </Line>
        )}
        <Line label={t("ventures.theFarms")}>
          {asMoney(settlement.farmMoney)}
        </Line>
      </div>
    </Section>
  );
};

/** What the account holds for all of it to come out of, and what of that is the Owner's own money. */
const WhatTheAccountHolds = ({
  settlement,
  heldNowMoney,
}: {
  settlement: Figures;
  /** What the account holds today. After approval the frozen figure is what it held on the day, and the
   *  two part company as the money goes out — the closing nothing is only visible in this one. */
  heldNowMoney: number | undefined;
}) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  const moved =
    heldNowMoney !== undefined && heldNowMoney !== settlement.balanceMoney;
  return (
    <Section plain title={t("ventures.whatItHolds")}>
      <div className="flex flex-col gap-1 text-sm">
        <Line label={t("ventures.held")}>
          {asMoney(settlement.capitalMoney)}
        </Line>
        {settlement.advanceMoney === 0 ? null : (
          <Line label={t("ventures.owedToYou")}>
            {asMoney(settlement.advanceMoney)}
          </Line>
        )}
        <Line
          label={moved ? t("ventures.heldWhenApproved") : t("ventures.balance")}
          strong={!moved}
        >
          {asMoney(settlement.balanceMoney)}
        </Line>
        {moved ? (
          <Line label={t("ventures.balance")} strong>
            {asMoney(heldNowMoney)}
          </Line>
        ) : null}
      </div>
    </Section>
  );
};

/** What each Investor would be paid: his capital back, and what his Units took of the profit. */
const WhatEachIsOwed = ({ settlement }: { settlement: Figures }) => {
  const { t, language } = useLanguage();
  const asMoney = useMoney();
  return (
    <Section plain title={t("ventures.whatEachIsPaid")}>
      <div className="flex flex-col gap-2">
        {settlement.payouts.map((one) => (
          <div className="border-t pt-2 text-sm" key={one.agreementId}>
            <Line label={one.name} strong>
              {asMoney(one.payoutMoney)}
            </Line>
            <Line
              label={t("ventures.unitsHeld", {
                units: formatNumber(one.units, language),
              })}
            >
              {/* Taken away where his Units lost money: a plus sign in front of a negative figure is
                  how a loss reads as a gain. */}
              {one.shareMoney < 0
                ? `${asMoney(one.capitalMoney)} − ${asMoney(Math.abs(one.shareMoney))}`
                : `${asMoney(one.capitalMoney)} + ${asMoney(one.shareMoney)}`}
            </Line>
          </div>
        ))}
      </div>
    </Section>
  );
};

/** Approving, which is what makes the figures stop moving. Offered only once nothing is in the way. */
const Approve = ({ ventureId }: { ventureId: string }) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const approving = useMutation(
    orpc.ventures.settlement.approve.mutationOptions({
      onError: refused,
      onSuccess: () => {
        toast.success(t("ventures.approved"));
      },
    })
  );
  return (
    <Button
      disabled={approving.isPending}
      onClick={() => approving.mutate({ ventureId })}
      type="button"
    >
      {t("ventures.approve")}
    </Button>
  );
};

/**
 * What is left to send, once the Settlement is approved.
 *
 * In the order the money really goes: the Owner's own back first, because she put it in to feed their
 * animals and it returns at cost before any capital does; then each Investor — from his own row on the Investors
 * tab; then the Farm's own share, which leaves for the Farm's books so the account closes at nothing.
 */
const WhatIsLeftToSend = ({
  ventureId,
  approved,
  onPay,
}: {
  ventureId: string;
  approved: Approved;
  onPay: (what: {
    ventureId: string;
    kind: "advance" | "share" | "farm" | "farmLoss";
    title: string;
    amountMoney: number;
    agreementId?: string;
  }) => void;
}) => {
  const { t } = useLanguage();
  const asMoney = useMoney();
  // Said as its own name because the guard against untranslated JSX text reads a comparison's angle bracket
  // as the end of a tag.
  const farmOwesALoss = approved.farmMoney < 0;
  return (
    <Section plain title={t("ventures.whatIsLeftToSend")}>
      <div className="flex flex-col gap-2 text-sm">
        {/* First, because it comes first: until the Farm has put in its share of a loss, the account holds
            less than the payouts under it add up to. */}
        {!farmOwesALoss || approved.farmSharePaid ? null : (
          <div className="flex items-center justify-between gap-2">
            <span>{t("ventures.farmsLoss")}</span>
            <span className="flex items-center gap-2">
              <span className="tabular-nums">
                {asMoney(-approved.farmMoney)}
              </span>
              <Button
                onClick={() =>
                  onPay({
                    ventureId,
                    kind: "farmLoss",
                    title: t("ventures.farmsLoss"),
                    amountMoney: -approved.farmMoney,
                  })
                }
                size="sm"
                type="button"
                variant="outline"
              >
                {t("ventures.payIn")}
              </Button>
            </span>
          </div>
        )}
        {approved.advanceMoney === 0 || approved.advanceRepaid ? null : (
          <div className="flex items-center justify-between gap-2">
            <span>{t("ventures.owedToYou")}</span>
            <span className="flex items-center gap-2">
              <span className="tabular-nums">
                {asMoney(approved.advanceMoney)}
              </span>
              <Button
                onClick={() =>
                  onPay({
                    ventureId,
                    kind: "advance",
                    title: t("ventures.owedToYou"),
                    amountMoney: approved.advanceMoney,
                  })
                }
                size="sm"
                type="button"
                variant="outline"
              >
                {t("ventures.send")}
              </Button>
            </span>
          </div>
        )}
        {/* Each Investor's payout is sent from his own row on the Investors tab, beside his Units and his papers:
            the sheet does not list the same men again. */}
        {approved.shares.length === 0 ? null : (
          <p className="text-muted-foreground">
            {t("ventures.payoutsOnTheirRows")}
          </p>
        )}
        {approved.farmMoney <= 0 || approved.farmSharePaid ? null : (
          <div className="flex items-center justify-between gap-2">
            <span>{t("ventures.theFarms")}</span>
            <span className="flex items-center gap-2">
              <span className="tabular-nums">
                {asMoney(approved.farmMoney)}
              </span>
              <Button
                onClick={() =>
                  onPay({
                    ventureId,
                    kind: "farm",
                    title: t("ventures.theFarms"),
                    amountMoney: approved.farmMoney,
                  })
                }
                size="sm"
                type="button"
                variant="outline"
              >
                {t("ventures.send")}
              </Button>
            </span>
          </div>
        )}
        {approved.allPaid ? (
          <StatusBadge tone="success">{t("ventures.allPaid")}</StatusBadge>
        ) : null}
      </div>
    </Section>
  );
};

/**
 * A Venture settling up: what it comes to, how it divides, and what is left to do about it.
 *
 * Lifted out of the sheet so that reading a Settlement is one thing and opening the sheet is another.
 */
const SettlingUp = ({
  venture,
  approved,
  figures,
  blocks,
  heldNowMoney,
  onPay,
  onRaise,
  onWaive,
}: {
  venture: { id: string; name: string } | null;
  approved: Approved | null;
  figures: Figures;
  /** What still stands in the way, which only an unapproved Settlement has. */
  blocks: readonly Block[];
  /** What the account holds today, which the frozen figures stop telling after approval. */
  heldNowMoney: number | undefined;
  onPay: (what: Parameters<typeof PayOutSheet>[0]["what"]) => void;
  onRaise: () => void;
  onWaive: (what: Parameters<typeof WaiveAdjustmentSheet>[0]["what"]) => void;
}) => {
  const { t, language } = useLanguage();
  return (
    <div className="flex flex-col gap-4">
      {approved ? (
        <StatusBadge tone="success">
          {t("ventures.approvedOn", {
            day: formatDate(new Date(approved.approvedAt), language, "date"),
          })}
        </StatusBadge>
      ) : (
        <WhatBlocksIt blocks={blocks} />
      )}
      <WhatItCameTo settlement={figures} />
      <HowItSplits settlement={figures} />
      <WhatTheAccountHolds heldNowMoney={heldNowMoney} settlement={figures} />
      {approved ? (
        <Adjustments
          approved={approved}
          onPay={(what) =>
            onPay({
              ventureId: venture?.id ?? "",
              kind: "adjustment",
              title: t("ventures.everyInvestor"),
              amountMoney: what.amountMoney,
              adjustmentId: what.adjustmentId,
            })
          }
          onRaise={onRaise}
          onWaive={(adjustmentId) =>
            onWaive({ ventureId: venture?.id ?? "", adjustmentId })
          }
        />
      ) : null}
      {approved ? (
        <WhatIsLeftToSend
          approved={approved}
          onPay={onPay}
          ventureId={venture?.id ?? ""}
        />
      ) : (
        <WhatEachIsOwed settlement={figures} />
      )}
      {approved || blocks.length !== 0 ? null : (
        <Approve ventureId={venture?.id ?? ""} />
      )}
    </div>
  );
};

/**
 * The close-out of a Venture, read before anything is done.
 *
 * What its Animals fetched, every charge as its own line, the Owner's Advance, capital, the profit and
 * how it splits — and, above all of it, whatever still makes it a guess. The figures come either way,
 * because an Owner told only "no" has nothing to go and put right, and she is owed the shape of the
 * answer while she is chasing the last weigh-in that would finish it.
 *
 * Nothing is drawn until the farm has answered. "Nothing is in the way", said over a screen of zeroes
 * because the question has not come back yet, is the one thing this screen must never say.
 */
export const SettlementSheet = ({
  venture,
  open,
  onOpenChange,
}: {
  venture: { id: string; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const [paying, setPaying] =
    useState<Parameters<typeof PayOutSheet>[0]["what"]>(null);
  const [raising, setRaising] = useState(false);
  const [waiving, setWaiving] =
    useState<Parameters<typeof WaiveAdjustmentSheet>[0]["what"]>(null);
  const working = useQuery({
    ...orpc.ventures.settlement.get.queryOptions({
      input: { ventureId: venture?.id ?? "" },
    }),
    enabled: venture !== null,
  });
  const frozen = useQuery({
    ...orpc.ventures.settlement.approved.queryOptions({
      input: { ventureId: venture?.id ?? "" },
    }),
    enabled: venture !== null,
  });
  // Not known until the frozen answer is in: `null` means "nobody has approved" only once the farm has
  // said so, and until then it means "nobody has asked yet". Reading them as the same thing shows a live
  // sum and an Approve button over a Settlement that was approved last week.
  const settled = frozen.isPending || frozen.isError ? undefined : frozen.data;
  const approved = settled ?? null;
  // Once approved, what she reads is what was written down — never the live sum, which a cost landing
  // since may already have moved.
  const it = approved ? asFigures(approved) : working.data;
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg"
        closeLabel={t("common.close")}
      >
        <SheetHeader className="border-b">
          <SheetTitle>{venture?.name ?? t("ventures.settlement")}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          <Loaded query={frozen.isPending || frozen.isError ? frozen : working}>
            {it && settled !== undefined ? (
              <SettlingUp
                approved={approved}
                figures={it}
                onPay={setPaying}
                onRaise={() => setRaising(true)}
                onWaive={setWaiving}
                heldNowMoney={working.data?.balanceMoney}
                blocks={working.data?.blocks ?? []}
                venture={venture}
              />
            ) : null}
          </Loaded>
        </div>
      </SheetContent>
      <PayOutSheet
        onOpenChange={(wanted) => {
          if (!wanted) {
            setPaying(null);
          }
        }}
        open={paying !== null}
        what={paying}
      />
      <RaiseAdjustmentSheet
        onOpenChange={setRaising}
        open={raising}
        venture={venture}
      />
      <WaiveAdjustmentSheet
        onOpenChange={(wanted) => {
          if (!wanted) {
            setWaiving(null);
          }
        }}
        open={waiving !== null}
        what={waiving}
      />
    </Sheet>
  );
};
