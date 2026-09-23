import { startOfFarmDay } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FileText, ShieldCheck } from "lucide-react";
import { useState } from "react";

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
import { SaleCorrection } from "@/components/sale-correction";
import { useLanguage } from "@/i18n/language-provider";
import type { Answer } from "@/lib/correcting";
import { amount, counterparty, figure } from "@/lib/correcting";
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

/** The Manager puts right what a bought-in animal cost, who sold her, or whose she is. */
const IntakeCorrection = ({
  intake,
  owner,
}: {
  intake: {
    id: string;
    purchasePriceBdt: number;
    hasilBdt: number;
    sellerName: string | null;
  };
  /** The Venture she is on now, where she is not the Farm's own. */
  owner: { id: string; name: string } | null;
}) => {
  const { t } = useLanguage();
  // The runs an animal may be moved onto. `ventures.running` is exactly the three states a Correction
  // may hand her to — buying, fattening, selling — and is the one Venture reading a Manager may make,
  // which matters because putting a slip at the haat right is his to do.
  const running = useQuery(orpc.ventures.running.queryOptions());
  const correcting = useCorrecting({
    purchasePriceBdt: amount(intake.purchasePriceBdt),
    // Nothing is a real answer here: an animal bought at the farm gate paid no toll, and one typed by
    // mistake is put back to nothing. `amount` would refuse it, and refuse the whole Correction with it.
    hasilBdt: figure(intake.hasilBdt),
    seller: counterparty(intake.sellerName),
    owner: whoseSheIs(owner?.id ?? null),
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
      {/* Only where there is somewhere to move her to. A farm that has never run a Venture is not
          asked whose its animals are. */}
      {(running.data ?? []).length === 0 && owner === null ? null : (
        <CorrectionChoice
          label={t("correct.whoseSheIs")}
          onChange={(value) => correcting.set("owner", value)}
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
    {powers.seesPapers ? <HerPapers tagNumber={detail.tagNumber} /> : null}
  </div>
);
