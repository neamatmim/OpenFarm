import { daysOfADoseNotPrescribed } from "@OpenFarm/domain";
import { Input } from "@OpenFarm/ui/components/input";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { FormField, NativeSelect } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { momentOfField } from "@/lib/farm-moment";
import { orpc } from "@/utils/orpc";

/** What the chosen medicine will hold her for: its own days, the Vet's default, or nothing yet — ask the Vet. */
const DoseDays = ({
  product,
  byDefault,
}: {
  product: {
    milkWithdrawalDays: number | null;
    meatWithdrawalDays: number | null;
  };
  byDefault: { milkDays: number | null; meatDays: number | null } | undefined;
}) => {
  const { t } = useLanguage();
  const days = daysOfADoseNotPrescribed(product, {
    milkDays: byDefault?.milkDays ?? null,
    meatDays: byDefault?.meatDays ?? null,
  });
  if (!days) {
    return <p className="text-danger text-sm">{t("dose.askTheVet")}</p>;
  }
  const milk = product.milkWithdrawalDays ?? days.milkWithdrawalDays ?? 0;
  const meat = product.meatWithdrawalDays ?? days.meatWithdrawalDays ?? 0;
  const tookTheDefault =
    days.milkWithdrawalDays !== null || days.meatWithdrawalDays !== null;
  return (
    <p className="bg-muted rounded-md px-3 py-2 text-sm">
      {t(tookTheDefault ? "dose.holdsDefault" : "dose.holdsOwn", {
        milk,
        meat,
      })}
    </p>
  );
};

/**
 * A dose not prescribed as it is being written — which medicine, when, and who advised it — for one animal or a Pen.
 * One form, so the dose given to one cow and to her Pen ask the same things, offer the same medicines and say the same
 * days held.
 */
export const useDoseForm = (open: boolean) => {
  const drugs = useQuery({ ...orpc.drugs.list.queryOptions(), enabled: open });
  const byDefault = useQuery({
    ...orpc.drugs.defaultDays.queryOptions(),
    enabled: open,
  });
  const [productId, setProductId] = useState("");
  const [givenAt, setGivenAt] = useState("");
  const [advice, setAdvice] = useState("");
  const products = (drugs.data ?? []).filter((one) => one.retiredAt === null);
  const chosen = products.find((one) => one.id === productId);
  const mayBeGiven =
    chosen !== undefined &&
    daysOfADoseNotPrescribed(chosen, {
      milkDays: byDefault.data?.milkDays ?? null,
      meatDays: byDefault.data?.meatDays ?? null,
    }) !== null;
  return {
    products,
    chosen,
    byDefault: byDefault.data,
    productId,
    givenAt,
    advice,
    setProductId,
    setGivenAt,
    setAdvice,
    ready: mayBeGiven && advice.trim() !== "",
    /** What is sent: the medicine, the advice, and when — read as the farm's day and time, not the phone's
     *  (lib/farm-moment). */
    sent: () => ({
      productId,
      advice: advice.trim(),
      ...(givenAt ? { givenAt: new Date(momentOfField(givenAt)) } : {}),
    }),
    handleClear: () => {
      setProductId("");
      setGivenAt("");
      setAdvice("");
    },
  };
};

export type DoseForm = ReturnType<typeof useDoseForm>;

/** The dose form's fields: the medicine and the days it holds her, when it was given, and who advised it. */
export const DoseFields = ({ form, id }: { form: DoseForm; id: string }) => {
  const { t, language } = useLanguage();
  return (
    <>
      <FormField id={`${id}-product`} label={t("dose.product")}>
        <NativeSelect
          id={`${id}-product`}
          onChange={(event) => form.setProductId(event.target.value)}
          required
          value={form.productId}
        >
          <option value="">{t("dose.pick")}</option>
          {form.products.map((one) => (
            <option key={one.id} value={one.id}>
              {language === "en" ? (one.nameEn ?? one.nameBn) : one.nameBn}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      {form.chosen ? (
        <DoseDays byDefault={form.byDefault} product={form.chosen} />
      ) : null}
      <FormField id={`${id}-when`} label={t("dose.givenAt")}>
        <Input
          id={`${id}-when`}
          onChange={(event) => form.setGivenAt(event.target.value)}
          type="datetime-local"
          value={form.givenAt}
        />
      </FormField>
      <FormField id={`${id}-advice`} label={t("dose.advice")}>
        <Input
          id={`${id}-advice`}
          maxLength={300}
          onChange={(event) => form.setAdvice(event.target.value)}
          required
          value={form.advice}
        />
      </FormField>
    </>
  );
};
