import { formatNumber } from "@OpenFarm/i18n";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { FormField, FormSheet } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { useFreshFor } from "@/lib/fresh-for";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

/** The most of a Venture's Units the Farm may hold itself, as the farm refuses more. */
const FARM_SHARE_MOST = 0.5;

/** The farm's refusals of the Farm's Units, in the reader's words. */
const OWN_WORDS = {
  farm_has_units_already: "farmCapital.refused.farmHasUnitsAlready",
  investors_signed_already: "farmCapital.refused.investorsSignedAlready",
  farm_units_over_half: "farmCapital.refused.overHalf",
  venture_units_gone: "farmCapital.refused.unitsGone",
} as const;

/**
 * The Farm takes Units of an open Venture with its own money, before anybody signs: how many, at most half, on the
 * split the farm signs its Investors on, which every Investor then signs on too. No paper and no stamp — the Farm signs
 * nothing with itself — and its capital then comes in from its own bank account as anybody's does.
 */
export const FarmTakesSheet = ({
  venture,
  open,
  onOpenChange,
}: {
  venture: { id: string; name: string; units: number } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t, language } = useLanguage();
  const refused = useRefused(OWN_WORDS);
  const [units, setUnits] = useState("");
  useFreshFor(venture?.id, () => setUnits(""));
  const farm = useQuery(orpc.farm.current.queryOptions());
  // The split the farm signs every Investor on today, which the farm takes the Farm's Units on and every Investor then
  // signs on too: said here, never sent.
  const investorsPercent =
    farm.data && "ventureInvestorsPercent" in farm.data
      ? farm.data.ventureInvestorsPercent
      : undefined;
  const most = Math.floor((venture?.units ?? 0) * FARM_SHARE_MOST);
  const taking = useMutation(
    orpc.ventures.agreements.farmTakes.mutationOptions({
      onError: refused,
      onSuccess: () => {
        setUnits("");
        onOpenChange(false);
        toast.success(t("farmCapital.taken"));
      },
    })
  );
  const count = Number(units);
  const withinHalf = count <= most;
  const ready =
    venture !== null && Number.isInteger(count) && count > 0 && withinHalf;
  return (
    <FormSheet
      description={t("farmCapital.takeHint", { venture: venture?.name ?? "" })}
      onOpenChange={onOpenChange}
      onSubmit={() => {
        if (venture) {
          taking.mutate({ ventureId: venture.id, units: count });
        }
      }}
      open={open}
      pending={taking.isPending}
      ready={ready}
      submitLabel={t("farmCapital.take")}
      title={t("farmCapital.take")}
    >
      <FormField
        hint={t("farmCapital.unitsHint", {
          most: formatNumber(most, language),
        })}
        id="farm-units"
        label={t("farmCapital.units")}
      >
        <Input
          id="farm-units"
          inputMode="numeric"
          max={most}
          min={1}
          onChange={(event) => setUnits(event.target.value)}
          type="number"
          value={units}
        />
      </FormField>
      {investorsPercent === undefined ? null : (
        <p className="text-muted-foreground text-sm">
          {t("farmCapital.splitIs", {
            investors: formatNumber(investorsPercent, language),
            farm: formatNumber(100 - investorsPercent, language),
          })}
        </p>
      )}
    </FormSheet>
  );
};
