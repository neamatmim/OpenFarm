import type { PaperDocument, PaymentMethod } from "@OpenFarm/domain";
import { PAYMENT_METHODS, startOfFarmDay } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FileText, ReceiptText, ShieldCheck, Truck } from "lucide-react";
import { useState } from "react";

import {
  CorrectionAnswer,
  CorrectionDialog,
  useCorrecting,
  CorrectionChoice,
} from "@/components/correction-dialog";
import { WhatSheCost } from "@/components/costs";
import { Section } from "@/components/page";
import type { AccountTyped } from "@/components/payment-method";
import {
  FarmAccountField,
  PAYMENT_METHOD_WORD,
} from "@/components/payment-method";
import { ReceivableOwed } from "@/components/receivable-fields";
import { DairyReturnsPanel } from "@/components/returns/dairy-returns";
import { SaleCorrection } from "@/components/sale-correction";
import { useSalePapers } from "@/components/sale/sale-papers";
import { PaperDialog } from "@/components/ventures/paper-dialog";
import { useLanguage } from "@/i18n/language-provider";
import type { Answer, Answers } from "@/lib/correcting";
import {
  amount,
  choice,
  counterparty,
  figure,
  isWholeWindow,
  targetWindow,
  voiding,
  withWindowDay,
} from "@/lib/correcting";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

import { Fact, FactGrid } from "./animal-facts";
import type { AnimalDetail, AnimalPowers } from "./animal-types";

/**
 * Whose animal she is, as a Correction answers it: a Venture, or the Farm's own.
 *
 * Its own answer rather than `choice`, because here **nothing is a real answer**: the Farm owning her
 * is not the absence of an owner, it is an owner. So every option is a value and the sentinel stands
 * for the Farm rather than for "unchanged" — which `same` decides instead.
 */
const THE_FARMS = "the-farms-own";

const whoseSheIs = (
  held: string | null
): Answer<string | null, string | null> => ({
  holds: held,
  shows: held ?? THE_FARMS,
  sends: (typed) => (typed === THE_FARMS ? null : typed),
  same: (typed) => (typed === THE_FARMS ? held === null : typed === held),
  couldBeSent: () => true,
});

/** The outing she came home on, as a Correction answers it: one of the farm's, or none — the farm gate — which is an
 *  answer of its own, as the Farm is for whose she is. */
const NO_OUTING = "no-outing";

const outingOf = (
  held: string | null
): Answer<string | null, string | null> => ({
  holds: held,
  shows: held ?? NO_OUTING,
  sends: (typed) => (typed === NO_OUTING ? null : typed),
  same: (typed) => (typed === NO_OUTING ? held === null : typed === held),
  couldBeSent: () => true,
});

/** The window the Farm sells her in, as two date boxes — said afresh, with why, for one a Correction makes the Farm's. */
const WindowAnswers = ({
  correcting,
  forTheFarmFrom,
}: {
  correcting: Correcting;
  /** The Venture she is leaving for the Farm's own, whose window was never the Farm's choice; nothing where none. */
  forTheFarmFrom: string | null;
}) => {
  const { t } = useLanguage();
  const typedWindow = correcting.typed.targetWindow ?? "";
  const [start = "", end = ""] = typedWindow.split("|");
  return (
    <>
      <CorrectionAnswer
        label={t("intake.windowStart")}
        onChange={(value) =>
          correcting.set(
            "targetWindow",
            withWindowDay(typedWindow, "start", value)
          )
        }
        type="date"
        value={start}
      />
      <CorrectionAnswer
        label={t("intake.windowEnd")}
        onChange={(value) =>
          correcting.set(
            "targetWindow",
            withWindowDay(typedWindow, "end", value)
          )
        }
        type="date"
        value={end}
      />
      {forTheFarmFrom === null ? null : (
        <p className="text-muted-foreground text-xs">
          {t("correct.windowForTheFarm", { venture: forTheFarmFrom })}
        </p>
      )}
    </>
  );
};

