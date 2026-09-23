import type { PaymentMethod } from "@OpenFarm/domain";
import { farmDayOf } from "@OpenFarm/domain";
import { formatNumber } from "@OpenFarm/i18n";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { FormField, FormSheet, NativeSelect } from "@/components/page-kit";
import { PaymentMethodField } from "@/components/payment-method";
import { useLanguage } from "@/i18n/language-provider";
import { wordedRefusal } from "@/lib/correction-refusal";
import { orpc } from "@/utils/orpc";

import type { DrugProduct } from "./drug-types";
import { productName } from "./drug-types";

const NOTHING_BOUGHT = {
  quantity: "",
  doses: "",
  price: "",
  seller: "",
  lotNumber: "",
  expiresOn: "",
};

type Typed = typeof NOTHING_BOUGHT;

/** What one dose came to, worked out as the price and the doses are typed. */
const PerDose = ({ typed }: { typed: Typed }) => {
  const { t, language } = useLanguage();
  const doses = Number(typed.doses);
  const price = Number(typed.price);
  if (!(doses > 0 && price > 0)) {
    return null;
  }
  return (
    <p className="bg-muted text-muted-foreground rounded-md px-3 py-2 text-sm tabular-nums">
      {t("drugs.perDose", {
        taka: formatNumber(Math.round((price / doses) * 100) / 100, language),
      })}
    </p>
  );
};

/**
 * Medicine bought for the Drug List, in a sheet beside the page: how much as the box says it, roughly how many doses
 * that is, what it cost and who sold it. The Manager's, or the Owner's, and the farm's money for the medicine comes
 * from it. Opened from the page's own button, or from a product's row with that product already chosen — the page keys
 * it on that product, so opening it for another starts a fresh sheet.
 */
export const BuyMedicineSheet = ({
  products,
  productId,
  open,
  onOpenChange,
}: {
  /** Products that may still be bought: a retired one is not. */
  products: DrugProduct[];
  productId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const [chosenId, setChosenId] = useState(productId ?? "");
  const [typed, setTyped] = useState(NOTHING_BOUGHT);
  const [purchasedOn, setPurchasedOn] = useState(() => farmDayOf(new Date()));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const chosen =
    products.find((product) => product.id === chosenId) ?? products[0];
  const buy = useMutation(
    orpc.drugs.purchase.mutationOptions({
      onSuccess: async () => {
        setTyped(NOTHING_BOUGHT);
        toast.success(t("drugs.bought"));
        onOpenChange(false);
        await queryClient.invalidateQueries({ queryKey: orpc.drugs.key() });
      },
      onError: (error) =>
        toast.error(
          wordedRefusal(error, t) ?? (error.message || t("common.error"))
        ),
    })
  );
  const set = (key: keyof Typed) => (value: string) =>
    setTyped((current) => ({ ...current, [key]: value }));
  // Medicine is not taken in without the day it may be used until: that day is what the store is warned about
  // and what a dose given after it is said of. Both are the farm's own days, so they sort as text.
  const expiredWhenBought =
    typed.expiresOn !== "" && typed.expiresOn < purchasedOn;
  const complete =
    chosen !== undefined &&
    typed.quantity.trim() !== "" &&
    Number(typed.doses) > 0 &&
    Number(typed.price) > 0 &&
    typed.seller.trim() !== "" &&
    typed.expiresOn !== "" &&
    !expiredWhenBought;

  return (
    <FormSheet
      description={t("drugs.buyHint")}
      onOpenChange={onOpenChange}
      onSubmit={() => {
        if (!chosen) {
          return;
        }
        buy.mutate({
          drugProductId: chosen.id,
          quantity: typed.quantity.trim(),
          doses: Number(typed.doses),
          priceBdt: Number(typed.price),
          seller: { name: typed.seller.trim() },
          purchasedOn,
          paymentMethod,
          lotNumber: typed.lotNumber.trim() || undefined,
          expiresOn: typed.expiresOn,
        });
      }}
      open={open}
      pending={buy.isPending}
      ready={complete}
      submitLabel={t("drugs.recordPurchase")}
      title={t("drugs.buy")}
    >
      {chosen ? (
        <>
          <FormField id="buy-product" label={t("prescribe.product")}>
            <NativeSelect
              id="buy-product"
              onChange={(event) => setChosenId(event.target.value)}
              value={chosen.id}
            >
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {productName(product, language)}
                </option>
              ))}
            </NativeSelect>
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="buy-quantity" label={t("drugs.quantity")}>
              <Input
                autoComplete="off"
                id="buy-quantity"
                onChange={(event) => set("quantity")(event.target.value)}
                value={typed.quantity}
              />
            </FormField>
            <FormField id="buy-doses" label={t("drugs.doses")}>
              <Input
                id="buy-doses"
                inputMode="numeric"
                min={0}
                onChange={(event) => set("doses")(event.target.value)}
                type="number"
                value={typed.doses}
              />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="buy-price" label={t("drugs.price")}>
              <Input
                id="buy-price"
                inputMode="numeric"
                min={0}
                onChange={(event) => set("price")(event.target.value)}
                type="number"
                value={typed.price}
              />
            </FormField>
            <PaymentMethodField
              id="buy-paid-by"
              onChange={setPaymentMethod}
              value={paymentMethod}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="buy-seller" label={t("drugs.seller")}>
              <Input
                autoComplete="off"
                id="buy-seller"
                onChange={(event) => set("seller")(event.target.value)}
                value={typed.seller}
              />
            </FormField>
            <FormField id="buy-on" label={t("drugs.boughtOn")}>
              <Input
                id="buy-on"
                onChange={(event) => setPurchasedOn(event.target.value)}
                type="date"
                value={purchasedOn}
              />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="buy-lot" label={t("lots.lotNumber")}>
              <Input
                autoComplete="off"
                id="buy-lot"
                maxLength={60}
                onChange={(event) => set("lotNumber")(event.target.value)}
                value={typed.lotNumber}
              />
            </FormField>
            <FormField
              hint={
                expiredWhenBought
                  ? t("refusal.expiredWhenBought")
                  : t("lots.expiresOnHint")
              }
              id="buy-expires"
              label={t("lots.expiresOn")}
            >
              <Input
                aria-invalid={expiredWhenBought}
                id="buy-expires"
                min={purchasedOn}
                onChange={(event) => set("expiresOn")(event.target.value)}
                required
                type="date"
                value={typed.expiresOn}
              />
            </FormField>
          </div>

          <PerDose typed={typed} />
        </>
      ) : (
        <p className="text-muted-foreground text-sm">{t("drugs.none")}</p>
      )}
    </FormSheet>
  );
};
