import { farmDayOf, startOfFarmDay } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { Landmark } from "lucide-react";
import { useState } from "react";

import { EmptyState, StatusBadge } from "@/components/page";
import { FormField, FormSheet } from "@/components/page-kit";
import type { ReturnsPage } from "@/components/returns/return-figure";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { aFigure, figureOf } from "@/lib/typed-figure";
import { orpc } from "@/utils/orpc";

/** What the Owner types a Bank Rate as, before it is a figure. */
interface TypedRate {
  perYear: string;
  note: string;
  fromDay: string;
}

/** The most a rate a year may be, as the server takes it: a hundred on every hundred. */
const MOST_PER_YEAR = 100;

const BankRateSheet = ({
  onOpenChange,
}: {
  onOpenChange: (open: boolean) => void;
}) => {
  const { t, language } = useLanguage();
  const refused = useRefused();
  const today = farmDayOf(new Date());
  const [typed, setTyped] = useState<TypedRate>({
    perYear: "",
    note: "",
    fromDay: today,
  });
  const saving = useMutation(
    orpc.returns.setBankRate.mutationOptions({
      onError: refused,
      onSuccess: () => {
        onOpenChange(false);
        toast.success(t("returns.bankSaved"));
      },
    })
  );
  const perYear = figureOf(typed.perYear);
  // Said under the box, in the reader's words, rather than refused by the server in English.
  const overTheMost = perYear !== null && perYear > MOST_PER_YEAR;
  const ready =
    aFigure(perYear) &&
    !overTheMost &&
    typed.note.trim().length > 0 &&
    typed.fromDay.length > 0;
  return (
    <FormSheet
      description={t("returns.bankHint")}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        saving.mutate({
          perYear: perYear ?? 0,
          note: typed.note.trim(),
          fromDay: typed.fromDay,
        })
      }
      open
      pending={saving.isPending}
      ready={ready}
      submitLabel={t("returns.bankSet")}
      title={t("returns.bankSet")}
    >
      <FormField
        error={
          overTheMost
            ? t("returns.bankAtMost", {
                most: formatNumber(MOST_PER_YEAR, language),
              })
            : undefined
        }
        id="bank-per-year"
        label={t("returns.bankPerYear")}
      >
        <Input
          autoComplete="off"
          id="bank-per-year"
          inputMode="decimal"
          onChange={(event) =>
            setTyped({ ...typed, perYear: event.target.value })
          }
          value={typed.perYear}
        />
      </FormField>
      <FormField
        hint={t("returns.bankNoteHint")}
        id="bank-note"
        label={t("returns.bankNote")}
      >
        <Input
          autoComplete="off"
          id="bank-note"
          onChange={(event) => setTyped({ ...typed, note: event.target.value })}
          value={typed.note}
        />
      </FormField>
      <FormField
        hint={t("returns.bankFromDayHint")}
        id="bank-from"
        label={t("returns.bankFromDay")}
      >
        <Input
          id="bank-from"
          max={today}
          onChange={(event) =>
            setTyped({ ...typed, fromDay: event.target.value })
          }
          type="date"
          value={typed.fromDay}
        />
      </FormField>
    </FormSheet>
  );
};

/**
 * Every Bank Rate the Owner has typed, the one in force today first; `BankRateAction` types another. Kept, never
 * edited: a rate put right is typed again from the same day.
 */
export const BankRateList = ({ page }: { page: ReturnsPage }) => {
  const { t, language } = useLanguage();
  return (
    <div className="flex flex-col gap-3">
      {page.bankRates.length === 0 ? (
        <EmptyState bare icon={Landmark} title={t("returns.bankNone")} />
      ) : (
        <ul className="divide-border flex flex-col divide-y">
          {page.bankRates.map((one) => (
            <li
              className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-center sm:justify-between"
              key={one.id}
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium tabular-nums">
                  {t("returns.bankLine", { rate: one.perYear, note: one.note })}
                </span>
                {one.id === page.bankRateInForceId ? (
                  <StatusBadge tone="success">
                    {t("returns.bankInForce")}
                  </StatusBadge>
                ) : null}
              </span>
              <span className="text-muted-foreground text-sm">
                {t("returns.bankFrom", {
                  day: formatDate(startOfFarmDay(one.fromDay), language),
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/** The act that types another Bank Rate, for the head of its list. */
export const BankRateAction = () => {
  const { t } = useLanguage();
  const [setting, setSetting] = useState(false);
  return (
    <>
      <Button onClick={() => setSetting(true)} size="sm" variant="outline">
        {t("returns.bankSet")}
      </Button>
      {setting ? <BankRateSheet onOpenChange={setSetting} /> : null}
    </>
  );
};
