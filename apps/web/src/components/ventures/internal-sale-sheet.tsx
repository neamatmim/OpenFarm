import { farmDayOf, priceAtWeight, weighedTooLongAgo } from "@OpenFarm/domain";
import type { Language, MessageKey, MessageParams } from "@OpenFarm/i18n";
import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Input } from "@OpenFarm/ui/components/input";
import { Textarea } from "@OpenFarm/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import {
  NEXT_EID,
  WindowChoice,
  windowOf,
  windowReady,
} from "@/components/fattening/window-choice";
import type { WindowPick } from "@/components/fattening/window-choice";
import { Notice } from "@/components/page";
import { FormField, FormSheet, NativeSelect } from "@/components/page-kit";
import { FarmAccountField } from "@/components/payment-method";
import type { PickerOption } from "@/components/searchable-picker";
import { SearchablePicker } from "@/components/searchable-picker";
import { useLanguage } from "@/i18n/language-provider";
import { allTyped } from "@/lib/all-typed";
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

/** The fortnightly round, until the farm's own figure is read. */
const DEFAULT_PRICE_WEIGH_IN_DAYS = 14;

/**
 * One animal as the picker offers her: her tag, and her Pen, whose she is and what she last weighed beneath — and,
 * where that weighing is too old to price on, that she is to be weighed again first.
 */
const asOption = (
  one: Movable,
  t: (key: MessageKey, params?: MessageParams) => string,
  language: Language,
  tooOld: boolean
): PickerOption => ({
  value: one.tagNumber,
  label: one.tagNumber,
  detail: [
    t("ventures.movableDetail", {
      pen: one.penName,
      purse: one.purse?.name ?? t("intake.theFarms"),
      weight: formatNumber(one.weightKg, language),
      date: formatDate(new Date(one.weighedAt), language, "date"),
    }),
    tooOld ? t("ventures.weighAgainFirst") : "",
  ]
    .filter(Boolean)
    .join(" · "),
});

/** What is said of her weighing being too old: on the sheet, and when the act is pressed. */
const weighAgain = (
  tagNumber: string,
  days: number,
  t: (key: MessageKey, params?: MessageParams) => string,
  language: Language
) => ({
  said: t("ventures.weighThemAgain", {
    tags: tagNumber,
    days: formatNumber(days, language),
  }),
  at: "internal-tag",
});

/**
 * How old a weighing may be to strike a price on — the Owner's, read with the farm's other Venture figures — and
 * whether an animal's is older, judged on the day being typed, today until one is. The sale judges again on the day sent.
 */
const useTooOld = (open: boolean, soldOn: string, her: Movable | undefined) => {
  const farm = useQuery({ ...orpc.farm.current.queryOptions(), enabled: open });
  const days =
    (farm.data && "priceWeighInDays" in farm.data
      ? farm.data.priceWeighInDays
      : undefined) ?? DEFAULT_PRICE_WEIGH_IN_DAYS;
  const judgedOn = soldOn || farmDayOf(new Date());
  const { t, language } = useLanguage();
  const tooOld = (one: Movable) =>
    weighedTooLongAgo(new Date(one.weighedAt), judgedOn, days) !== null;
  return {
    tooOld,
    /** What is said of her, where her weighing is too old: on the sheet, and when the act is pressed. */
    weighHerAgain:
      her && tooOld(her)
        ? weighAgain(her.tagNumber, days, t, language)
        : undefined,
  };
};

/** Everything the sale needs said: an animal priced on a weighing recent enough, where she goes, a rate, and the rest. */
const readyToSell = (given: {
  chosen: boolean;
  toChosen: boolean;
  rateBdtPerKg: number;
  typed: boolean;
  windowSaid: boolean;
}): boolean =>
  given.chosen &&
  given.toChosen &&
  given.rateBdtPerKg > 0 &&
  given.typed &&
  given.windowSaid;

/** Where the Farm takes her on, the window of the Season she joins must be said; nowhere else is it asked. */
const windowSaid = (to: string, pick: WindowPick): boolean =>
  to !== THE_FARM || windowReady(pick);

/** The window sent: only where the Farm takes her on, and nothing for the next Eid. */
const windowFor = (to: string, pick: WindowPick) =>
  to === THE_FARM ? windowOf(pick) : undefined;

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
  // The Farm's bank account its own side of this went into or came out of.
  const [farmAccountId, setFarmAccountId] = useState("");
  // Where the Farm takes her on, the Season she joins: the next Eid unless another window is said.
  const [windowPick, setWindowPick] = useState<WindowPick>(NEXT_EID);
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
        setWindowPick(NEXT_EID);
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
  const { tooOld, weighHerAgain } = useTooOld(open, soldOn, her);
  const weightKg = her?.weightKg ?? 0;
  const rateBdtPerKg = Number(rate);
  // Struck by the same function the farm strikes it with, so what she reads is what she commits to and
  // a refusal means she was weighed again, not that two roundings disagreed.
  const priceBdt = priceAtWeight(weightKg, rateBdtPerKg);
  const herPurse = purseOf(her);
  const toChosen = to !== "" && to !== herPurse;
  const ready = readyToSell({
    chosen: her !== undefined && weighHerAgain === undefined,
    toChosen,
    rateBdtPerKg,
    typed: allTyped(note, reference, soldOn),
    windowSaid: windowSaid(to, windowPick),
  });
  const options = animals.map((one) => asOption(one, t, language, tooOld(one)));
  return (
    <FormSheet
      description={t("ventures.internalSaleHint")}
      onOpenChange={onOpenChange}
      onSubmit={() =>
        selling.mutate({
          tagNumber,
          toVentureId: to === THE_FARM ? undefined : to,
          targetWindow: windowFor(to, windowPick),
          rateBdtPerKg,
          note,
          soldOn,
          paymentMethod: "bank",
          reference,
          ...(farmAccountId ? { farmAccountId } : {}),
          priceBdt,
        })
      }
      missing={weighHerAgain}
      open={open}
      pending={selling.isPending}
      ready={ready}
      submitLabel={t("ventures.sellInternally")}
      title={t("ventures.sellInternally")}
      wide
    >
      <div className="grid gap-4 sm:grid-cols-2">
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
      </div>
      {weighHerAgain ? (
        <Notice title={weighHerAgain.said} tone="warning" />
      ) : null}
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
      <div className="grid gap-4 sm:grid-cols-2">
        <FarmAccountField
          id="internal-reference-account"
          kind="bank"
          onChange={setFarmAccountId}
          value={farmAccountId}
        />
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
      </div>
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
      {to === THE_FARM ? (
        <WindowChoice
          id="internal-season"
          onPick={setWindowPick}
          pick={windowPick}
        />
      ) : null}
    </FormSheet>
  );
};
