import type { MessageKey } from "@OpenFarm/i18n";
import { formatNumber } from "@OpenFarm/i18n";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@OpenFarm/ui/components/sheet";
import { useQuery } from "@tanstack/react-query";

import {
  Loaded,
  Notice,
  Section,
  StatusBadge,
  TagChip,
} from "@/components/page";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

type Settlement = Awaited<ReturnType<typeof orpc.ventures.settlement.call>>;
type Block = Settlement["blocks"][number];
type ChargeWord = Settlement["charges"][number]["word"];

/** What each charge against a Venture is called, in the reader's own language. */
const CHARGE_WORD = {
  bought: "costs.bought",
  hasil: "costs.hasil",
  trips: "costs.trips",
  feed: "ventures.feed",
  medicine: "ventures.medicine",
  vet: "ventures.vet",
  herd: "ventures.herdCosts",
} as const satisfies Record<ChargeWord, MessageKey>;

/** What each thing standing in the way is called. Bound to the words the farm can actually send, so a
 *  new one fails here rather than printing an empty line. */
const BLOCK_WORD = {
  agreements_disagree: "refusal.agreementsDisagree",
  an_animal_still_stands: "refusal.anAnimalStillStands",
  a_price_is_missing: "refusal.aPriceIsMissing",
  a_float_is_open: "refusal.aFloatIsOpen",
  a_reimbursement_is_owed: "refusal.aReimbursementIsOwed",
  the_bank_disagrees: "refusal.theBankDisagrees",
} as const satisfies Record<Block["word"], MessageKey>;

/** Taka as the reader reads them, in the reader's own numerals. */
const useTaka = () => {
  const { language } = useLanguage();
  return (amount: number) => `৳${formatNumber(amount, language)}`;
};

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
  bdt,
  made,
  lost,
}: {
  bdt: number;
  made: MessageKey;
  lost: MessageKey;
}) => {
  const { t } = useLanguage();
  const taka = useTaka();
  const down = bdt < 0;
  return (
    <div className={down ? "text-amber-700 dark:text-amber-500" : ""}>
      <Line label={t(down ? lost : made)} strong>
        {taka(Math.abs(bdt))}
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
  const { t } = useLanguage();
  const said = [
    block.neverRead.length === 0
      ? null
      : t("ventures.neverRead", { months: block.neverRead.join(", ") }),
    block.stale.length === 0
      ? null
      : t("ventures.wentStale", { months: block.stale.join(", ") }),
    block.disagreed.length === 0
      ? null
      : t("ventures.didNotAgree", { months: block.disagreed.join(", ") }),
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
  const taka = useTaka();
  const count = (howMany: number) => formatNumber(howMany, language);
  switch (block.word) {
    case "an_animal_still_stands": {
      return (
        <span className="flex flex-wrap gap-1">
          {block.tagNumbers.map((tag) => (
            <TagChip key={tag}>{tag}</TagChip>
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
      return <span>{taka(block.openFloatBdt)}</span>;
    }
    case "a_reimbursement_is_owed": {
      return <span>{block.months.join(", ")}</span>;
    }
    case "the_bank_disagrees": {
      return <WhatTheBankSays block={block} />;
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
const WhatItCameTo = ({ settlement }: { settlement: Settlement }) => {
  const { t } = useLanguage();
  const taka = useTaka();
  return (
    <Section plain title={t("ventures.whatItMade")}>
      <div className="bg-muted flex flex-col gap-1 rounded-md px-3 py-2 text-sm">
        <Line label={t("ventures.proceeds")}>
          {taka(settlement.proceedsBdt)}
        </Line>
        {settlement.charges.map((one) => (
          <Line key={one.word} label={`· ${t(CHARGE_WORD[one.word])}`}>
            {taka(one.bdt)}
          </Line>
        ))}
        <Line label={t("ventures.charged")}>{taka(settlement.chargedBdt)}</Line>
        <div className="mt-1 border-t pt-1">
          <Outcome
            bdt={settlement.profitBdt}
            lost="ventures.loss"
            made="ventures.profit"
          />
        </div>
      </div>
    </Section>
  );
};

/** How the profit divides: the Investors' share, what a Unit takes, and the Farm's. */
const HowItSplits = ({ settlement }: { settlement: Settlement }) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  return (
    <Section plain title={t("ventures.howItSplits")}>
      <div className="flex flex-col gap-1 text-sm">
        <Line
          label={t("ventures.investorsShare", {
            percent: formatNumber(settlement.investorsPercent, language),
          })}
        >
          {taka(settlement.investorsBdt)}
        </Line>
        <Outcome
          bdt={settlement.perUnitBdt}
          lost="ventures.perUnitLoss"
          made="ventures.perUnit"
        />
        {settlement.roundingBdt === 0 ? null : (
          <Line label={t("ventures.rounding")}>
            {taka(settlement.roundingBdt)}
          </Line>
        )}
        <Line label={t("ventures.theFarms")}>{taka(settlement.farmBdt)}</Line>
      </div>
    </Section>
  );
};

/** What the account holds for all of it to come out of, and what of that is the Owner's own money. */
const WhatTheAccountHolds = ({ settlement }: { settlement: Settlement }) => {
  const { t } = useLanguage();
  const taka = useTaka();
  return (
    <Section plain title={t("ventures.whatItHolds")}>
      <div className="flex flex-col gap-1 text-sm">
        <Line label={t("ventures.held")}>{taka(settlement.capitalBdt)}</Line>
        {settlement.advanceBdt === 0 ? null : (
          <Line label={t("ventures.owedToYou")}>
            {taka(settlement.advanceBdt)}
          </Line>
        )}
        <Line label={t("ventures.balance")} strong>
          {taka(settlement.balanceBdt)}
        </Line>
      </div>
    </Section>
  );
};

/** What each Investor would be paid: his capital back, and what his Units took of the profit. */
const WhatEachIsOwed = ({ settlement }: { settlement: Settlement }) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  return (
    <Section plain title={t("ventures.whatEachIsPaid")}>
      <div className="flex flex-col gap-2">
        {settlement.payouts.map((one) => (
          <div className="border-t pt-2 text-sm" key={one.agreementId}>
            <Line label={one.name} strong>
              {taka(one.payoutBdt)}
            </Line>
            <Line
              label={t("ventures.unitsHeld", {
                units: formatNumber(one.units, language),
              })}
            >
              {/* Taken away where his Units lost money: a plus sign in front of a negative figure is
                  how a loss reads as a gain. */}
              {one.shareBdt < 0
                ? `${taka(one.capitalBdt)} − ${taka(Math.abs(one.shareBdt))}`
                : `${taka(one.capitalBdt)} + ${taka(one.shareBdt)}`}
            </Line>
          </div>
        ))}
      </div>
    </Section>
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
  const settlement = useQuery({
    ...orpc.ventures.settlement.queryOptions({
      input: { ventureId: venture?.id ?? "" },
    }),
    enabled: venture !== null,
  });
  const it = settlement.data;
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
          <Loaded query={settlement}>
            {it ? (
              <div className="flex flex-col gap-4">
                <WhatBlocksIt blocks={it.blocks} />
                <WhatItCameTo settlement={it} />
                <HowItSplits settlement={it} />
                <WhatTheAccountHolds settlement={it} />
                <WhatEachIsOwed settlement={it} />
              </div>
            ) : null}
          </Loaded>
        </div>
      </SheetContent>
    </Sheet>
  );
};
