import { priceAtWeight } from "@OpenFarm/domain";
import type { Language, MessageKey, MessageParams } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Input } from "@OpenFarm/ui/components/input";
import { Textarea } from "@OpenFarm/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { FormField, FormSheet, NativeSelect } from "@/components/page-kit";
import type { PickerOption } from "@/components/searchable-picker";
import { SearchablePicker } from "@/components/searchable-picker";
import { useLanguage } from "@/i18n/language-provider";
import { useRefused } from "@/lib/refused";
import { orpc } from "@/utils/orpc";

/** Where she is going: nothing chosen yet, the Farm's own herd, or a Venture by its id. */
const THE_FARM = "farm";

type Movable = Awaited<
  ReturnType<typeof orpc.ventures.movableAnimals.call>
>[number];

/** Where she is now, as the "who takes her on" list names it — so where she already is can be left out of it. */
const purseOf = (her: Movable | undefined): string | null => {
  if (!her) {
    return null;
  }
  return her.purse?.id ?? THE_FARM;
};

/** One animal as the picker offers her: her tag, and her Pen, whose she is and what she last weighed beneath. */
const asOption = (
  one: Movable,
  t: (key: MessageKey, params?: MessageParams) => string,
  language: Language
): PickerOption => ({
  value: one.tagNumber,
  label: one.tagNumber,
  detail: t("ventures.movableDetail", {
    pen: one.penName,
    purse: one.purse?.name ?? t("intake.theFarms"),
    weight: formatNumber(one.weightKg, language),
    date: formatDate(new Date(one.weighedAt), language, "date"),
  }),
});

/**
 * An Animal sold between the Farm's herd and a Venture.
 *
 * She is chosen from the animals that may move — bought-in, Fattening, still here, weighed, not yet ready — rather
 * than typed from memory, and each is shown with her Pen, whose she is now and what she last weighed. Where she
 * is going leaves out where she already is. The rate is the Owner's to enter and the weight is not hers to choose:
 * the price is what that latest Weigh-in and the rate make it, shown before she commits. The note is asked for
 * rather than offered, because an Investor asking years later why his bull was worth that is owed a reason.
 *
 * Opened from a bull's own page with him chosen, or from a Venture's page with it as the one taking him on.
 */
export const InternalSaleSheet = ({
  open,
  onOpenChange,
  startWith,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  startWith?: { tagNumber?: string; toVentureId?: string };
}) => {
  const { t, language } = useLanguage();
  const refused = useRefused();
  const [tagNumber, setTagNumber] = useState(startWith?.tagNumber ?? "");
  const [to, setTo] = useState(startWith?.toVentureId ?? "");
  const [rate, setRate] = useState("");
  const [note, setNote] = useState("");
  const [soldOn, setSoldOn] = useState("");
  const [reference, setReference] = useState("");
  // Read only once it is open: it sits closed on every animal's page, where most people may read neither.
  const ventures = useQuery({
    ...orpc.ventures.takingAnimals.queryOptions(),
    enabled: open,
  });
  const movable = useQuery({
    ...orpc.ventures.movableAnimals.queryOptions(),
    enabled: open,
  });
  const selling = useMutation(
    orpc.ventures.sellInternally.mutationOptions({
      onError: refused,
      onSuccess: (sold) => {
        setTagNumber(startWith?.tagNumber ?? "");
        setTo(startWith?.toVentureId ?? "");
        setRate("");
        setNote("");
        setSoldOn("");
        setReference("");
        onOpenChange(false);
        toast.success(
          t("ventures.soldInternally", {
            price: formatNumber(sold.priceBdt, language),
          })
        );
      },
    })
  );
  const animals = movable.data ?? [];
  const her = animals.find((one) => one.tagNumber === tagNumber);
  const weightKg = her?.weightKg ?? 0;
  const rateBdtPerKg = Number(rate);
  // Struck by the same function the farm strikes it with, so what she reads is what she commits to and
  // a refusal means she was weighed again, not that two roundings disagreed.
  const priceBdt = priceAtWeight(weightKg, rateBdtPerKg);
  const herPurse = purseOf(her);
  const toChosen = to !== "" && to !== herPurse;
  const ready =
    her !== undefined &&
    toChosen &&
    rateBdtPerKg > 0 &&
    note.trim() !== "" &&
    reference.trim() !== "" &&
    soldOn !== "";
  const options = animals.map((one) => asOption(one, t, language));
  return (
    <FormSheet
      description={t("ventures.internalSaleHint")}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        selling.mutate({
          tagNumber,
          toVentureId: to === THE_FARM ? undefined : to,
          rateBdtPerKg,
          note,
          soldOn,
          paymentMethod: "bank",
          reference,
          priceBdt,
        })
      }
      open={open}
      pending={selling.isPending}
      ready={ready}
      submitLabel={t("ventures.sellInternally")}
      title={t("ventures.sellInternally")}
    >
      <FormField id="internal-tag" label={t("ventures.whichAnimal")}>
        <SearchablePicker
          empty={t("ventures.noneMovable")}
          id="internal-tag"
          loading={movable.isPending}
          onChange={setTagNumber}
          options={options}
          placeholder={t("picker.findAnimal")}
          value={tagNumber}
        />
      </FormField>
      <FormField
        hint={t("ventures.toPurseHint")}
        id="internal-to"
        label={t("ventures.toPurse")}
      >
        <NativeSelect
          id="internal-to"
          onChange={(event) => setTo(event.target.value)}
          value={toChosen ? to : ""}
        >
          <option disabled value="">
            {t("ventures.choosePurse")}
          </option>
          {herPurse === THE_FARM ? null : (
            <option value={THE_FARM}>{t("intake.theFarms")}</option>
          )}
          {(ventures.data ?? [])
            .filter((one) => one.id !== herPurse)
            .map((one) => (
              <option key={one.id} value={one.id}>
                {one.name}
              </option>
            ))}
        </NativeSelect>
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          hint={t("ventures.rateHint")}
          id="internal-rate"
          label={t("ventures.rate")}
        >
          <Input
            id="internal-rate"
            inputMode="numeric"
            onChange={(event) => setRate(event.target.value)}
            type="number"
            value={rate}
          />
        </FormField>
        <FormField id="internal-sold-on" label={t("ventures.soldOn")}>
          <Input
            id="internal-sold-on"
            onChange={(event) => setSoldOn(event.target.value)}
            type="date"
            value={soldOn}
          />
        </FormField>
      </div>
      {weightKg === 0 ? null : (
        <p className="bg-muted text-muted-foreground rounded-md px-3 py-2 text-sm tabular-nums">
          {t("ventures.priceFromWeight", {
            weight: formatNumber(weightKg, language),
            price: formatNumber(priceBdt, language),
          })}
        </p>
      )}
      <FormField
        hint={t("ventures.referenceHint")}
        id="internal-reference"
        label={t("ventures.reference")}
      >
        <Input
          autoComplete="off"
          id="internal-reference"
          onChange={(event) => setReference(event.target.value)}
          value={reference}
        />
      </FormField>
      <FormField
        hint={t("ventures.whereTheRateCameFromHint")}
        id="internal-note"
        label={t("ventures.whereTheRateCameFrom")}
      >
        <Textarea
          id="internal-note"
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          value={note}
        />
      </FormField>
    </FormSheet>
  );
};