type Correcting = ReturnType<typeof useCorrecting>;

/** An Intake's own figures as a Correction's boxes: what she cost, the toll, who sold her, and what she weighed and was
 *  judged off the lorry. */
const ArrivalAnswers = ({ correcting }: { correcting: Correcting }) => {
  const { t } = useLanguage();
  return (
    <>
      <CorrectionAnswer
        inputMode="numeric"
        label={t("intake.price")}
        onChange={(value) => correcting.set("purchasePriceMoney", value)}
        type="number"
        value={correcting.typed.purchasePriceMoney ?? ""}
      />
      <CorrectionAnswer
        inputMode="numeric"
        label={t("intake.market_toll")}
        onChange={(value) => correcting.set("marketTollMoney", value)}
        type="number"
        value={correcting.typed.marketTollMoney ?? ""}
      />
      <CorrectionAnswer
        label={t("correct.seller")}
        onChange={(value) => correcting.set("seller", value)}
        value={correcting.typed.seller ?? ""}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <CorrectionAnswer
          inputMode="decimal"
          label={t("intake.weight")}
          onChange={(value) => correcting.set("weightKg", value)}
          type="number"
          value={correcting.typed.weightKg ?? ""}
        />
        <CorrectionAnswer
          inputMode="numeric"
          label={t("intake.age")}
          onChange={(value) => correcting.set("estimatedAgeMonths", value)}
          type="number"
          value={correcting.typed.estimatedAgeMonths ?? ""}
        />
      </div>
    </>
  );
};

/** How she was paid for as the Correction would leave it: what was chosen, else what was. */
const paidByOf = (
  typed: string | undefined,
  held: PaymentMethod | null | undefined
): PaymentMethod | null => (typed || held || null) as PaymentMethod | null;

/** The Farm Account and transaction ID a Correction names afresh, beside the answers `useCorrecting` keeps: an object
 *  of two boxes rather than one answer, as the wage draw's is. */
const useAccountNamed = (held: {
  farmAccountId?: string | null;
  reference?: string | null;
}) => {
  const namedNow: AccountTyped = {
    farmAccountId: held.farmAccountId ?? "",
    reference: held.reference ?? "",
  };
  const [account, setAccount] = useState<AccountTyped>(namedNow);
  const reference = account.reference.trim();
  /** The change to send, where money not paid in cash names another account or another transaction ID. */
  const changeFor = (paidBy: PaymentMethod | null) =>
    paidBy !== null &&
    paidBy !== "cash" &&
    account.farmAccountId !== "" &&
    reference !== "" &&
    (account.farmAccountId !== namedNow.farmAccountId ||
      reference !== namedNow.reference)
      ? {
          from: {
            farmAccountId: held.farmAccountId ?? null,
            reference: held.reference ?? null,
          },
          to: { farmAccountId: account.farmAccountId, reference },
        }
      : undefined;
  return {
    account,
    handleAccount: setAccount,
    reset: () => setAccount(namedNow),
    changeFor,
  };
};

/** The outing she came home on: none, or one of the farm's recent ones — and hers, wherever it is, so the box shows it. */
const OutingChoice = ({
  held,
  value,
  onChange,
}: {
  held: { id: string; wentTo: string } | null;
  value: string;
  onChange: (value: string) => void;
}) => {
  const { t, language } = useLanguage();
  const trips = useQuery(orpc.buyingTrips.list.queryOptions());
  const recent = trips.data ?? [];
  const outings: { id: string; wentTo: string; wentOn?: Date | string }[] = [
    ...(held && !recent.some((one) => one.id === held.id) ? [held] : []),
    ...recent,
  ];
  return (
    <CorrectionChoice
      label={t("intake.trip")}
      onChange={onChange}
      options={[
        { value: NO_OUTING, label: t("intake.noTrip") },
        // Named with its day, where the farm has it: one livestock market is gone to week after week.
        ...outings.map((one) => ({
          value: one.id,
          label: one.wentOn
            ? `${one.wentTo} · ${formatDate(new Date(one.wentOn), language, "date")}`
            : one.wentTo,
        })),
      ]}
      value={value}
    />
  );
};

