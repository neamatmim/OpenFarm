import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

const EMPTY = {
  tagNumber: "",
  buyerName: "",
  buyerAddress: "",
  buyerPhone: "",
  priceBdt: "",
  weightKg: "",
  destination: "",
  vehicle: "",
  driver: "",
  note: "",
};

/** The day she is fit, when the farm refused the sale because she is still inside her days. */
const fitOnFrom = (error: unknown): string | null => {
  const data = (error as { data?: { refusal?: string; fitOn?: string } })?.data;
  return data?.refusal === "meat_withdrawal" ? (data.fitOn ?? null) : null;
};

/** The last buyer and lorry of the day, one button away. Nothing at all on a day the farm has
 *  sold nothing: yesterday's buyer is a different market. */
const TheLastOne = ({
  sale,
  onUse,
}: {
  sale: {
    buyerName: string;
    buyerAddress: string | null;
    buyerPhone: string | null;
    destination: string;
    vehicle: string;
    driver: string;
  } | null;
  onUse: (patch: Partial<typeof EMPTY>) => void;
}) => {
  const { t } = useLanguage();
  if (!sale) {
    return null;
  }
  return (
    <Button
      onClick={() =>
        onUse({
          buyerName: sale.buyerName,
          buyerAddress: sale.buyerAddress ?? "",
          buyerPhone: sale.buyerPhone ?? "",
          destination: sale.destination,
          vehicle: sale.vehicle,
          driver: sale.driver,
        })
      }
      variant="outline"
    >
      {t("sale.again")}
    </Button>
  );
};

/**
 * Selling an animal, on Eid morning, on a phone.
 *
 * Only animals the Manager has already confirmed Ready appear in the list, and the last buyer
 * and lorry of the day are one button away — at Eid several beasts go to one man in one morning,
 * and asking for his name, his address, his lorry and his driver five times is how a farm ends up
 * with five spellings of one man.
 */
const SalePage = () => {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const [fields, setFields] = useState(EMPTY);
  const board = useQuery(orpc.fattening.board.queryOptions({ input: {} }));
  const last = useQuery(orpc.sale.lastToday.queryOptions());

  const ready = (board.data ?? []).filter(
    (row) => row.state === "ready_for_sale"
  );
  const edit = (patch: Partial<typeof fields>) =>
    setFields({ ...fields, ...patch });

  const record = useMutation(
    orpc.sale.record.mutationOptions({
      onSuccess: ({ tagNumber }) => {
        toast.success(t("sale.done", { tag: tagNumber }));
        // The buyer and the lorry stay on the screen: the next beast is usually his too.
        setFields({ ...fields, tagNumber: "", weightKg: "", priceBdt: "" });
        for (const key of [
          orpc.sale.key(),
          orpc.fattening.key(),
          orpc.ready.key(),
        ]) {
          queryClient.invalidateQueries({ queryKey: key });
        }
      },
      onError: (error) => {
        const fitOn = fitOnFrom(error);
        toast.error(
          fitOn
            ? t("sale.withdrawal", {
                when: formatDate(new Date(fitOn), language, "date"),
              })
            : (error.message ?? t("common.error"))
        );
      },
    })
  );

  return (
    <div className="container mx-auto max-w-2xl space-y-5 px-4 py-6">
      <h1 className="text-2xl font-bold">{t("sale.title")}</h1>

      <TheLastOne onUse={edit} sale={last.data ?? null} />

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          record.mutate({
            tagNumber: fields.tagNumber,
            buyer: {
              name: fields.buyerName,
              address: fields.buyerAddress || undefined,
              phone: fields.buyerPhone || undefined,
            },
            priceBdt: Number(fields.priceBdt),
            weightKg: Number(fields.weightKg),
            destination: fields.destination,
            vehicle: fields.vehicle,
            driver: fields.driver,
            note: fields.note || undefined,
          });
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="sale-animal">{t("sale.animal")}</Label>
          {ready.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t("sale.noneReady")}
            </p>
          ) : (
            <select
              className="bg-background h-9 w-full rounded-md border px-2 text-sm"
              id="sale-animal"
              onChange={(e) => edit({ tagNumber: e.target.value })}
              required
              value={fields.tagNumber}
            >
              <option value="">—</option>
              {ready.map((row) => (
                <option key={row.id} value={row.tagNumber}>
                  {row.tagNumber} · {row.penName}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="sale-buyer">{t("sale.buyerName")}</Label>
          <Input
            id="sale-buyer"
            maxLength={120}
            onChange={(e) => edit({ buyerName: e.target.value })}
            required
            value={fields.buyerName}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="sale-address">{t("sale.buyerAddress")}</Label>
            <Input
              id="sale-address"
              maxLength={200}
              onChange={(e) => edit({ buyerAddress: e.target.value })}
              value={fields.buyerAddress}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sale-phone">{t("sale.buyerPhone")}</Label>
            <Input
              id="sale-phone"
              inputMode="tel"
              maxLength={20}
              onChange={(e) => edit({ buyerPhone: e.target.value })}
              value={fields.buyerPhone}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="sale-price">{t("sale.price")}</Label>
            <Input
              id="sale-price"
              inputMode="numeric"
              onChange={(e) => edit({ priceBdt: e.target.value })}
              required
              type="number"
              value={fields.priceBdt}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sale-weight">{t("sale.weight")}</Label>
            <Input
              id="sale-weight"
              inputMode="decimal"
              onChange={(e) => edit({ weightKg: e.target.value })}
              required
              step="0.1"
              type="number"
              value={fields.weightKg}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="sale-destination">{t("sale.destination")}</Label>
          <Input
            id="sale-destination"
            maxLength={200}
            onChange={(e) => edit({ destination: e.target.value })}
            required
            value={fields.destination}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="sale-vehicle">{t("sale.vehicle")}</Label>
            <Input
              id="sale-vehicle"
              maxLength={60}
              onChange={(e) => edit({ vehicle: e.target.value })}
              required
              value={fields.vehicle}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sale-driver">{t("sale.driver")}</Label>
            <Input
              id="sale-driver"
              maxLength={120}
              onChange={(e) => edit({ driver: e.target.value })}
              required
              value={fields.driver}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="sale-note">{t("sale.note")}</Label>
          <Input
            id="sale-note"
            maxLength={300}
            onChange={(e) => edit({ note: e.target.value })}
            value={fields.note}
          />
          <p className="text-muted-foreground text-xs">{t("sale.noteWhy")}</p>
        </div>

        <Button disabled={record.isPending || ready.length === 0} type="submit">
          {t("sale.record")}
        </Button>
      </form>
    </div>
  );
};

export const Route = createFileRoute("/_auth/sale")({
  component: SalePage,
});
