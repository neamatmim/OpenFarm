import type { DoseRoute } from "@OpenFarm/domain";
import { MAX_COURSE_DAYS, ROUTES } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";
import { formatNumber } from "@OpenFarm/i18n";
import { Input } from "@OpenFarm/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { productName } from "@/components/drugs/drug-types";
import { FormField, FormSheet, NativeSelect } from "@/components/page-kit";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

import type { Made } from "./vet-types";
import { AnimalLink, useRefusal } from "./vet-types";

/** The times as the Vet types them: separated by commas. */
const timesOf = (typed: string) =>
  typed
    .split(",")
    .map((time) => time.trim())
    .filter(Boolean);

/** How many doses the order comes to, worked out as it is typed: a piece of work for somebody in the shed each. */
const DosesToCome = ({ times, days }: { times: string; days: string }) => {
  const { t, language } = useLanguage();
  const count = timesOf(times).length * Number(days);
  if (!(count > 0)) {
    return null;
  }
  return (
    <p className="bg-muted text-muted-foreground rounded-md px-3 py-2 text-sm tabular-nums">
      {t("prescribe.dosesPreview", { doses: formatNumber(count, language) })}
    </p>
  );
};

/**
 * The order itself, in a sheet beside the Vet's conclusion: which product, how much, how it goes in, at what times and
 * for how many days. The farm turns it into one piece of work per dose, so the times are what somebody in the shed will
 * be asked to do something at.
 */
export const PrescribeSheet = ({
  made,
  onOpenChange,
}: {
  /** The conclusion being treated; none when the sheet is closed. */
  made: Made | null;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t, language } = useLanguage();
  const onError = useRefusal();
  const [productId, setProductId] = useState("");
  const [dose, setDose] = useState("");
  const [route, setRoute] = useState<DoseRoute>("intramuscular");
  const [times, setTimes] = useState("08:00");
  const [days, setDays] = useState("3");
  const drugs = useQuery(orpc.drugs.list.queryOptions());
  const idPrefix = made?.id ?? "none";

  const write = useMutation(
    orpc.prescriptions.prescribe.mutationOptions({
      onSuccess: ({ doses }) => {
        setDose("");
        toast.success(t("prescribe.written", { doses }));
        onOpenChange(false);
      },
      onError,
    })
  );
  // Only what may actually be prescribed: a product whose withdrawal days nobody has written
  // is milk nobody could call safe afterwards, and offering it would only end in a refusal.
  const prescribable = (drugs.data ?? []).filter((one) => one.prescribable);

  return (
    <FormSheet
      description={t("prescribe.sheetHint")}
      onOpenChange={onOpenChange}
      onSubmit={() => {
        if (!made) {
          return;
        }
        write.mutate({
          animalTag: made.tagNumber,
          diagnosisId: made.id,
          productId,
          dose: dose.trim(),
          route,
          times: timesOf(times),
          days: Number(days),
        });
      }}
      open={made !== null}
      pending={write.isPending}
      ready={made !== null && productId !== "" && dose.trim() !== ""}
      submitLabel={t("prescribe.write")}
      title={t("prescribe.write")}
    >
      {made ? (
        <div className="bg-muted/60 flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
          <AnimalLink tagNumber={made.tagNumber} />
          <span className="font-medium">{made.disease}</span>
        </div>
      ) : null}

      <FormField id={`product-${idPrefix}`} label={t("prescribe.product")}>
        <NativeSelect
          id={`product-${idPrefix}`}
          onChange={(event) => setProductId(event.target.value)}
          value={productId}
        >
          <option value="">—</option>
          {prescribable.map((one) => (
            <option key={one.id} value={one.id}>
              {productName(one, language)}
            </option>
          ))}
        </NativeSelect>
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id={`dose-${idPrefix}`} label={t("prescribe.dose")}>
          <Input
            autoComplete="off"
            id={`dose-${idPrefix}`}
            onChange={(event) => setDose(event.target.value)}
            value={dose}
          />
        </FormField>
        <FormField id={`route-${idPrefix}`} label={t("prescribe.route")}>
          <NativeSelect
            id={`route-${idPrefix}`}
            onChange={(event) => setRoute(event.target.value as DoseRoute)}
            value={route}
          >
            {ROUTES.map((one) => (
              <option key={one} value={one}>
                {t(`route.${one}` as MessageKey)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>

      <div className="grid grid-cols-[1fr_7rem] gap-4">
        <FormField
          hint={t("prescribe.timesHint")}
          id={`times-${idPrefix}`}
          label={t("prescribe.times")}
        >
          <Input
            autoComplete="off"
            id={`times-${idPrefix}`}
            onChange={(event) => setTimes(event.target.value)}
            value={times}
          />
        </FormField>
        <FormField id={`days-${idPrefix}`} label={t("prescribe.days")}>
          <Input
            id={`days-${idPrefix}`}
            inputMode="numeric"
            max={MAX_COURSE_DAYS}
            min={1}
            onChange={(event) => setDays(event.target.value)}
            step="1"
            type="number"
            value={days}
          />
        </FormField>
      </div>

      <DosesToCome days={days} times={times} />
    </FormSheet>
  );
};