/** How she was paid for, and — for money not paid in cash — the Farm Account and its transaction ID. */
const PaidForFields = ({
  id,
  held,
  paidBy,
  onChoose,
  account,
  onAccount,
}: {
  id: string;
  held: PaymentMethod;
  paidBy: PaymentMethod | null;
  onChoose: (value: string) => void;
  account: AccountTyped;
  onAccount: (account: AccountTyped) => void;
}) => {
  const { t } = useLanguage();
  return (
    <>
      <CorrectionChoice
        label={t("money.paidBy")}
        onChange={onChoose}
        options={PAYMENT_METHODS.map((method) => ({
          value: method,
          label: t(PAYMENT_METHOD_WORD[method]),
        }))}
        value={paidBy ?? held}
      />
      {paidBy === "mobile_money" || paidBy === "bank" ? (
        <>
          <FarmAccountField
            id={`intake-account-${id}`}
            kind={paidBy}
            onChange={(farmAccountId) =>
              onAccount({ ...account, farmAccountId })
            }
            value={account.farmAccountId}
          />
          <CorrectionAnswer
            label={t("money.reference")}
            onChange={(typed) => onAccount({ ...account, reference: typed })}
            value={account.reference}
          />
        </>
      ) : null}
    </>
  );
};

/** An Intake as her page holds it, which is what its Correction starts from. */
interface IntakeHeld {
  id: string;
  purchasePriceMoney: number;
  marketTollMoney: number;
  sellerName: string | null;
  /** As her page shows it: her Venture's where she is one's. */
  targetWindow: { start: string; end: string };
  buyingTrip: { id: string; wentTo: string } | null;
  weightKg: number;
  estimatedAgeMonths: number;
  /** How she was paid for, and from which Farm Account; left out of an answer cached before her page said. */
  paymentMethod?: PaymentMethod | null;
  farmAccountId?: string | null;
  reference?: string | null;
}

/** An Intake's answers as its Correction starts from them: each box showing what the record says. */
const intakeAnswers = (
  intake: IntakeHeld,
  owner: { id: string } | null,
  itsWindow: Answer<{ start: string; end: string }, unknown>
): Answers => ({
  purchasePriceMoney: amount(intake.purchasePriceMoney),
  // Nothing is a real answer here: an animal bought at the farm gate paid no toll, and one typed by
  // mistake is put back to nothing. `amount` would refuse it, and refuse the whole Correction with it.
  marketTollMoney: figure(intake.marketTollMoney),
  seller: counterparty(intake.sellerName),
  owner: whoseSheIs(owner?.id ?? null),
  targetWindow: itsWindow,
  buyingTrip: outingOf(intake.buyingTrip?.id ?? null),
  weightKg: amount(intake.weightKg),
  estimatedAgeMonths: figure(intake.estimatedAgeMonths),
  voided: voiding(),
  ...(intake.paymentMethod
    ? { paymentMethod: choice(intake.paymentMethod) }
    : {}),
});

/**
 * The Manager puts right what a bought-in animal cost, who sold her, the outing she came home on, how she was paid for,
 * what she weighed off the lorry and how old she was judged, whose she is, or — for the Farm's own — the window she is
 * sold in. A Venture's animal made the Farm's is asked that window afresh, because her Venture's was never the Farm's
 * choice.
 */
