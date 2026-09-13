import type { NotPrescribable, PaymentMethod } from "@OpenFarm/domain";
import { farmDayOf } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { PaymentMethodField } from "@/components/payment-method";
import { useLanguage, useT } from "@/i18n/language-provider";
import { wordedRefusal } from "@/lib/correction-refusal";
import { orpc } from "@/utils/orpc";

/** Why a product may not be prescribed, in the reader's words. Typed by the reason, so a
 *  new one is a compile error here rather than a blank line on a Vet's screen. */
const WHY_NOT: Record<NotPrescribable, MessageKey> = {
  no_withdrawal_days: "drugs.blank",
  retired: "drugs.retiredReason",
};

/**
 * The farm's Drug List: what it treats animals with, and what each product costs the milk
 * and the meat in days.
 *
 * There is no national table for this — the days come off the label and the prescribing
 * Vet — so this list is the only place they exist, and it is what the farm shows a slaughter
 * vet asking about the last thirty days. A product whose days are blank sits here saying so:
 * the farm owns it, and nothing may be prescribed from it yet.
 */
const DrugsPage = () => {
  const t = useT();
  const queryClient = useQueryClient();
  const me = useQuery(orpc.people.me.queryOptions());
  const drugs = useQuery(orpc.drugs.list.queryOptions());
  const [name, setName] = useState("");
  const isVet = me.data?.roles.includes("vet") ?? false;
  const buys = me.data?.roles.includes("manager") ?? false;

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.drugs.key() });
  const add = useMutation(
    orpc.drugs.add.mutationOptions({
      onSuccess: () => {
        setName("");
        refresh();
      },
      onError: (error) => toast.error(error.message),
    })
  );
  const retire = useMutation(
    orpc.drugs.retire.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error(error.message),
    })
  );

  return (
    <div className="container mx-auto max-w-2xl space-y-5 px-4 py-6">
      <h1 className="text-lg font-medium">{t("drugs.title")}</h1>

      {drugs.data?.length ? (
        <ul className="space-y-2">
          {drugs.data.map((product) => (
            <Product
              isVet={isVet}
              key={product.id}
              onChanged={refresh}
              onRetire={() => retire.mutate({ id: product.id })}
              product={product}
            />
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t("drugs.none")}</p>
      )}

      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) {
            add.mutate({ name: { bn: name.trim() } });
          }
        }}
      >
        <div className="flex-1 space-y-1">
          <Label htmlFor="drug-name">{t("drugs.name")}</Label>
          <Input
            id="drug-name"
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </div>
        <Button type="submit">{t("drugs.add")}</Button>
      </form>

      {buys && drugs.data ? (
        <BuyMedicine
          products={drugs.data.filter((product) => !product.retiredAt)}
        />
      ) : null}
    </div>
  );
};

const NOTHING_BOUGHT = {
  quantity: "",
  doses: "",
  price: "",
  seller: "",
};

/**
 * Medicine bought for the Drug List: how much as the box says it, roughly how many doses that is, what
 * it cost and who sold it. The Manager's, and the farm's money for the medicine comes from it.
 */
