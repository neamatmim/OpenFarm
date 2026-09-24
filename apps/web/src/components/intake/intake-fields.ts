import type { PaymentMethod } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";

/** What is typed into the intake form, before it is an animal on the farm. */
export interface IntakeFields {
  penId: string;
  sex: "male" | "female";
  sellerName: string;
  sellerPlace: string;
  sellerPhone: string;
  purchasePriceBdt: string;
  /** The haat's toll on this beast, as its slip gives it. Blank at a farm-gate sale. */
  hasilBdt: string;
  /** The outing she came home on, chosen from the ones the farm has written up lately. Blank for an
   *  animal bought at the farm gate, or one nobody wrote a Trip for. */
  buyingTripId: string;
  /** The Venture whose money bought her, or empty for the Farm's own. */
  ventureId: string;
  weightKg: string;
  estimatedAgeMonths: string;
  /** From the farm's list of breeds; empty when nobody knows it. */
  breedId: string;
  targetWeightKg: string;
  targetWindowStart: string;
  targetWindowEnd: string;
  paymentMethod: PaymentMethod;
}

export const EMPTY: IntakeFields = {
  penId: "",
  sex: "male",
  sellerName: "",
  sellerPlace: "",
  sellerPhone: "",
  purchasePriceBdt: "",
  hasilBdt: "",
  buyingTripId: "",
  ventureId: "",
  weightKg: "",
  estimatedAgeMonths: "",
  breedId: "",
  targetWeightKg: "",
  targetWindowStart: "",
  targetWindowEnd: "",
  paymentMethod: "cash",
};

/** A blank field means "the farm's own answer", never zero. */
export const orNothing = (value: string) =>
  value.trim() === "" ? undefined : Number(value);

/** The four things only the person standing by the lorry can know, and the Pen it goes into — each named by its
 *  label, so the form can say which are still to fill in. */
export const missingFrom = (fields: IntakeFields): MessageKey[] => {
  const missing: MessageKey[] = [];
  if (fields.penId === "") {
    missing.push("intake.pen");
  }
  if (fields.sellerName.trim() === "") {
    missing.push("intake.sellerName");
  }
  if (!(Number(fields.purchasePriceBdt) > 0)) {
    missing.push("intake.price");
  }
  if (!(Number(fields.weightKg) > 0)) {
    missing.push("intake.weight");
  }
  if (
    fields.estimatedAgeMonths.trim() === "" ||
    !Number.isInteger(Number(fields.estimatedAgeMonths)) ||
    Number(fields.estimatedAgeMonths) < 0
  ) {
    missing.push("intake.age");
  }
  return missing;
};

/** Half a Target Window is not a window, and one that ends before it begins is not one either. */
export const windowIsWhole = (fields: IntakeFields): boolean =>
  (fields.targetWindowStart === "") === (fields.targetWindowEnd === "") &&
  (fields.targetWindowStart === "" ||
    fields.targetWindowStart <= fields.targetWindowEnd);
