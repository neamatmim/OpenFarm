import { formatDate } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Input } from "@OpenFarm/ui/components/input";
import { Camera, CircleCheck, Plus } from "lucide-react";
import { toast } from "sonner";

import { Section } from "@/components/page";
import { FormField, NativeSelect } from "@/components/page-kit";
import { PaymentMethodField } from "@/components/payment-method";
import { useLanguage } from "@/i18n/language-provider";
import { useTaka } from "@/lib/taka";

import type { IntakeFields } from "./intake-fields";
import { PricePerKg } from "./intake-summary";

/** What a photograph may weigh before the farm refuses it, as `animals.setPhoto` counts it. */
const PHOTO_MAX_BYTES = 1_500_000;

/** One part of the form: the fields as they stand, and a way to change some of them. */
interface PartProps {
  fields: IntakeFields;
  onEdit: (patch: Partial<IntakeFields>) => void;
}

/** A number box, labelled, with an optional line beneath. */
const NumberField = ({
  id,
  label,
  value,
  onChange,
  hint,
  required = false,
  decimal = false,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string | null;
  required?: boolean;
  decimal?: boolean;
  placeholder?: string;
}) => (
  <FormField hint={hint ?? undefined} id={id} label={label}>
    <Input
      id={id}
      inputMode={decimal ? "decimal" : "numeric"}
      min={0}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      required={required}
      step={decimal ? "0.1" : undefined}
      type="number"
      value={value}
    />
  </FormField>
);

/**
 * The photograph is the animal's face and the farm's proof of what it bought. Taken here because the Manager is
 * standing next to it; optional, because a lorry at dusk in the rain is not a reason to turn an arrival away (issue 06:
 * prompted later if missing).
 */
const PhotoField = ({
  photoName,
  onPhoto,
}: {
  photoName: string | null;
  onPhoto: (file: File | null) => void;
}) => {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{t("animals.photo")}</span>
      <div className="flex flex-wrap items-center gap-3">
        {/* The browser's own file button speaks the browser's language; this one speaks the farm's. */}
        <label
          className="border-input bg-card hover:bg-muted has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:border-ring flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors has-[:focus-visible]:ring-[3px] md:min-h-9"
          htmlFor="intake-photo"
        >
          <Camera aria-hidden className="size-4" />
          {t("animals.photoTake")}
        </label>
        <p className="text-muted-foreground inline-flex min-w-0 items-center gap-1.5 text-sm">
          {photoName ? (
            <CircleCheck aria-hidden className="text-success size-4 shrink-0" />
          ) : null}
          <span className="truncate">{photoName ?? t("intake.noPhoto")}</span>
        </p>
      </div>
      <input
        accept="image/*"
        capture="environment"
        className="sr-only"
        id="intake-photo"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          if (file && file.size > PHOTO_MAX_BYTES) {
            toast.error(t("common.error"));
            return;
          }
          onPhoto(file);
        }}
        type="file"
      />
    </div>
  );
};