const IntakeCorrection = ({
  intake,
  owner,
}: {
  intake: IntakeHeld;
  /** The Venture she is on now, where she is not the Farm's own. */
  owner: { id: string; name: string } | null;
}) => {
  const { t } = useLanguage();
  // The runs an animal may be moved onto. `ventures.running` is exactly the three states a Correction
  // may hand her to — buying, fattening, selling — and is the one Venture reading a Manager may make,
  // which matters because putting a slip at the livestock market right is his to do.
  const running = useQuery(orpc.ventures.running.queryOptions());
  const named = useAccountNamed(intake);
  const itsWindow = targetWindow(intake.targetWindow, {
    askedAfresh: owner !== null,
  });
  const correcting = useCorrecting(intakeAnswers(intake, owner, itsWindow));
  const correct = useMutation(orpc.intakes.correct.mutationOptions({}));
  // The window is the Farm's to say only for an animal that will be the Farm's own; a Venture's is its Venture's.
  const willBeTheFarms = (correcting.typed.owner ?? THE_FARMS) === THE_FARMS;
  const typedWindow = correcting.typed.targetWindow ?? "";
  const windowStillToSay =
    owner !== null && willBeTheFarms && !isWholeWindow(typedWindow);
  const paidBy = paidByOf(correcting.typed.paymentMethod, intake.paymentMethod);
  const farmAccount = named.changeFor(paidBy);
  return (
    <CorrectionDialog
      onOpen={() => {
        correcting.handleOpen();
        named.reset();
      }}
      onSave={async (reason) => {
        await correct.mutateAsync({
          id: intake.id,
          reason,
          changes: {
            ...correcting.changes(),
            ...(farmAccount ? { farmAccount } : {}),
          },
        });
      }}
      ready={
        (correcting.changed || farmAccount !== undefined) && !windowStillToSay
      }
      title={t("correct.intake")}
    >
      <ArrivalAnswers correcting={correcting} />
      <OutingChoice
        held={intake.buyingTrip}
        onChange={(value) => correcting.set("buyingTrip", value)}
        value={correcting.typed.buyingTrip ?? NO_OUTING}
      />
      {intake.paymentMethod ? (
        <PaidForFields
          account={named.account}
          held={intake.paymentMethod}
          id={intake.id}
          onAccount={named.handleAccount}
          onChoose={(value) => correcting.set("paymentMethod", value)}
          paidBy={paidBy}
        />
      ) : null}
      {/* Only where there is somewhere to move her to. A farm that has never run a Venture is not
          asked whose its animals are. */}
      {(running.data ?? []).length === 0 && owner === null ? null : (
        <CorrectionChoice
          label={t("correct.whoseSheIs")}
          onChange={(value) => {
            correcting.set("owner", value);
            // Handed to a Venture, she is sold in its window: whatever was typed for the Farm's is not sent.
            if (value !== THE_FARMS) {
              correcting.set("targetWindow", itsWindow.shows);
            }
          }}
          options={[
            { value: THE_FARMS, label: t("correct.theFarmsOwn") },
            ...(running.data ?? []).map((one) => ({
              value: one.id,
              label: one.name,
            })),
          ]}
          value={correcting.typed.owner ?? THE_FARMS}
        />
      )}
      {willBeTheFarms ? (
        <WindowAnswers
          correcting={correcting}
          forTheFarmFrom={owner?.name ?? null}
        />
      ) : null}
      <CorrectionChoice
        label={t("correct.voidWhy")}
        onChange={(value) => correcting.set("voided", value)}
        options={[{ value: "void", label: t("correct.voidAnimal") }]}
        unchosen={t("correct.keep")}
        value={correcting.typed.voided ?? ""}
      />
    </CorrectionDialog>
  );
};

/**
 * How a bought-in animal arrived: what the farm paid, what it weighed off the lorry, and what it is being fed towards.
 * Nothing here ever changes — an arrival happened once — so it reads as a record rather than as a form.
 */
