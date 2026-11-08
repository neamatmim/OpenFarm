import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import type { Plan } from "@/components/ventures/open-venture-sheet";
import { VentureTermsSheet } from "@/components/ventures/open-venture-sheet";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import type { Venture } from "@/lib/ventures";
import { orpc } from "@/utils/orpc";

/** The form filled in with what a Venture says today. An answer cached before Ventures were paid by the month says
 *  nothing of how it is paid, and is one paid before buying. */
const planOf = (venture: Venture): Plan => ({
  name: venture.name,
  targetCapitalMoney: String(venture.targetCapitalMoney),
  unitPriceMoney: String(venture.unitPriceMoney),
  floorMoney: String(venture.floorMoney),
  units: String(venture.units),
  cattleBudgetMoney: String(venture.cattleBudgetMoney),
  decideBy: venture.decideBy,
  targetWindowStart: venture.targetWindow.start,
  targetWindowEnd: venture.targetWindow.end,
  capitalPaid: venture.capitalPaid ?? "before_buying",
});

/**
 * A Venture's terms put right while nobody is bound by them (ADR 0035), on the form it was opened with.
 *
 * Filled in every time it opens, where `useFreshFor` would only do so on a different Venture: left as they were after
 * being abandoned, the boxes would offer figures the Venture does not say.
 */
export const ChangeTermsSheet = ({
  venture,
  open,
  onOpenChange,
}: {
  venture: Venture | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && venture) {
      setPlan(planOf(venture));
    }
  }
  const changing = useMutation(
    orpc.ventures.changeTerms.mutationOptions({
      onError: refused,
      onSuccess: () => {
        onOpenChange(false);
        toast.success(t("ventures.changeTerms.changed"));
      },
    })
  );
  if (!plan) {
    return null;
  }
  return (
    <VentureTermsSheet
      description={t("ventures.changeTerms.hint")}
      onOpenChange={onOpenChange}
      onSave={(terms) => {
        if (venture) {
          changing.mutate({ id: venture.id, terms });
        }
      }}
      open={open}
      pending={changing.isPending}
      plan={plan}
      setPlan={setPlan}
      submitLabel={t("common.save")}
      title={t("ventures.changeTerms")}
    />
  );
};
