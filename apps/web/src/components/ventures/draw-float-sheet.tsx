import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { FormField, FormSheet, NativeSelect } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { sayWhy } from "@/lib/saying";
import { orpc } from "@/utils/orpc";

interface Drawing {
  buyingTripId: string;
  amountBdt: string;
  movedOn: string;
  reference: string;
}

const NOTHING_YET: Drawing = {
  buyingTripId: "",
  amountBdt: "",
  movedOn: "",
  reference: "",
};

/**
 * The Buying Float: what the Manager takes to the haat, drawn from one Venture for one outing.
 *
 * The sheet says what the Cattle Budget is holding, because that is the figure the Owner is spending
 * against — the rest of the account is what keeps the animals she is about to buy.
 */
export const DrawFloatSheet = ({
  venture,
  open,
  onOpenChange,
}: {
  venture: { cattleBudgetHeldBdt: number; id: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const [drawing, setDrawing] = useState<Drawing>(NOTHING_YET);
  const trips = useQuery(orpc.trips.list.queryOptions());
  const drawingIt = useMutation(
    orpc.ventures.drawFloat.mutationOptions({
      onError: (error) => toast.error(sayWhy(error, t)),
      onSuccess: async () => {
        setDrawing(NOTHING_YET);
        onOpenChange(false);
        await queryClient.invalidateQueries({ queryKey: orpc.ventures.key() });
        toast.success(t("ventures.floatDrawn"));
      },
    })
  );
  const amount = Number(drawing.amountBdt);
  const held = venture?.cattleBudgetHeldBdt ?? 0;
  const ready =
    venture !== null &&
    drawing.buyingTripId !== "" &&
    amount <= held &&
    amount > 0 &&
    drawing.movedOn !== "" &&
    drawing.reference.trim() !== "";
  return (
    <FormSheet
      description={t("ventures.floatHint", {
        cattle: formatNumber(held, language),
      })}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        drawingIt.mutate({
          ventureId: venture?.id ?? "",
          buyingTripId: drawing.buyingTripId,
          amountBdt: amount,
          movedOn: drawing.movedOn,
          paymentMethod: "bank",
          reference: drawing.reference,
        })
      }
      open={open}
      pending={drawingIt.isPending}
      ready={ready}
      submitLabel={t("ventures.drawFloat")}
      title={t("ventures.drawFloat")}
    >
      <FormField
        hint={t("ventures.floatTripHint")}
        id="float-trip"
        label={t("ventures.floatTrip")}
      >
        <NativeSelect
          id="float-trip"
          onChange={(event) =>
            setDrawing({ ...drawing, buyingTripId: event.target.value })
          }
          value={drawing.buyingTripId}
        >
          <option value="">—</option>
          {(trips.data ?? [])
            .filter((one) => one.float === null)
            .map((one) => (
              <option key={one.id} value={one.id}>
                {`${one.wentTo} · ${formatDate(one.wentOn, language, "date")}`}
              </option>
            ))}
        </NativeSelect>
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          hint={t("ventures.floatMost", {
            cattle: formatNumber(held, language),
          })}
          id="float-amount"
          label={t("ventures.amount")}
        >
          <Input
            id="float-amount"
            inputMode="numeric"
            max={held}
            onChange={(event) =>
              setDrawing({ ...drawing, amountBdt: event.target.value })
            }
            type="number"
            value={drawing.amountBdt}
          />
        </FormField>
        <FormField id="float-moved-on" label={t("ventures.movedOn")}>
          <Input
            id="float-moved-on"
            onChange={(event) =>
              setDrawing({ ...drawing, movedOn: event.target.value })
            }
            type="date"
            value={drawing.movedOn}
          />
        </FormField>
      </div>
      <FormField
        hint={t("ventures.referenceHint")}
        id="float-reference"
        label={t("ventures.reference")}
      >
        <Input
          autoComplete="off"
          id="float-reference"
          onChange={(event) =>
            setDrawing({ ...drawing, reference: event.target.value })
          }
          value={drawing.reference}
        />
      </FormField>
    </FormSheet>
  );
};