const HowSheArrived = ({
  intake,
  owner,
  mayCorrect,
}: {
  intake: NonNullable<AnimalDetail["intake"]>;
  owner: AnimalDetail["owner"];
  mayCorrect: boolean;
}) => {
  const { t, language } = useLanguage();
  const kg = (value: number) =>
    t("intake.kg", { kg: formatNumber(value, language) });
  return (
    <Section
      action={
        mayCorrect ? <IntakeCorrection intake={intake} owner={owner} /> : null
      }
      title={t("intake.title")}
    >
      <FactGrid>
        <Fact label={t("intake.seller")} wide>
          {[intake.sellerName, intake.sellerAddress]
            .filter(Boolean)
            .join(" · ") || "—"}
        </Fact>
        <Fact label={t("intake.price")}>
          {t("intake.money", {
            amount: formatNumber(intake.purchasePriceMoney, language),
          })}
        </Fact>
        {intake.buyingTrip ? (
          <Fact label={t("intake.trip")}>{intake.buyingTrip.wentTo}</Fact>
        ) : null}
        {intake.marketTollMoney > 0 ? (
          <Fact label={t("intake.market_toll")}>
            {t("intake.money", {
              amount: formatNumber(intake.marketTollMoney, language),
            })}
          </Fact>
        ) : null}
        <Fact label={t("intake.weight")}>{kg(intake.weightKg)}</Fact>
        <Fact label={t("intake.age")}>
          {t("intake.months", {
            months: formatNumber(intake.estimatedAgeMonths, language),
          })}
        </Fact>
        <Fact label={t("intake.targetWeight")}>
          {kg(intake.targetWeightKg)}
        </Fact>
        <Fact label={t("intake.targetWindow")} wide>
          {formatDate(
            startOfFarmDay(intake.targetWindow.start),
            language,
            "date"
          )}{" "}
          –{" "}
          {formatDate(
            startOfFarmDay(intake.targetWindow.end),
            language,
            "date"
          )}
        </Fact>
      </FactGrid>
    </Section>
  );
};

/**
 * How she left, for an animal sold to a buyer: what she fetched, who took her, and what carried her. The transport
 * lines are what the Meat Rules ask a lorry to carry, so they are part of the record.
 */
const HowSheLeft = ({
  sale,
  mayCorrect,
}: {
  sale: NonNullable<AnimalDetail["sale"]>;
  mayCorrect: boolean;
}) => {
  const { t, language } = useLanguage();
  return (
    <Section
      action={mayCorrect ? <SaleCorrection sale={sale} /> : null}
      title={t("sale.howSheLeft")}
    >
      <FactGrid>
        <Fact label={t("sale.soldTo")}>{sale.buyerName}</Fact>
        <Fact label={t("sale.price")}>
          <span className="flex flex-col">
            {t("intake.money", {
              amount: formatNumber(sale.priceMoney, language),
            })}
            <ReceivableOwed
              receivableMoney={sale.receivableMoney}
              owingMoney={sale.owingMoney}
              promisedBy={sale.promisedBy}
            />
          </span>
        </Fact>
        {/* Only where a broker was used — or left out of an answer kept from before one was written. */}
        {sale.brokerMoney ? (
          <Fact label={t("sale.brokerPaid")}>
            {t("intake.money", {
              amount: formatNumber(sale.brokerMoney, language),
            })}
          </Fact>
        ) : null}
        <Fact label={t("sale.weight")}>
          {t("intake.kg", { kg: formatNumber(sale.weightKg, language) })}
        </Fact>
        <Fact label={t("sale.soldOn")}>
          {formatDate(new Date(sale.soldAt), language, "date")}
        </Fact>
        <Fact label={t("sale.destination")}>{sale.destination}</Fact>
        <Fact label={t("sale.vehicle")}>
          {sale.vehicle} · {sale.driver}
        </Fact>
        {sale.note ? (
          <Fact label={t("sale.note")} wide>
            {sale.note}
          </Fact>
        ) : null}
      </FactGrid>
    </Section>
  );
};

/** Her Sale's receipt and transport card, printed again any day after the morning she went — the day's list only
 *  holds today's. */
