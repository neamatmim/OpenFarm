import type { NotPrescribable } from "@OpenFarm/domain";

import type { Tone } from "@/components/page";
import type { orpc } from "@/utils/orpc";

/** A product on the Drug List, as the farm answers for it. */
export type DrugProduct = Awaited<
  ReturnType<typeof orpc.drugs.list.call>
>[number];

/** One Medicine Purchase of a product. */
export type Purchase = Awaited<
  ReturnType<typeof orpc.drugs.purchases.call>
>[number];

/** Where a product stands: it may be prescribed, it waits for the Vet's days, or it is retired. */
export type DrugStanding = "prescribable" | "waiting" | "retired";

/** The standing the farm's own reason gives: the same question the refusal answers, so it cannot read two ways. */
const STANDING_OF: Record<NotPrescribable, DrugStanding> = {
  no_withdrawal_days: "waiting",
  retired: "retired",
};

export const standingOf = (product: DrugProduct): DrugStanding =>
  product.whyNot ? STANDING_OF[product.whyNot] : "prescribable";

export const STANDING_TONE: Record<DrugStanding, Tone> = {
  prescribable: "success",
  waiting: "warning",
  retired: "neutral",
};

/** The product in the reader's language — the label is in Bangla, so that is what is kept. */
export const productName = (product: DrugProduct, language: string) =>
  language === "en" && product.nameEn ? product.nameEn : product.nameBn;
