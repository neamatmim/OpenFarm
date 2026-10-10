import type { CapitalPaid } from "@OpenFarm/domain";
import { CAPITAL_PAID, monthlySumsOf, monthlyTermsOf } from "@OpenFarm/domain";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { useNextEid } from "@/components/fattening/next-eid";
import { FormField, FormSheet, NativeSelect } from "@/components/page-kit";
import { PaidForBy } from "@/components/ventures/paid-for-by";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

interface Plan {
  name: string;
  targetCapitalMoney: string;
  unitPriceMoney: string;
  /** The least capital this is worth starting on, when the Owner wants a figure of her own. */
  floorMoney: string;
  /** How many Units there are, when the Owner wants a number of her own. */
  units: string;
  /** What is meant for buying animals, when the Owner wants a figure of her own. */
  cattleBudgetMoney: string;
  decideBy: string;
  targetWindowStart: string;
  targetWindowEnd: string;
  capitalPaid: CapitalPaid;
}

/** What the farm would work out, shown grayed in the box the Owner may type over. */
const wouldBe = (amount: number, each: number) =>
  amount > 0 && each > 0 ? String(Math.round(amount / each)) : "";

const wouldStartOn = (amount: number, floorPercent: number | undefined) =>
  floorPercent === undefined || amount <= 0
    ? ""
    : String(Math.round((amount * floorPercent) / 100));

const wouldKeep = (amount: number, runningPercent: number | undefined) =>
  runningPercent === undefined || amount <= 0
    ? ""
    : String(Math.round((amount * (100 - runningPercent)) / 100));

/** The Cattle Budget the Venture will open with: hers where she typed one, the farm's share of the capital where not. */
const cattleBudgetOf = (plan: Plan, runningPercent: number | undefined) =>
  plan.cattleBudgetMoney.trim() === ""
    ? Number(wouldKeep(Number(plan.targetCapitalMoney), runningPercent) || 0)
    : Number(plan.cattleBudgetMoney);

const NOTHING_YET: Plan = {
  name: "",
  targetCapitalMoney: "",
  unitPriceMoney: "",
  floorMoney: "",
  units: "",
  cattleBudgetMoney: "",
  decideBy: "",
  targetWindowStart: "",
  targetWindowEnd: "",
  capitalPaid: "before_buying",
};

/**
 * What a Venture paid by the month would open on, as the server will work it, so she sees the schedule before she
 * opens it — or why there is none. Nothing until the figures it is worked from are in.
 */
const MonthlyPreview = ({
  unitPriceMoney,
  targetCapitalMoney,
  cattleBudgetMoney,
  decideBy,
  targetWindowStart,
}: {
  unitPriceMoney: number;
  targetCapitalMoney: number;
  cattleBudgetMoney: number;
  decideBy: string;
  targetWindowStart: string;
}) => {
  const { t } = useLanguage();
  const known =
    unitPriceMoney > 0 &&
    targetCapitalMoney > 0 &&
    decideBy !== "" &&
    targetWindowStart !== "";
  if (!known) {
    return null;
  }
  const terms = monthlyTermsOf({
    unitPriceMoney,
    targetCapitalMoney,
    cattleBudgetMoney,
    decideBy,
    targetWindowStart,
  });
  if (terms === "no_month_to_pay_in") {
    return (
      <output className="text-warning block text-sm">
        {t("refusal.ventureNoMonthToPayIn")}
      </output>
    );
  }
  if (terms === "nothing_to_pay_monthly") {
    return (
      <output className="text-warning block text-sm">
        {t("refusal.ventureNothingToPayMonthly")}
      </output>
    );
  }
  return (
    <output className="bg-muted block rounded-md px-3 py-2 text-sm">
      <PaidForBy
        paidFor={{
          unitPriceMoney,
          monthly: {
            cattlePartMoney: terms.cattlePartMoney,
            sums: monthlySumsOf(unitPriceMoney, terms),
          },
        }}
      />
    </output>
  );
};

/**
 * The plan a Venture opens on. The Owner types what it is called, what it is after and what a Unit costs;
 * the Floor, the two budgets and how many Units there are follow from the Farm's own parameters, so the
 * form asks for four things rather than nine.
 */
