import { priceAtWeight, startOfFarmDay } from "@OpenFarm/domain";
import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Scale } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/page";
import { FormField, FormSheet } from "@/components/page-kit";
import type { ReturnsPage } from "@/components/returns/return-figure";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { useTaka } from "@/lib/taka";
import { aFigure, figureOf } from "@/lib/typed-figure";
import { orpc } from "@/utils/orpc";

type Crossing = ReturnsPage["crossings"][number];

const PriceCrossingSheet = ({
  crossing,
  onOpenChange,
}: {
  crossing: Crossing;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const taka = useTaka();
  const refused = useRefused();
  const [rate, setRate] = useState("");
  const [note, setNote] = useState("");
  const saving = useMutation(
    orpc.returns.priceCrossing.mutationOptions({
      onError: refused,
      onSuccess: () => {
        onOpenChange(false);
        toast.success(t("returns.priceSaved"));
      },
    })
  );
  const rateBdtPerKg = figureOf(rate);
  const weightKg = crossing.weightKg ?? 0;
  const ready = aFigure(rateBdtPerKg) && note.trim().length > 0;
  return (
    <FormSheet
      description={t("returns.crossingsHint")}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        saving.mutate({
          joiningId: crossing.id,
          rateBdtPerKg: rateBdtPerKg ?? 0,
          note: note.trim(),
        })
      }
      open
      pending={saving.isPending}
      ready={ready}
      submitLabel={t("returns.priceIt")}
      title={`${t("returns.priceTitle")} · ${crossing.tagNumber}`}
    >
      <FormField
        hint={
          aFigure(rateBdtPerKg)
            ? t("returns.priceWorks", {
                kg: weightKg,
                rate: taka(rateBdtPerKg ?? 0),
                price: taka(priceAtWeight(weightKg, rateBdtPerKg ?? 0)),
              })
            : undefined
        }
        id="crossing-rate"
        label={t("returns.rate")}
      >
        <Input
          autoComplete="off"
          id="crossing-rate"
          inputMode="decimal"
          onChange={(event) => setRate(event.target.value)}
          value={rate}
        />
      </FormField>
      <FormField id="crossing-note" label={t("returns.rateNote")}>
        <Input
          autoComplete="off"
          id="crossing-note"
          onChange={(event) => setNote(event.target.value)}
          value={note}
        />
      </FormField>
    </FormSheet>
  );
};

/** What the Owner reads under a crossing: the price she came in at, else what she weighed, else that nobody has. */
const crossingSaid = (
  one: Crossing,
  t: ReturnType<typeof useLanguage>["t"],
  taka: (bdt: number) => string
): string => {
  if (one.priceBdt !== null && one.priceBdt !== undefined) {
    return t("returns.crossingPriced", {
      price: taka(one.priceBdt),
      rate: taka(one.rateBdtPerKg ?? 0),
    });
  }
  return one.weightKg === null
    ? t("returns.crossingUnweighed")
    : t("returns.crossingWeighed", { kg: one.weightKg });
};

/**
 * Every animal walked across from Dairy the Owner prices, oldest first: those still waiting on a price, with what she
 * weighed by the day she crossed and the act that prices her — or, where nobody weighed her, the word to weigh her
 * first — and those priced while she is still on the Farm, with the price and the act that puts it right.
 */
export const CrossingsToPrice = ({ page }: { page: ReturnsPage }) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  const [pricing, setPricing] = useState<Crossing | null>(null);
  // An answer kept from before the list carried priced crossings has none, and prices nothing again.
  const crossings = page.crossings ?? [];
  if (crossings.length === 0) {
    return <EmptyState bare icon={Scale} title={t("returns.crossingsNone")} />;
  }
  return (
    <>
      <ul className="divide-border flex flex-col divide-y">
        {crossings.map((one) => (
          <li
            className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between"
            key={one.id}
          >
            <span className="flex flex-col">
              <span className="font-medium">
                {t("returns.crossingLine", {
                  tag: one.tagNumber,
                  day: formatDate(startOfFarmDay(one.joinedOn), language),
                })}
              </span>
              <span className="text-muted-foreground text-sm">
                {crossingSaid(one, t, taka)}
              </span>
            </span>
            {one.weightKg === null ? (
              <Link
                className="text-sm underline-offset-4 hover:underline"
                params={{ tagNumber: one.tagNumber }}
                to="/animals/$tagNumber"
              >
                {t("returns.fix.no_weight")}
              </Link>
            ) : (
              <Button
                className="self-start"
                onClick={() => setPricing(one)}
                size="sm"
                variant="outline"
              >
                {one.priceBdt === null
                  ? t("returns.priceIt")
                  : t("returns.priceAgain")}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {pricing ? (
        <PriceCrossingSheet
          crossing={pricing}
          onOpenChange={(open) => {
            if (!open) {
              setPricing(null);
            }
          }}
        />
      ) : null}
    </>
  );
};
