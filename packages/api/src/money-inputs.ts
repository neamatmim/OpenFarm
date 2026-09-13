import { PAYMENT_METHODS } from "@OpenFarm/db/schema/money";
import { z } from "zod";

/** Taka, to the poisha. */
export const amountInput = z.number().positive().max(100_000_000);

/** How the money changed hands. Left unsaid, cash: the farm's gate is a cash gate. */
export const paymentMethodInput = z.enum(PAYMENT_METHODS).default("cash");

/** How the money changed hands, on a Correction: left out, it stays as it was booked. */
export const correctedPaymentMethodInput = z.enum(PAYMENT_METHODS).optional();
