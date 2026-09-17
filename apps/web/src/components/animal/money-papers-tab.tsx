import { startOfFarmDay } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  CorrectionAnswer,
  CorrectionDialog,
  useCorrecting,
} from "@/components/correction-dialog";
import { WhatSheCost } from "@/components/costs";
import { Section } from "@/components/page";
import type { PaperId } from "@/components/paper";
import { Paper } from "@/components/paper";
import { SaleCorrection } from "@/components/sale-correction";
import { useLanguage } from "@/i18n/language-provider";
import { amount, counterparty, figure } from "@/lib/correcting";
import { sayWhy } from "@/lib/saying";
import { orpc } from "@/utils/orpc";

import { Fact, FactGrid } from "./animal-facts";
import type { AnimalDetail, AnimalPowers } from "./animal-types";

/** The Manager puts right what a bought-in animal cost, or who sold her. */
const IntakeCorrection = ({
  intake,
}: {
  intake: {
    id: string;
    purchasePriceBdt: number;
    hasilBdt: number;
    sellerName: string | null;
  };
}) => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const correcting = useCorrecting({
    purchasePriceBdt: amount(intake.purchasePriceBdt),
    // Nothing is a real answer here: an animal bought at the farm gate paid no toll, and one typed by
    // mistake is put back to nothing. `amount` would refuse it, and refuse the whole Correction with it.
    hasilBdt: figure(intake.hasilBdt),
    seller: counterparty(intake.sellerName),
  });
  const correct = useMutation(orpc.intake.correct.mutationOptions({}));
  return (
    <CorrectionDialog
      onOpen={correcting.handleOpen}
      onSave={async (reason) => {
        await correct.mutateAsync({
          id: intake.id,
          reason,
          changes: correcting.changes(),
        });
        await queryClient.invalidateQueries({ queryKey: orpc.animals.key() });
      }}
      ready={correcting.changed}
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
    </CorrectionDialog>
  );
};

/**
 * How a bought-in animal arrived: what the farm paid, what it weighed off the lorry, and what it is being fed towards.
 * Nothing here ever changes — an arrival happened once — so it reads as a record rather than as a form.
 */
const HowSheArrived = ({
  intake,
  mayCorrect,
}: {
  intake: NonNullable<AnimalDetail["intake"]>;
  mayCorrect: boolean;
}) => {
  const { t, language } = useLanguage();
  const kg = (value: number) =>
    t("intake.kg", { kg: formatNumber(value, language) });
  return (
    <Section
      action={mayCorrect ? <IntakeCorrection intake={intake} /> : null}
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
      action={
        mayCorrect ? (
          <SaleCorrection sale={sale} thenReload={orpc.animals.key()} />
        ) : null
      }
      title={t("sale.howSheLeft")}
    >
      <FactGrid>
        <Fact label={t("sale.soldTo")}>{sale.buyerName}</Fact>
        <Fact label={t("sale.price")}>
          {t("intake.taka", { taka: formatNumber(sale.priceBdt, language) })}
        </Fact>
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

/**
 * The two papers the farm hands over about one animal: her passport, and the sharp question on its own page. Here on
 * her own page rather than on a report screen, because that is where somebody is standing when a buyer asks — and they
 * are asked for by name, not printed with every visit, so the trail records the ones that actually went.
 */
const HerPapers = ({ tagNumber }: { tagNumber: string }) => {
  const { t } = useLanguage();
  const [paper, setPaper] = useState<{ id: PaperId; text: string } | null>(
    null
  );
  const passport = useMutation(
    orpc.papers.passport.mutationOptions({
      onSuccess: ({ text }) => setPaper({ id: "animal-passport", text }),
      onError: (error) => toast.error(sayWhy(error, t)),
    })
  );
  const summary = useMutation(
    orpc.papers.withdrawalSummary.mutationOptions({
      onSuccess: ({ text }) => setPaper({ id: "withdrawal-summary", text }),
      onError: (error) => toast.error(sayWhy(error, t)),
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
      <HowSheArrived intake={detail.intake} mayCorrect={powers.runsTheFarm} />
    ) : null}
    <WhatSheCost tagNumber={detail.tagNumber} />
    {powers.seesPapers ? <HerPapers tagNumber={detail.tagNumber} /> : null}
  </div>
);