const BuyMedicine = ({
  products,
}: {
  products: { id: string; nameBn: string }[];
}) => {
  const t = useT();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const [productId, setProductId] = useState("");
  const [typed, setTyped] = useState(NOTHING_BOUGHT);
  const [purchasedOn, setPurchasedOn] = useState(() => farmDayOf(new Date()));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const chosen = products.find(
    (product) => product.id === (productId || products[0]?.id)
  );
  const bought = useQuery({
    ...orpc.drugs.purchases.queryOptions({
      input: { drugProductId: chosen?.id ?? "" },
    }),
    enabled: chosen !== undefined,
  });
  const buy = useMutation(
    orpc.drugs.purchase.mutationOptions({
      onSuccess: async () => {
        setTyped(NOTHING_BOUGHT);
        toast.success(t("drugs.bought"));
        await queryClient.invalidateQueries({ queryKey: orpc.drugs.key() });
      },
      onError: (error) =>
        toast.error(
          wordedRefusal(error, t) ?? (error.message || t("common.error"))
        ),
    })
  );
  if (!chosen) {
    return null;
  }
  const set = (key: keyof typeof NOTHING_BOUGHT) => (value: string) =>
    setTyped((current) => ({ ...current, [key]: value }));
  const complete =
    typed.quantity.trim() !== "" &&
    Number(typed.doses) > 0 &&
    Number(typed.price) > 0 &&
    typed.seller.trim() !== "";
  return (
    <section className="space-y-2">
      <h2 className="font-medium">{t("drugs.buy")}</h2>
      <form
        className="space-y-2 rounded-lg border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          buy.mutate({
            drugProductId: chosen.id,
            quantity: typed.quantity.trim(),
            doses: Number(typed.doses),
            priceBdt: Number(typed.price),
            seller: { name: typed.seller.trim() },
            purchasedOn,
            paymentMethod,
          });
        }}
      >
        <select
          aria-label={t("drugs.title")}
          className="bg-background h-9 w-full rounded-md border px-2 text-sm"
          onChange={(event) => setProductId(event.target.value)}
          value={chosen.id}
        >
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.nameBn}
            </option>
          ))}
        </select>
        {(
          [
            ["quantity", "drugs.quantity", "text"],
            ["doses", "drugs.doses", "number"],
            ["price", "drugs.price", "number"],
            ["seller", "drugs.seller", "text"],
          ] as const
        ).map(([key, label, type]) => (
          <div className="space-y-1" key={key}>
            <Label htmlFor={`buy-${key}`}>{t(label)}</Label>
            <Input
              id={`buy-${key}`}
              onChange={(event) => set(key)(event.target.value)}
              type={type}
              value={typed[key]}
            />
          </div>
        ))}
        <div className="space-y-1">
          <Label htmlFor="buy-on">{t("drugs.boughtOn")}</Label>
          <Input
            id="buy-on"
            onChange={(event) => setPurchasedOn(event.target.value)}
            type="date"
            value={purchasedOn}
          />
        </div>
        <PaymentMethodField
          id="buy-paid-by"
          onChange={setPaymentMethod}
          value={paymentMethod}
        />
        <Button
          disabled={!complete || buy.isPending}
          type="submit"
          variant="outline"
        >
          {t("drugs.recordPurchase")}
        </Button>
      </form>
      {bought.data?.length ? (
        <ul className="space-y-1 text-sm">
          {bought.data.map((one) => (
            <li className="rounded-lg border p-2" key={one.id}>
              {formatDate(one.purchasedOn, language)} · {one.quantity} ·{" "}
              {t("drugs.dosesHeld", {
                doses: formatNumber(one.doses, language),
              })}{" "}
              · ৳{formatNumber(one.priceBdt, language)} · {one.sellerName}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
};

/** One product: its days, or the fact that nobody has written them yet. */
const Product = ({
  product,
  isVet,
  onChanged,
  onRetire,
}: {
  product: {
    id: string;
    nameBn: string;
    nameEn: string | null;
    milkWithdrawalDays: number | null;
    meatWithdrawalDays: number | null;
    daysSetByName: string | null;
    daysSetAt: Date | null;
    retiredAt: Date | null;
    prescribable: boolean;
    whyNot: NotPrescribable | null;
  };
  isVet: boolean;
  onChanged: () => void;
  onRetire: () => void;
}) => {
  const t = useT();
  const { language } = useLanguage();
  const [milk, setMilk] = useState(
    product.milkWithdrawalDays === null
      ? ""
      : String(product.milkWithdrawalDays)
  );
  const [meat, setMeat] = useState(
    product.meatWithdrawalDays === null
      ? ""
      : String(product.meatWithdrawalDays)
  );
  const save = useMutation(
    orpc.drugs.setWithdrawal.mutationOptions({
      onSuccess: onChanged,
      onError: (error) => toast.error(error.message),
    })
  );

  return (
    <li className="space-y-2 rounded-lg border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className={product.retiredAt ? "text-muted-foreground" : ""}>
          {language === "en" && product.nameEn
            ? product.nameEn
            : product.nameBn}
          {product.retiredAt ? ` · ${t("drugs.retired")}` : ""}
        </span>
        {product.retiredAt ? null : (
          <Button onClick={onRetire} size="sm" type="button" variant="ghost">
            {t("drugs.retire")}
          </Button>
        )}
      </div>

      {product.milkWithdrawalDays === null ||
      product.meatWithdrawalDays === null ? null : (
        <p className="text-muted-foreground text-sm">
          {t("drugs.milkDays")}:{" "}
          {t("drugs.days", {
            count: formatNumber(product.milkWithdrawalDays, language),
          })}{" "}
          · {t("drugs.meatDays")}:{" "}
          {t("drugs.days", {
            count: formatNumber(product.meatWithdrawalDays, language),
          })}
          {product.daysSetByName && product.daysSetAt ? (
            <span className="block text-xs">
              {t("drugs.setBy", {
                name: product.daysSetByName,
                date: formatDate(new Date(product.daysSetAt), language, "date"),
              })}
            </span>
          ) : null}
        </p>
      )}
      {product.whyNot ? (
        <p className="text-sm text-amber-500">{t(WHY_NOT[product.whyNot])}</p>
      ) : null}

      {isVet ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate({
              id: product.id,
              milkWithdrawalDays: Number(milk),
              meatWithdrawalDays: Number(meat),
            });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor={`milk-${product.id}`}>{t("drugs.milkDays")}</Label>
            <Input
              className="w-24"
              id={`milk-${product.id}`}
              max={365}
              min={0}
              onChange={(event) => setMilk(event.target.value)}
              step="1"
              type="number"
              value={milk}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`meat-${product.id}`}>{t("drugs.meatDays")}</Label>
            <Input
              className="w-24"
              id={`meat-${product.id}`}
              max={365}
              min={0}
              onChange={(event) => setMeat(event.target.value)}
              step="1"
              type="number"
              value={meat}
            />
          </div>
          <Button disabled={milk === "" || meat === ""} type="submit">
            {t("drugs.save")}
          </Button>
        </form>
      ) : (
        <p className="text-muted-foreground text-xs">
          {t("drugs.managerAdds")}
        </p>
      )}
    </li>
  );
};

export const Route = createFileRoute("/_auth/drugs")({
  /** The Vet keeps it, the Manager adds to it, the Owner reads it — and Barn Staff have no
   *  business in it at all, so they are not shown a form that would refuse them. */
  beforeLoad: ({ context }) => {
    const { roles } = context.me;
    const allowed = new Set(["owner", "manager", "vet"]);
    if (!roles.some((role) => allowed.has(role))) {
      throw redirect({ to: "/today", search: {} });
    }
  },
  component: DrugsPage,
});
