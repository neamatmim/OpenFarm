import { formatDate, formatNumber } from "@OpenFarm/i18n";
import { Button } from "@OpenFarm/ui/components/button";
import { Spinner } from "@OpenFarm/ui/components/spinner";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";
import type { ReactNode } from "react";

import { EidBasisBadge, useNextEid } from "@/components/fattening/next-eid";
import { Notice, Section } from "@/components/page";
import { PAYMENT_METHOD_WORD } from "@/components/payment-method";
import { useLanguage } from "@/i18n/language-provider";
import { orpc } from "@/utils/orpc";

import type { IntakeFields } from "./intake-fields";
import { missingFrom, windowIsWhole } from "./intake-fields";

/** One line of what will be written: what it is, and what was typed — or a dash for what has not been. */
const Line = ({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) => (
  <div className="flex items-baseline justify-between gap-3 py-2">
    <dt className="text-muted-foreground shrink-0 text-sm">{label}</dt>
    <dd className="min-w-0 text-right text-sm font-medium break-words">
      {children}
    </dd>
  </div>
);

/** A farm day, as the reader reads a date. */
const dayWords = (day: string, language: "bn" | "en") =>
  formatDate(new Date(`${day}T06:00:00.000Z`), language, "date");

/** The target weight the animal will be fed towards: the one typed, or the farm's own. */
const TargetWeight = ({ typed }: { typed: string }) => {
  const { t, language } = useLanguage();
  const farm = useQuery(orpc.farm.current.queryOptions());
  if (Number(typed) > 0) {
    return t("intake.kg", { kg: formatNumber(Number(typed), language) });
  }
  const farmsOwn =
    farm.data && "fatteningTargetWeightKg" in farm.data
      ? farm.data.fatteningTargetWeightKg
      : null;
  return farmsOwn === null
    ? t("intake.farmsOwn")
    : t("intake.farmsTarget", { kg: formatNumber(farmsOwn, language) });
};

/** The Target Window the animal will be fed for: the days typed, or the next Eid-ul-Adha. */
const TargetWindow = ({ fields }: { fields: IntakeFields }) => {
  const { t, language } = useLanguage();
  const eid = useNextEid();
  if (fields.targetWindowStart !== "" && fields.targetWindowEnd !== "") {
    return `${dayWords(fields.targetWindowStart, language)} – ${dayWords(
      fields.targetWindowEnd,
      language
    )}`;
  }
  return eid ? (
    <span className="inline-flex flex-wrap items-center justify-end gap-2">
      {t("intake.nextEid", {
        from: dayWords(eid.start, language),
        to: dayWords(eid.end, language),
      })}
      <EidBasisBadge basis={eid.basis} />
    </span>
  ) : (
    "—"
  );
};

/** What the price and the weight say together: taka a kilo off the lorry. */
export const PricePerKg = ({ fields }: { fields: IntakeFields }) => {
  const { t, language } = useLanguage();
  const price = Number(fields.purchasePriceBdt);
  const weight = Number(fields.weightKg);
  if (!(price > 0 && weight > 0)) {
    return null;
  }
  return t("intake.perKg", {
    taka: formatNumber(Math.round((price / weight) * 100) / 100, language),
  });
};

/** What is still to be given before the animal can be taken in, said once above the button. */
const StillNeeded = ({ fields }: { fields: IntakeFields }) => {
  const { t } = useLanguage();
  const missing = missingFrom(fields);
  if (missing.length > 0) {
    return (
      <Notice title={t("intake.stillNeeded")} tone="info">
        {missing.map((key) => t(key)).join(" · ")}
      </Notice>
    );
  }
  if (!windowIsWhole(fields)) {
    return <Notice title={t("intake.windowHalf")} tone="warning" />;
  }
  return null;
};

/**
 * What the farm will write when the animal is taken in, read back as it is typed — with the farm's own answers filled
 * in where a field was left blank, so nobody wonders what "blank" will mean — what is still to fill in, and the button.
 * Beside the form where there is room; after it on a phone.
 */
export const IntakeSummary = ({
  fields,
  pens,
  photoName,
  pending,
}: {
  fields: IntakeFields;
  pens: { id: string; name: string }[];
  photoName: string | null;
  pending: boolean;
}) => {
  const { t, language } = useLanguage();
  const pen = pens.find((one) => one.id === fields.penId);
  const price = Number(fields.purchasePriceBdt);
  const weight = Number(fields.weightKg);
  const age = fields.estimatedAgeMonths.trim();
  const ready = missingFrom(fields).length === 0 && windowIsWhole(fields);
  const seller = [fields.sellerName.trim(), fields.sellerPlace.trim()]
    .filter((part) => part !== "")
    .join(" · ");
  return (
    <Section
      description={t("intake.summaryHint")}
      id="intake-summary"
      title={t("intake.summary")}
    >
      <dl className="divide-border -my-2 flex flex-col divide-y">
        <Line label={t("intake.pen")}>{pen?.name ?? "—"}</Line>
        <Line label={t("intake.groupAnimal")}>
          {[t(`animals.sex.${fields.sex}`), fields.breed.trim()]
            .filter((part) => part !== "")
            .join(" · ")}
        </Line>
        <Line label={t("intake.seller")}>{seller === "" ? "—" : seller}</Line>
        <Line label={t("intake.price")}>
          {price > 0 ? (
            <span className="flex flex-col">
              <span>
                {t("intake.taka", { taka: formatNumber(price, language) })}
              </span>
              <span className="text-muted-foreground text-xs font-normal">
                <PricePerKg fields={fields} />
              </span>
            </span>
          ) : (
            "—"
          )}
        </Line>
        <Line label={t("intake.hasil")}>
          {Number(fields.hasilBdt) > 0
            ? t("intake.taka", {
                taka: formatNumber(Number(fields.hasilBdt), language),
              })
            : "—"}
        </Line>
        <Line label={t("money.paidBy")}>
          {t(PAYMENT_METHOD_WORD[fields.paymentMethod])}
        </Line>
        <Line label={t("intake.weight")}>
          {weight > 0
            ? t("intake.kg", { kg: formatNumber(weight, language) })
            : "—"}
        </Line>
        <Line label={t("intake.age")}>
          {age === ""
            ? "—"
            : t("intake.months", {
                months: formatNumber(Number(age), language),
              })}
        </Line>
        <Line label={t("intake.targetWeight")}>
          <TargetWeight typed={fields.targetWeightKg} />
        </Line>
        <Line label={t("intake.targetWindow")}>
          <TargetWindow fields={fields} />
        </Line>
        <Line label={t("animals.photo")}>
          {photoName ?? t("intake.noPhoto")}
        </Line>
      </dl>
      <StillNeeded fields={fields} />
      <Button
        className="hidden w-full lg:inline-flex"
        disabled={!ready || pending}
        size="lg"
        type="submit"
      >
        {pending ? (
          <Spinner />
        ) : (
          <ClipboardCheck aria-hidden data-icon="inline-start" />
        )}
        {t("intake.record")}
      </Button>
    </Section>
  );
};
