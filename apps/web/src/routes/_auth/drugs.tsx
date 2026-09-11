import { formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Label } from "@OpenFarm/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { useLanguage, useT } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

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
    </div>
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
    milkWithdrawalDays: number | null;
    meatWithdrawalDays: number | null;
    retiredAt: Date | null;
    prescribable: boolean;
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
          {product.nameBn}
          {product.retiredAt ? ` · ${t("drugs.retired")}` : ""}
        </span>
        {product.retiredAt ? null : (
          <Button onClick={onRetire} size="sm" type="button" variant="ghost">
            {t("drugs.retire")}
          </Button>
        )}
      </div>

      {product.prescribable ? (
        <p className="text-muted-foreground text-sm">
          {t("drugs.milkDays")}:{" "}
          {t("drugs.days", {
            count: formatNumber(product.milkWithdrawalDays ?? 0, language),
          })}{" "}
          · {t("drugs.meatDays")}:{" "}
          {t("drugs.days", {
            count: formatNumber(product.meatWithdrawalDays ?? 0, language),
          })}
        </p>
      ) : (
        <p className="text-sm text-amber-500">{t("drugs.blank")}</p>
      )}

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
              min={0}
              onChange={(event) => setMilk(event.target.value)}
              type="number"
              value={milk}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`meat-${product.id}`}>{t("drugs.meatDays")}</Label>
            <Input
              className="w-24"
              id={`meat-${product.id}`}
              min={0}
              onChange={(event) => setMeat(event.target.value)}
              type="number"
              value={meat}
            />
          </div>
          <Button disabled={milk === "" || meat === ""} type="submit">
            {t("drugs.save")}
          </Button>
        </form>
      ) : (
        <p className="text-muted-foreground text-xs">{t("drugs.vetOnly")}</p>
      )}
    </li>
  );
};

export const Route = createFileRoute("/_auth/drugs")({
  component: DrugsPage,
});
