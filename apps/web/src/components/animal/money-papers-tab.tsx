import { startOfFarmDay } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FileText, ReceiptText, ShieldCheck, Truck } from "lucide-react";
import { useState } from "react";

import { BakiOwed } from "@/components/baki-fields";
import {
  CorrectionAnswer,
  CorrectionDialog,
  useCorrecting,
  CorrectionChoice,
} from "@/components/correction-dialog";
import { WhatSheCost } from "@/components/costs";
import { Section } from "@/components/page";
import type { PaperId } from "@/components/paper";
import { Paper } from "@/components/paper";
import { DairyReturnsPanel } from "@/components/returns/dairy-returns";
import { SaleCorrection } from "@/components/sale-correction";
import { useSalePapers } from "@/components/sale/sale-papers";
import { useLanguage } from "@/i18n/language-provider";
import type { Answer } from "@/lib/correcting";
import {
  amount,
  counterparty,
  figure,
  isWholeWindow,
  targetWindow,
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

/**
 * The Manager puts right what a bought-in animal cost, who sold her, whose she is, or — for the Farm's own — the window
 * she is sold in. A Venture's animal made the Farm's is asked that window afresh, because her Venture's was never the
 * Farm's choice.
 */
const IntakeCorrection = ({
  intake,
  owner,
}: {
  intake: {
    id: string;
    purchasePriceBdt: number;
    hasilBdt: number;
    sellerName: string | null;
    /** As her page shows it: her Venture's where she is one's. */
    targetWindow: { start: string; end: string };
  };
  /** The Venture she is on now, where she is not the Farm's own. */
  owner: { id: string; name: string } | null;
}) => {
  const { t } = useLanguage();
  // The runs an animal may be moved onto. `ventures.running` is exactly the three states a Correction
  // may hand her to — buying, fattening, selling — and is the one Venture reading a Manager may make,
  // which matters because putting a slip at the haat right is his to do.
  const running = useQuery(orpc.ventures.running.queryOptions());
  const itsWindow = targetWindow(intake.targetWindow, {
    askedAfresh: owner !== null,
  });
  const correcting = useCorrecting({
    purchasePriceBdt: amount(intake.purchasePriceBdt),
    // Nothing is a real answer here: an animal bought at the farm gate paid no toll, and one typed by
    // mistake is put back to nothing. `amount` would refuse it, and refuse the whole Correction with it.
    hasilBdt: figure(intake.hasilBdt),
    seller: counterparty(intake.sellerName),
    owner: whoseSheIs(owner?.id ?? null),
    targetWindow: itsWindow,
  });
  const correct = useMutation(orpc.intake.correct.mutationOptions({}));
  // The window is the Farm's to say only for an animal that will be the Farm's own; a Venture's is its Venture's.
  const willBeTheFarms = (correcting.typed.owner ?? THE_FARMS) === THE_FARMS;
  const typedWindow = correcting.typed.targetWindow ?? "";
  const windowStillToSay =
    owner !== null && willBeTheFarms && !isWholeWindow(typedWindow);
  const [start = "", end = ""] = typedWindow.split("|");
  return (
    <CorrectionDialog
      onOpen={correcting.handleOpen}
      onSave={async (reason) => {
        await correct.mutateAsync({
          id: intake.id,
          reason,
          changes: correcting.changes(),
        });
      }}
      ready={correcting.changed && !windowStillToSay}
      title={t("correct.intake")}
    >
      <CorrectionAnswer
        inputMode="numeric"
        label={t("intake.price")}
        onChange={(value) => correcting.set("purchasePriceBdt", value)}
        type="number"
        value={correcting.typed.purchasePriceBdt ?? ""}
      />
      <CorrectionAnswer
        inputMode="numeric"
        label={t("intake.hasil")}
        onChange={(value) => correcting.set("hasilBdt", value)}
        type="number"
        value={correcting.typed.hasilBdt ?? ""}
      />
      <CorrectionAnswer
        label={t("correct.seller")}
        onChange={(value) => correcting.set("seller", value)}
        value={correcting.typed.seller ?? ""}
      />
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
          {owner === null ? null : (
            <p className="text-muted-foreground text-xs">
              {t("correct.windowForTheFarm", { venture: owner.name })}
            </p>
          )}
        </>
      ) : null}
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
          {t("intake.taka", {
            taka: formatNumber(intake.purchasePriceBdt, language),
          })}
        </Fact>
        {intake.buyingTrip ? (
          <Fact label={t("intake.trip")}>{intake.buyingTrip.wentTo}</Fact>
        ) : null}
        {intake.hasilBdt > 0 ? (
          <Fact label={t("intake.hasil")}>
            {t("intake.taka", {
              taka: formatNumber(intake.hasilBdt, language),
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
            {t("intake.taka", { taka: formatNumber(sale.priceBdt, language) })}
            <BakiOwed
              bakiBdt={sale.bakiBdt}
              owingBdt={sale.owingBdt}
              promisedBy={sale.promisedBy}
            />
          </span>
        </Fact>
        {/* Only where a broker was used — or left out of an answer kept from before one was written. */}
        {sale.brokerBdt ? (
          <Fact label={t("sale.brokerPaid")}>
            {t("intake.taka", { taka: formatNumber(sale.brokerBdt, language) })}
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
  onPaper: (id: PaperId, text: string) => void;
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
  const { t } = useLanguage();
  const refused = useRefused();
  const [paper, setPaper] = useState<{ id: PaperId; text: string } | null>(
    null
  );
  const passport = useMutation(
    orpc.papers.passport.mutationOptions({
      onSuccess: ({ text }) => setPaper({ id: "animal-passport", text }),
      onError: refused,
    })
  );
  const summary = useMutation(
    orpc.papers.withdrawalSummary.mutationOptions({
      onSuccess: ({ text }) => setPaper({ id: "withdrawal-summary", text }),
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
        {saleId ? (
          <HerSalePapers
            onPaper={(id, text) => setPaper({ id, text })}
            saleId={saleId}
          />
        ) : null}
      </div>
      {paper ? <Paper id={paper.id} text={paper.text} /> : null}
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