/** Where it goes first and what it is: the Quarantine Pen, its sex and breed, and its photograph. */
export const AnimalSection = ({
  fields,
  onEdit,
  pens,
  photoName,
  onPhoto,
}: PartProps & {
  pens: { id: string; name: string }[];
  photoName: string | null;
  onPhoto: (file: File | null) => void;
}) => {
  const { t } = useLanguage();
  return (
    <Section
      description={t("intake.groupAnimalHint")}
      id="intake-animal"
      title={t("intake.groupAnimal")}
    >
      <FormField
        hint={t("intake.penHint")}
        id="intake-pen"
        label={t("intake.pen")}
      >
        <NativeSelect
          id="intake-pen"
          onChange={(event) => onEdit({ penId: event.target.value })}
          required
          value={fields.penId}
        >
          <option value="">—</option>
          {pens.map((pen) => (
            <option key={pen.id} value={pen.id}>
              {pen.name}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="intake-sex" label={t("animals.sex")}>
          <NativeSelect
            id="intake-sex"
            onChange={(event) =>
              onEdit({
                sex: event.target.value === "female" ? "female" : "male",
              })
            }
            value={fields.sex}
          >
            <option value="male">{t("animals.sex.male")}</option>
            <option value="female">{t("animals.sex.female")}</option>
          </NativeSelect>
        </FormField>
        <FormField id="intake-breed" label={t("animals.breed")}>
          <Input
            autoComplete="off"
            id="intake-breed"
            maxLength={60}
            onChange={(event) => onEdit({ breed: event.target.value })}
            value={fields.breed}
          />
        </FormField>
      </div>
      <PhotoField onPhoto={onPhoto} photoName={photoName} />
    </Section>
  );
};

/** Who the farm bought it from: a name is enough, and the rest is what anyone remembers. */
export const SellerSection = ({ fields, onEdit }: PartProps) => {
  const { t } = useLanguage();
  return (
    <Section
      description={t("intake.groupSellerHint")}
      id="intake-seller-part"
      title={t("intake.groupSeller")}
    >
      <FormField id="intake-seller" label={t("intake.sellerName")}>
        <Input
          autoComplete="off"
          id="intake-seller"
          maxLength={120}
          onChange={(event) => onEdit({ sellerName: event.target.value })}
          required
          value={fields.sellerName}
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="intake-place" label={t("intake.sellerPlace")}>
          <Input
            autoComplete="off"
            id="intake-place"
            maxLength={200}
            onChange={(event) => onEdit({ sellerPlace: event.target.value })}
            value={fields.sellerPlace}
          />
        </FormField>
        <FormField id="intake-phone" label={t("intake.sellerPhone")}>
          <Input
            autoComplete="off"
            id="intake-phone"
            inputMode="tel"
            maxLength={20}
            onChange={(event) => onEdit({ sellerPhone: event.target.value })}
            value={fields.sellerPhone}
          />
        </FormField>
      </div>
    </Section>
  );
};

/** Taka a kilo, in a quiet box under the price and the weight, once both are typed. */
const PerKgLine = ({ fields }: { fields: IntakeFields }) => {
  const price = Number(fields.purchasePriceBdt);
  const weight = Number(fields.weightKg);
  if (!(price > 0 && weight > 0)) {
    return null;
  }
  return (
    <p className="bg-muted text-muted-foreground rounded-md px-3 py-2 text-sm tabular-nums">
      <PricePerKg fields={fields} />
    </p>
  );
};

/** What was paid and how, what the scale read off the lorry, and the age the seller gave — with what that came to a
 *  kilo, worked out as it is typed. */
export const PriceSection = ({
  fields,
  onEdit,
  trips,
  ventures,
  onNewTrip,
}: PartProps & {
  trips: {
    id: string;
    wentTo: string;
    wentOn: Date;
    animals: number;
    /** What the outing was given to buy with, where it was given one. */
    float: { ventureId: string; ventureName: string; amountBdt: number } | null;
  }[];
  /** The Ventures that are buying: the only ones that may take an animal in. */
  ventures: { id: string; name: string }[];
  /** Write up an outing that is not on the list yet: the first of its animals to be taken in. */
  onNewTrip: () => void;
}) => {
  const { t, language } = useLanguage();
  const taka = useTaka();
  // The outing she came on, where it went on a Venture's Float: then whose she is is not a choice.
  const float =
    trips.find((one) => one.id === fields.buyingTripId)?.float ?? null;
  // Named, because the guard against untranslated JSX text reads a comparison's angle bracket as a tag.
  const whoseIsAChoice = ventures.length !== 0 || float !== null;
  return (
    <Section
      description={t("intake.groupPriceHint")}
      id="intake-price-part"
      title={t("intake.groupPrice")}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <NumberField
          id="intake-price"
          label={t("intake.price")}
          onChange={(purchasePriceBdt) => onEdit({ purchasePriceBdt })}
          required
          value={fields.purchasePriceBdt}
        />
        <NumberField
          id="intake-hasil"
          label={t("intake.hasil")}
          onChange={(hasilBdt) => onEdit({ hasilBdt })}
          value={fields.hasilBdt}
        />
        <NumberField
          decimal
          id="intake-weight"
          label={t("intake.weight")}
          onChange={(weightKg) => onEdit({ weightKg })}
          required
          value={fields.weightKg}
        />
        <NumberField
          id="intake-age"
          label={t("intake.age")}
          onChange={(estimatedAgeMonths) => onEdit({ estimatedAgeMonths })}
          required
          value={fields.estimatedAgeMonths}
        />
      </div>
      <FormField id="intake-trip" label={t("intake.trip")}>
        <div className="flex gap-2">
          <NativeSelect
            className="min-w-0 flex-1"
            id="intake-trip"
            onChange={(event) => {
              const trip = trips.find((one) => one.id === event.target.value);
              // An outing on a Venture's Float bought for that Venture: she is theirs, and nobody else's.
              onEdit({
                buyingTripId: event.target.value,
                ...(trip?.float ? { ventureId: trip.float.ventureId } : {}),
              });
            }}
            value={fields.buyingTripId}
          >
            <option value="">{t("intake.noTrip")}</option>
            {trips.map((trip) => (
              <option key={trip.id} value={trip.id}>
                {trip.wentTo} · {formatDate(trip.wentOn, language, "date")}
                {trip.float
                  ? ` · ${trip.float.ventureName} ${taka(trip.float.amountBdt)}`
                  : ""}
              </option>
            ))}
          </NativeSelect>
          <Button
            className="h-11 shrink-0 md:h-9"
            onClick={onNewTrip}
            type="button"
            variant="outline"
          >
            <Plus aria-hidden data-icon="inline-start" />
            {t("intake.newTrip")}
          </Button>
        </div>
      </FormField>
      {whoseIsAChoice ? (
        <FormField
          hint={
            float
              ? t("intake.ownerFromFloat", { venture: float.ventureName })
              : t("intake.ownerHint")
          }
          id="intake-owner"
          label={t("intake.owner")}
        >
          <NativeSelect
            disabled={float !== null}
            id="intake-owner"
            onChange={(event) => onEdit({ ventureId: event.target.value })}
            value={float ? float.ventureId : fields.ventureId}
          >
            <option value="">{t("intake.theFarms")}</option>
            {ventures.map((one) => (
              <option key={one.id} value={one.id}>
                {one.name}
              </option>
            ))}
            {/* The Float's Venture, where it no longer takes animals from anywhere else — this outing still bought
                for it. */}
            {float && !ventures.some((one) => one.id === float.ventureId) ? (
              <option value={float.ventureId}>{float.ventureName}</option>
            ) : null}
          </NativeSelect>
        </FormField>
      ) : null}
      <PerKgLine fields={fields} />
      <PaymentMethodField
        id="intake-paid-by"
        onChange={(paymentMethod) => onEdit({ paymentMethod })}
        value={fields.paymentMethod}
      />
    </Section>
  );
};

/** What it is being fed towards, and when the farm means to sell it — both blank for the farm's own answers. */
export const TargetSection = ({ fields, onEdit }: PartProps) => {
  const { t } = useLanguage();
  return (
    <Section
      description={t("intake.groupTargetHint")}
      id="intake-target-part"
      title={t("intake.groupTarget")}
    >
      <NumberField
        decimal
        hint={t("intake.targetWeightNote")}
        id="intake-target"
        label={t("intake.targetWeight")}
        onChange={(targetWeightKg) => onEdit({ targetWeightKg })}
        value={fields.targetWeightKg}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="intake-from" label={t("intake.windowStart")}>
          <Input
            id="intake-from"
            onChange={(event) =>
              onEdit({ targetWindowStart: event.target.value })
            }
            type="date"
            value={fields.targetWindowStart}
          />
        </FormField>
        <FormField id="intake-to" label={t("intake.windowEnd")}>
          <Input
            id="intake-to"
            min={fields.targetWindowStart || undefined}
            onChange={(event) =>
              onEdit({ targetWindowEnd: event.target.value })
            }
            type="date"
            value={fields.targetWindowEnd}
          />
        </FormField>
      </div>
      <p className="text-muted-foreground text-xs">{t("intake.windowNote")}</p>
    </Section>
  );
};
