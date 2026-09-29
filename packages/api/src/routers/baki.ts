import type { Database } from "@OpenFarm/db";
import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { sql } from "@OpenFarm/db/operators";
import { BAKI_KINDS as KINDS, bakiPayment } from "@OpenFarm/db/schema/money";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import {
  CATEGORY_OF_BAKI,
  assertPaidNoMoreThanOwed,
  bakiOfBuyers,
  owingOf,
  readBakiPayment,
} from "../baki-store";
import {
  bakiPaymentCorrection,
  bakiPaymentCorrectionInput,
} from "../corrections/baki-payment";
import { correct } from "../corrections/correction";
import { farmDay } from "../farm-clock";
import { protectedProcedure } from "../index";
import { enteredOn } from "../money-by-hand-store";
import { amountInput, noteInput, paymentMethodInput } from "../money-inputs";
import { bookMoney, bookingOf } from "../money-store";
import { requirePersonalSession, requireRole } from "../roles";

const buyerNameInput = z.string().trim().min(1).max(120);

/** The buyer a name names on this farm, or nobody. */
const buyerNamed = (db: Database, farmId: string, name: string) =>
  db.query.counterparty.findFirst({
    where: { farmId, name },
    columns: { id: true },
  });

export const bakiRouter = {
  /**
   * Every buyer who owes the farm — or holds credit with it — oldest owing first, with what he took, what he has paid
   * and what each payment cleared. The Owner's and the Manager's, as the Money page is.
   */
  list: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(({ context }) => bakiOfBuyers(context.db, context.farm.id)),

  /**
   * What one buyer still owes, for the Sale and the Dispatch sheets to say as his name is typed. Nothing for a name the
   * farm has never sold to.
   */
  ofBuyer: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ name: buyerNameInput }))
    .handler(async ({ context, input }) => {
      const known = await buyerNamed(context.db, context.farm.id, input.name);
      if (!known) {
        return null;
      }
      const [his] = await bakiOfBuyers(context.db, context.farm.id, {
        counterpartyId: known.id,
      });
      return his ?? null;
    }),

  /**
   * A buyer paying towards his Baki: one handover of money, for his milk or his cattle, and one Money Event on the day
   * it came, under that one's Category. It clears his oldest Baki first. More than he owes is taken only with a note.
   */
  pay: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(
      z.object({
        buyer: buyerNameInput,
        kind: z.enum(KINDS),
        amountBdt: amountInput,
        paidOn: farmDay,
        paymentMethod: paymentMethodInput,
        note: noteInput.optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const occurredAt = enteredOn(input.paidOn, now);
      const known = await buyerNamed(context.db, context.farm.id, input.buyer);
      if (!known) {
        throw new ORPCError("NOT_FOUND", {
          message: "The farm has never sold to anybody by that name",
          data: { refusal: "no_such_buyer" },
        });
      }
      const id = newId(now);
      await audited(context).write(
        {
          entity: "baki_payment",
          entityId: id,
          action: "create",
          after: (tx) => readBakiPayment(tx, id),
        },
        async (tx) => {
          // Held while his Baki is read, so two phones taking his money at once each see the other's.
          await tx.execute(
            sql`select 1 from counterparty where id = ${known.id} for update`
          );
          assertPaidNoMoreThanOwed({
            amountBdt: input.amountBdt,
            owingBdt: await owingOf(tx, context.farm.id, known.id, input.kind),
            note: input.note ?? null,
          });
          await tx.insert(bakiPayment).values({
            id,
            farmId: context.farm.id,
            counterpartyId: known.id,
            kind: input.kind,
            amountBdt: input.amountBdt,
            paidOn: input.paidOn,
            note: input.note ?? null,
            recordedBy: context.actor.id,
            recordedByRole: context.roleUsed,
            recordedAt: now,
          });
          await bookMoney(tx, bookingOf(context, context.roleUsed, now), {
            source: "baki_payment",
            sourceId: id,
            amountBdt: input.amountBdt,
            occurredAt,
            counterpartyId: known.id,
            paymentMethod: input.paymentMethod,
            categoryKey: CATEGORY_OF_BAKI[input.kind],
          });
        }
      );
      return { id };
    }),

  /**
   * A Baki Payment put right: how much, the day, how it was paid, the note. A Correction like any other — a reason,
   * the Role's Correction Window, the trail holding what it said — and its Money Event with it.
   */
  correctPayment: protectedProcedure
    .use(requireRole(...bakiPaymentCorrection.roles))
    .input(bakiPaymentCorrectionInput)
    .handler(({ context, input }) =>
      correct(context, bakiPaymentCorrection, input)
    ),
};
