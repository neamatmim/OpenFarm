import type { PaymentMethod } from "@OpenFarm/domain";
import type { MessageKey } from "@OpenFarm/i18n";

/** What is typed into the intake form, before it is an animal on the farm. */
export interface IntakeFields {
  penId: string;
  sex: "male" | "female";
  sellerName: string;
  sellerPlace: string;
  sellerPhone: string;
  purchasePriceMoney: string;
  /** The livestock market's toll on this beast, as its slip gives it. Blank at a farm-gate sale. */
  hasilMoney: string;
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
  /** A Venture's bull with no outing, paid from its account by bank: the transfer or cheque, and the day it moved. */
  reference: string;
  paidOn: string;
  /** Which Farm Account the Farm's own bull was paid from by mobile money or the bank. */
  farmAccountId: string;
}

/** The Venture an animal is being taken in for, when she is one's: her Target Window is its, not the form's. */
export interface OwningVenture {
  name: string;
  /** As its Amendments leave it today. Null from an answer cached before the server said it. */
  targetWindow: { start: string; end: string } | null;
}

/**
 * The Venture she is being taken in for: the one whose Float paid for her outing, else the one named on the form.
 * Nothing for the Farm's own.
 */
export const owningVenture = (
  fields: IntakeFields,
  trips: readonly {
    id: string;
    float: { ventureId: string; ventureName: string } | null;
  }[],
  ventures: readonly {
    id: string;
    name: string;
    targetWindow?: { start: string; end: string };
  }[]
): OwningVenture | null => {
  const float =
    trips.find((one) => one.id === fields.buyingTripId)?.float ?? null;
  const id = float?.ventureId ?? fields.ventureId;
  if (id === "") {
    return null;
  }
  const named = ventures.find((one) => one.id === id);
  return {
    name: named?.name ?? float?.ventureName ?? "",
    targetWindow: named?.targetWindow ?? null,
  };
};

export const EMPTY: IntakeFields = {
  penId: "",
  sex: "male",
  sellerName: "",
  sellerPlace: "",
  sellerPhone: "",
  purchasePriceMoney: "",
  hasilMoney: "",
  buyingTripId: "",
  ventureId: "",
  weightKg: "",
  estimatedAgeMonths: "",
  breedId: "",
  targetWeightKg: "",
  targetWindowStart: "",
  targetWindowEnd: "",
  paymentMethod: "cash",
  reference: "",
  paidOn: "",
  farmAccountId: "",
};

/** A Venture's bull with no outing: paid straight from its account by bank, the Owner's to take in. */
export const boughtFromTheAccount = (fields: IntakeFields): boolean =>
  fields.ventureId !== "" && fields.buyingTripId === "";

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
  if (boughtFromTheAccount(fields) && fields.reference.trim() === "") {
    missing.push("intake.reference");
  }
  if (fields.sellerName.trim() === "") {
    missing.push("intake.sellerName");
  }
  if (!(Number(fields.purchasePriceMoney) > 0)) {
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
