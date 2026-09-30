import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import {
  cashInHand,
  cashMovementsOf,
  readHandover,
  recordHandover,
} from "../cash-store";
import type { HandEnd } from "../cash-store";
import { protectedProcedure } from "../index";
import { amountInput } from "../money-inputs";
import { forbidden, requireRole, requirePersonalSession } from "../roles";

// Who holds the farm's cash. The Owner reads every hand; a Manager reads their own and hands over from it.

const handEnd = z.union([
  z.object({ userId: z.string() }),
  z.object({ bank: z.literal(true) }),
]);

/** Whether this person may read, or move, the cash in someone's hand: the Owner anybody's, a Manager their own. */
const mayActFor = (
  context: { roles: readonly string[]; actor: { id: string } },
  userId: string | null
) => context.roles.includes("owner") || userId === context.actor.id;

const NOT_YOURS = {
  message: "Another person's cash in hand is the Owner's to read or move",
  reason: "owner_only",
} as const;

export const cashRouter = {
  /** Every hand holding the farm's cash for the Owner; a Manager's own for a Manager. */
  inHand: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .handler(async ({ context }) => {
      const hands = await cashInHand(context.db, context.farm.id);
      return context.roles.includes("owner")
        ? hands
        : hands.filter((one) => one.userId === context.actor.id);
    }),

  /** Who holds the farm's cash, by name alone: whom a Handover may go to. */
  holders: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .handler(async ({ context }) => {
      const hands = await cashInHand(context.db, context.farm.id);
      return hands.map(({ userId, name }) => ({ userId, name }));
    }),

  /** Everything that moved cash into or out of one hand, newest first. */
  movements: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(z.object({ userId: z.string() }))
    .handler(({ context, input }) => {
      if (!mayActFor(context, input.userId)) {
        throw forbidden(NOT_YOURS);
      }
      return cashMovementsOf(context.db, context.farm.id, input.userId);
    }),

  /**
   * A **Handover**: cash passed from one hand to another, into the bank, or out of it. A Manager hands over what is in
   * their own hand; the Owner may write any Handover, and only the Owner draws cash out of the bank.
   */
  handOver: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(
      z.object({
        from: handEnd,
        to: handEnd,
        amountBdt: amountInput,
        /** When it changed hands, if not now. */
        handedAt: z.coerce.date().optional(),
        /** The deposit slip or the cheque, where the bank is one end. */
        reference: z.string().trim().min(1).max(80).optional(),
        note: z.string().trim().max(300).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const role = context.roleUsed;
      if (!role) {
        throw new ORPCError("FORBIDDEN");
      }
      const from: HandEnd = input.from;
      const fromUser = "userId" in from ? from.userId : null;
      if (!mayActFor(context, fromUser)) {
        throw forbidden(NOT_YOURS);
      }
      const handedAt = input.handedAt ?? now;
      if (handedAt > now) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Cash cannot have changed hands tomorrow",
        });
      }
      let id = "";
      await audited(context).write(
        {
          entity: "handover",
          entityId: () => id,
          action: "create",
          after: (tx) => readHandover(tx, id),
        },
        async (tx) => {
          ({ id } = await recordHandover(tx, {
            farmId: context.farm.id,
            from,
            to: input.to,
            amountBdt: input.amountBdt,
            handedAt,
            reference: input.reference ?? null,
            note: input.note ?? null,
            recordedBy: context.actor.id,
            recordedByRole: role,
            now,
          }));
        }
      );
      return { id };
    }),
};
