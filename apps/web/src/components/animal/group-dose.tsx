import { daysOfADoseNotPrescribed } from "@OpenFarm/domain";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Pill } from "lucide-react";
import { useState } from "react";

import { DoseDays } from "@/components/animal/animal-acts";
import type { HerdRow } from "@/components/animal/herd-list";
import { FormDialog, FormField, NativeSelect } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { momentOfField } from "@/lib/farm-moment";
import { useRefused } from "@/lib/refused";
import { refusedLines } from "@/lib/several-refused";
import { toast } from "@/lib/toast";
import { orpc } from "@/utils/orpc";

/**
 * One dose not prescribed for every animal ticked on the herd list — the pharmacy's wormer for a Pen of calves — rather
 * than her page and the dose dialog once each. Each animal's dose is still her own, held as one given alone; the ones
 * the farm would not dose are named with why, and the rest are written. The Owner's and the Manager's, as one dose is.
 */
export const GroupDose = ({
  chosen,
  may,
  onDone,
}: {
  chosen: HerdRow[];
  /** Whether this person may write a dose not prescribed: nothing is drawn for one who may not. */
  may: boolean;
  onDone: () => void;
}) => {
  const { t, language } = useLanguage();
  const onError = useRefused();
  const [open, setOpen] = useState(false);
  const drugs = useQuery({ ...orpc.drugs.list.queryOptions(), enabled: open });
  const byDefault = useQuery({
    ...orpc.drugs.defaultDays.queryOptions(),
    enabled: open,
  });
  const [productId, setProductId] = useState("");
  const [givenAt, setGivenAt] = useState("");
  const [advice, setAdvice] = useState("");
  const count = formatNumber(chosen.length, language);
  const give = useMutation(
    orpc.treatments.giveNotPrescribedMany.mutationOptions({
      onSuccess: ({ given, refused }) => {
        setOpen(false);
        setProductId("");
        setGivenAt("");
        setAdvice("");
        if (given.length > 0) {
          toast.success(
            t("dose.groupGiven", {
              count: formatNumber(given.length, language),
            })
          );
        }
        if (refused.length > 0) {
          // Who, and why, and the ticks kept: somebody has something to do about them.
          toast.error(
            t("dose.groupRefused", {
              count: formatNumber(refused.length, language),
            }),
            {
              description: refusedLines(refused, t, (iso) =>
                formatDate(new Date(iso), language, "date")
              ).join(" · "),
            }
          );
          return;
        }
        onDone();
      },
      onError,
    })
  );
  const products = (drugs.data ?? []).filter((one) => one.retiredAt === null);
  const product = products.find((one) => one.id === productId);
  const mayBeGiven =
    product !== undefined &&
    daysOfADoseNotPrescribed(product, {
      milkDays: byDefault.data?.milkDays ?? null,
      meatDays: byDefault.data?.meatDays ?? null,
    }) !== null;
  if (!may) {
    return null;
  }
  return (
    <>
      <Button onClick={() => setOpen(true)} type="button" variant="outline">
        <Pill aria-hidden data-icon="inline-start" />
        {t("dose.group", { count })}
      </Button>
      <FormDialog
        description={chosen.map((one) => one.tagNumber).join(", ")}
        onOpenChange={setOpen}
        onSubmit={() =>
          give.mutate({
            animalTags: chosen.map((one) => one.tagNumber),
            productId,
            advice: advice.trim(),
            // Read as the farm's day and time, not the phone's (lib/farm-moment).
            ...(givenAt ? { givenAt: new Date(momentOfField(givenAt)) } : {}),
          })
        }
        open={open}
        pending={give.isPending}
        ready={mayBeGiven && advice.trim() !== ""}
        submitLabel={t("dose.group", { count })}
        title={t("dose.group", { count })}
      >
        <FormField id="group-dose-product" label={t("dose.product")}>
          <NativeSelect
            id="group-dose-product"
            onChange={(event) => setProductId(event.target.value)}
            required
            value={productId}
          >
            <option value="">{t("dose.pick")}</option>
            {products.map((one) => (
              <option key={one.id} value={one.id}>
                {language === "en" ? (one.nameEn ?? one.nameBn) : one.nameBn}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        {product ? (
          <DoseDays byDefault={byDefault.data} product={product} />
        ) : null}
        <FormField id="group-dose-when" label={t("dose.givenAt")}>
          <Input
            id="group-dose-when"
            onChange={(event) => setGivenAt(event.target.value)}
            type="datetime-local"
            value={givenAt}
          />
        </FormField>
        <FormField id="group-dose-advice" label={t("dose.advice")}>
          <Input
            id="group-dose-advice"
            maxLength={300}
            onChange={(event) => setAdvice(event.target.value)}
            required
            value={advice}
          />
        </FormField>
      </FormDialog>
    </>
  );
};
