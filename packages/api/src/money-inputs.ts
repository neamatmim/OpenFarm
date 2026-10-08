import { SIDES } from "@OpenFarm/db/schema/herd";
import { PAYMENT_METHODS } from "@OpenFarm/db/schema/money";
import { PHOTO_MAX_BYTES } from "@OpenFarm/domain";
import { z } from "zod";

import { changeOf } from "./corrections/correction";

/** Who the money went to or came from, named as the farm names them. */
export const counterpartyInput = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(300).optional(),
  phone: z.string().trim().max(40).optional(),
});

/** Taka, to the poisha. */
export const amountInput = z.number().positive().max(100_000_000);

/** How the money changed hands. Left unsaid, cash: the farm's gate is a cash gate. */
export const paymentMethodInput = z.enum(PAYMENT_METHODS).default("cash");

/** Which of the Farm's own mobile money numbers or bank accounts mobile money or bank money went into or came out of. */
export const farmAccountIdInput = z.string().min(1).optional();

/** Its transaction ID, or the check's or the slip's number. */
export const referenceInput = z.string().trim().min(1).max(80).optional();

/** Which Farm Account, and its transaction ID, as a Correction puts them right. */
export const farmAccountChange = changeOf(
  z.object({
    farmAccountId: z.string().min(1),
    reference: z.string().trim().min(1).max(80),
  }),
  z.object({
    farmAccountId: z.string().nullable(),
    reference: z.string().nullable(),
  })
);

/** A calendar month, as a wage pays for one. */
export const monthInput = z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/u);

/** A photo of the receipt, as a phone sends it. */
export const receiptInput = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  data: z.string().min(1).max(PHOTO_MAX_BYTES),
});

/** What the Manager writes beside money entered by hand. */
export const noteInput = z.string().trim().min(1).max(300);

/** The Side money entered by hand belongs to; left out, the whole farm. */
export const sideInput = z.enum(SIDES);

const paymentMethod = z.enum(PAYMENT_METHODS);

/** How the money of a record changed hands, put right: shown as nothing for a record that booked no money. */
export const paymentMethodChange = changeOf(
  paymentMethod,
  paymentMethod.nullable()
);
