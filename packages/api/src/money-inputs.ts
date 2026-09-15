import { PAYMENT_METHODS } from "@OpenFarm/db/schema/money";
import { z } from "zod";

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