const HerSalePapers = ({
  saleId,
  onPaper,
}: {
  saleId: string;
  onPaper: (document: PaperDocument) => void;
}) => {
  const { t } = useLanguage();
  const { askReceipt, askCard, busy } = useSalePapers(onPaper);
  return (
    <>
      <Button
        disabled={busy}
        onClick={() => askReceipt(saleId)}
        type="button"
        variant="outline"
      >
        <ReceiptText aria-hidden data-icon="inline-start" />
        {t("sale.receipt")}
      </Button>
      <Button
        disabled={busy}
        onClick={() => askCard(saleId)}
        type="button"
        variant="outline"
      >
        <Truck aria-hidden data-icon="inline-start" />
        {t("sale.transportCard")}
      </Button>
    </>
  );
};

/**
 * The papers the farm hands over about one animal: her passport, and the sharp question on its own page — and, once
 * she is sold, her Sale's receipt and transport card for whoever runs the farm. Here on her own page rather than on a
 * report screen, because that is where somebody is standing when a buyer asks — and they are asked for by name, not
 * printed with every visit, so the trail records the ones that actually went.
 */
const HerPapers = ({
  tagNumber,
  saleId,
}: {
  tagNumber: string;
  /** Her Sale, where she was sold and the reader may print its papers. */
  saleId: string | null;
}) => {
  const { t, language } = useLanguage();
  const refused = useRefused();
  const [paper, setPaper] = useState<PaperDocument | null>(null);
  const passport = useMutation(
    orpc.papers.passport.mutationOptions({
      onSuccess: ({ document }) => setPaper(document),
      onError: refused,
    })
  );
  const summary = useMutation(
    orpc.papers.withdrawalSummary.mutationOptions({
      onSuccess: ({ document }) => setPaper(document),
      onError: refused,
    })
  );

  return (
    <Section description={t("animals.papersHint")} title={t("animals.papers")}>
      <div className="no-print flex flex-wrap gap-2">
        <Button
          disabled={passport.isPending}
          onClick={() => passport.mutate({ tagNumber })}
          type="button"
          variant="outline"
        >
          {passport.isPending ? (
            <Spinner />
          ) : (
            <FileText aria-hidden data-icon="inline-start" />
          )}
          {t("papers.passport")}
        </Button>
        <Button
          disabled={summary.isPending}
          onClick={() => summary.mutate({ tagNumber })}
          type="button"
          variant="outline"
        >
          {summary.isPending ? (
            <Spinner />
          ) : (
            <ShieldCheck aria-hidden data-icon="inline-start" />
          )}
          {t("papers.withdrawalSummary")}
        </Button>
        {saleId ? <HerSalePapers onPaper={setPaper} saleId={saleId} /> : null}
      </div>
      <PaperDialog
        onClose={() => setPaper(null)}
        paper={paper}
        title={paper ? paper.title[language] : ""}
        wording={null}
      />
    </Section>
  );
};

/** Whether her page has money or papers for this reader: the money is the Owner's and the Manager's, and the papers
 *  anybody's but Barn Staff. */
export const hasMoneyOrPapers = (detail: AnimalDetail, powers: AnimalPowers) =>
  powers.seesPapers ||
  powers.runsTheFarm ||
  detail.intake !== null ||
  detail.sale !== null;

/** What she cost the farm and what she fetched, and the papers the farm hands over about her. */
export const MoneyPapersTab = ({
  detail,
  powers,
}: {
  detail: AnimalDetail;
  powers: AnimalPowers;
}) => (
  <div className="flex flex-col gap-6">
    {detail.sale ? (
      <HowSheLeft mayCorrect={powers.runsTheFarm} sale={detail.sale} />
    ) : null}
    {detail.intake ? (
      <HowSheArrived
        intake={detail.intake}
        mayCorrect={powers.runsTheFarm}
        owner={detail.owner}
      />
    ) : null}
    <WhatSheCost tagNumber={detail.tagNumber} />
    {/* Her dairy run, if she ever stood on the Dairy side — a bull calf walked across included; nothing otherwise. */}
    <DairyReturnsPanel animalId={detail.id} />
    {powers.seesPapers ? (
      <HerPapers
        saleId={powers.runsTheFarm ? (detail.sale?.id ?? null) : null}
        tagNumber={detail.tagNumber}
      />
    ) : null}
  </div>
);