export const OpenVentureSheet = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useLanguage();
  const refused = useRefused();
  const [plan, setPlan] = useState<Plan>(NOTHING_YET);
  const farm = useQuery(orpc.farm.current.queryOptions());
  const opening = useMutation(
    orpc.ventures.open.mutationOptions({
      onError: refused,
      onSuccess: () => {
        setPlan(NOTHING_YET);
        onOpenChange(false);
        toast.success(t("ventures.opened"));
      },
    })
  );
  const target = Number(plan.targetCapitalMoney);
  const unit = Number(plan.unitPriceMoney);
  // What the farm plans a Venture by, for the sentence under the title. The figures themselves are the
  // server's to apply, so the sheet never has to know the rule — only how to say it.
  const settings =
    farm.data && "ventureFloorPercent" in farm.data ? farm.data : null;
  const running = settings?.ventureRunningPercent;
  const floor = settings?.ventureFloorPercent;
  const eid = useNextEid();
  const window = {
    start: plan.targetWindowStart || eid?.start || "",
    end: plan.targetWindowEnd || eid?.end || "",
  };
  const ready =
    plan.name.trim() !== "" &&
    target > 0 &&
    unit > 0 &&
    plan.decideBy !== "" &&
    window.start !== "" &&
    window.end !== "";
  return (
    <FormSheet
      description={
        settings
          ? t("ventures.openHint", {
              floor: settings.ventureFloorPercent ?? "",
              running: running ?? "",
            })
          : t("ventures.openHintPlain")
      }
      onOpenChange={onOpenChange}
      onSubmit={() =>
        // The Floor, the Units and the two budgets follow from the farm's own parameters unless the
        // Owner says otherwise here.
        opening.mutate({
          name: plan.name,
          targetCapitalMoney: target,
          decideBy: plan.decideBy,
          targetWindowStart: window.start,
          targetWindowEnd: window.end,
          unitPriceMoney: unit,
          floorMoney:
            plan.floorMoney.trim() === "" ? undefined : Number(plan.floorMoney),
          units: plan.units.trim() === "" ? undefined : Number(plan.units),
          cattleBudgetMoney:
            plan.cattleBudgetMoney.trim() === ""
              ? undefined
              : Number(plan.cattleBudgetMoney),
          capitalPaid: plan.capitalPaid,
        })
      }
      open={open}
      pending={opening.isPending}
      ready={ready}
      submitLabel={t("ventures.open")}
      title={t("ventures.open")}
      wide
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="venture-name" label={t("ventures.name")}>
          <Input
            autoComplete="off"
            id="venture-name"
            onChange={(event) => setPlan({ ...plan, name: event.target.value })}
            value={plan.name}
          />
        </FormField>
        <FormField id="venture-paid" label={t("ventures.paidFor.choose")}>
          <NativeSelect
            id="venture-paid"
            onChange={(event) =>
              setPlan({
                ...plan,
                capitalPaid:
                  CAPITAL_PAID.find((one) => one === event.target.value) ??
                  "before_buying",
              })
            }
            value={plan.capitalPaid}
          >
            {CAPITAL_PAID.map((one) => (
              <option key={one} value={one}>
                {t(`ventures.paidFor.${one}`)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="venture-target" label={t("ventures.target")}>
          <Input
            id="venture-target"
            inputMode="numeric"
            onChange={(event) =>
              setPlan({ ...plan, targetCapitalMoney: event.target.value })
            }
            type="number"
            value={plan.targetCapitalMoney}
          />
        </FormField>
        <FormField id="venture-unit" label={t("ventures.unitPrice")}>
          <Input
            id="venture-unit"
            inputMode="numeric"
            onChange={(event) =>
              setPlan({ ...plan, unitPriceMoney: event.target.value })
            }
            type="number"
            value={plan.unitPriceMoney}
          />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField id="venture-floor" label={t("ventures.floorOwn")}>
          <Input
            id="venture-floor"
            inputMode="numeric"
            onChange={(event) =>
              setPlan({ ...plan, floorMoney: event.target.value })
            }
            placeholder={wouldStartOn(target, floor)}
            type="number"
            value={plan.floorMoney}
          />
        </FormField>
        <FormField id="venture-units" label={t("ventures.unitsOwn")}>
          <Input
            id="venture-units"
            inputMode="numeric"
            onChange={(event) =>
              setPlan({ ...plan, units: event.target.value })
            }
            placeholder={wouldBe(target, unit)}
            type="number"
            value={plan.units}
          />
        </FormField>
        <FormField id="venture-cattle" label={t("ventures.cattleBudgetOwn")}>
          <Input
            id="venture-cattle"
            inputMode="numeric"
            onChange={(event) =>
              setPlan({ ...plan, cattleBudgetMoney: event.target.value })
            }
            placeholder={wouldKeep(target, running)}
            type="number"
            value={plan.cattleBudgetMoney}
          />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField id="venture-decide" label={t("ventures.decideBy")}>
          <Input
            id="venture-decide"
            onChange={(event) =>
              setPlan({ ...plan, decideBy: event.target.value })
            }
            type="date"
            value={plan.decideBy}
          />
        </FormField>
        <FormField id="venture-from" label={t("ventures.windowFrom")}>
          <Input
            id="venture-from"
            onChange={(event) =>
              setPlan({ ...plan, targetWindowStart: event.target.value })
            }
            type="date"
            value={window.start}
          />
        </FormField>
        <FormField id="venture-to" label={t("ventures.windowTo")}>
          <Input
            id="venture-to"
            onChange={(event) =>
              setPlan({ ...plan, targetWindowEnd: event.target.value })
            }
            type="date"
            value={window.end}
          />
        </FormField>
      </div>
      {plan.capitalPaid === "by_the_month" ? (
        <MonthlyPreview
          cattleBudgetMoney={cattleBudgetOf(plan, running)}
          decideBy={plan.decideBy}
          targetCapitalMoney={target}
          targetWindowStart={window.start}
          unitPriceMoney={unit}
        />
      ) : null}
    </FormSheet>
  );
};
