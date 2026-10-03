import type { Database } from "@OpenFarm/db";
import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { sql } from "@OpenFarm/db/operators";
import {
  RECEIVABLE_KINDS as KINDS,
  RECEIVABLE_SOURCES,
  receivablePayment,
  receivableWriteOff,
} from "@OpenFarm/db/schema/money";
import { farmDayOf } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import { assertTheHand } from "../cash-store";
import { correct } from "../corrections/correction";
import {
  receivablePaymentCorrection,
  receivablePaymentCorrectionInput,
} from "../corrections/receivable-payment";
import {
  writeOffCorrection,
  writeOffCorrectionInput,
} from "../corrections/receivable-write-off";
import { farmDay } from "../farm-clock";
import { protectedProcedure } from "../index";
import { enteredOn } from "../money-by-hand-store";
import {
  amountInput,
  farmAccountIdInput,
  noteInput,
  paymentMethodInput,
  referenceInput,
} from "../money-inputs";
import { accountSaid, bookingOf, bookMoney } from "../money-store";
import {
  CATEGORY_OF_RECEIVABLE,
  assertPaidNoMoreThanOwed,
  receivableOfBuyers,
  assertWrittenOffNoMoreThanOwed,
  overdueOfBuyer,
  owingOf,
  owingOnItem,
  readReceivablePayment,
  readWriteOff,
} from "../receivable-store";
import {
  OWNER_ONLY,
  requireOnly,
  requirePersonalSession,
  requireRole,
} from "../roles";

const buyerNameInput = z.string().trim().min(1).max(120);

/** The buyer a name names on this farm, or nobody. */
const buyerNamed = (db: Database, farmId: string, name: string) =>
  db.query.counterparty.findFirst({
    where: { farmId, name },
    columns: { id: true },
  });

export const receivablesRouter = {
  /**
   * Every buyer who owes the farm — or has paid it ahead — oldest owing first, with what he took, what he has paid
   * and what each payment cleared. The Owner's and the Manager's, as the Money page is.
   */
  list: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(({ context }) => receivableOfBuyers(context.db, context.farm.id)),

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
      const [his] = await receivableOfBuyers(context.db, context.farm.id, {
        counterpartyId: known.id,
      });
      if (!his) {
        return null;
      }
      // And whether any of it is past its day, which the sheets say more loudly.
      const overdue = overdueOfBuyer(
        his,
        farmDayOf(context.clock.now()),
        context.farm.receivableDays
      );
      return { ...his, overdueSince: overdue?.overdueSince ?? null };
    }),

  /**
   * A buyer paying towards his Receivable: one handover of money, for his milk or his cattle, and one Money Event on the day
   * it came, under that one's Category. It clears his oldest Receivable first. More than he owes is taken only with a note.
   */
  pay: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(
      z.object({
        buyer: buyerNameInput,
        kind: z.enum(KINDS),
        amountMoney: amountInput,
        paidOn: farmDay,
        paymentMethod: paymentMethodInput,
        /** Which Farm Account mobile money or bank money went into or came out of. */
        farmAccountId: farmAccountIdInput,
        /** Its transaction ID, or the cheque's or slip's number. */
        reference: referenceInput,
        note: noteInput.optional(),
        /** Whose hand took the cash, where it was not the writer's: the Owner writing up what the Manager was handed. */
        heldBy: z.string().optional(),
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
          entity: "receivable_payment",
          entityId: id,
          action: "create",
          after: (tx) => readReceivablePayment(tx, id),
        },
        async (tx) => {
          // Held while his Receivable is read, so two phones taking his money at once each see the other's.
          await tx.execute(
            sql`select 1 from counterparty where id = ${known.id} for update`
          );
          assertPaidNoMoreThanOwed({
            amountMoney: input.amountMoney,
            owingMoney: await owingOf(
              tx,
              context.farm.id,
              known.id,
              input.kind
            ),
            note: input.note ?? null,
          });
          await tx.insert(receivablePayment).values({
            id,
            farmId: context.farm.id,
            counterpartyId: known.id,
            kind: input.kind,
            amountMoney: input.amountMoney,
            paidOn: input.paidOn,
            note: input.note ?? null,
            recordedBy: context.actor.id,
            recordedByRole: context.roleUsed,
            recordedAt: now,
          });
          await bookMoney(
            tx,
            bookingOf(
              context,
              context.roleUsed,
              now,
              accountSaid(["receivable_payment"], input)
            ),
            {
              source: "receivable_payment",
              sourceId: id,
              amountMoney: input.amountMoney,
              occurredAt,
              counterpartyId: known.id,
              paymentMethod: input.paymentMethod,
              ...(input.heldBy === undefined
                ? {}
                : {
                    heldBy: await assertTheHand(
                      tx,
                      context.farm.id,
                      { id: context.actor.id, roles: context.roles },
                      input.heldBy
                    ),
                  }),
              categoryKey: CATEGORY_OF_RECEIVABLE[input.kind],
            }
          );
        }
      );
      return { id };
    }),

  /**
   * The Owner writing off Receivable that will not be paid: so much of one Sale's or Dispatch's, with a reason. What the
   * animal or the milk fetched is then its price less it, and the buyer carries the mark. The Owner's alone.
   */
  writeOff: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        source: z.enum(RECEIVABLE_SOURCES),
        id: z.string(),
        amountMoney: amountInput,
        why: noteInput,
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const id = newId(now);
      await audited(context).write(
        {
          entity: "receivable_write_off",
          entityId: id,
          action: "create",
          after: (tx) => readWriteOff(tx, id),
        },
        async (tx) => {
          const standing = await owingOnItem(
            tx,
            context.farm.id,
            input.source,
            input.id
          );
          if (!standing) {
            throw new ORPCError("NOT_FOUND", {
              message: "Nothing was ever owed on that",
              data: { refusal: "nothing_owed_on_it" },
            });
          }
          // Held while what is owing is read, as a payment is.
          await tx.execute(
            sql`select 1 from counterparty where id = ${standing.counterpartyId} for update`
          );
          assertWrittenOffNoMoreThanOwed(
            input.amountMoney,
            standing.owingMoney
          );
          await tx.insert(receivableWriteOff).values({
            id,
            farmId: context.farm.id,
            source: input.source,
            sourceId: input.id,
            counterpartyId: standing.counterpartyId,
            amountMoney: input.amountMoney,
            reason: input.why,
            writtenOn: farmDayOf(now),
            recordedBy: context.actor.id,
            recordedAt: now,
          });
        }
      );
      return { id };
    }),

  /** A Write-off put right, or taken back by setting it to nothing. The Owner's alone. */
  correctWriteOff: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .input(writeOffCorrectionInput)
    .handler(({ context, input }) =>
      correct(context, writeOffCorrection, input)
    ),

  /**
   * A Receivable Payment put right: how much, the day, how it was paid, the note. A Correction like any other — a reason,
   * the Role's Correction Window, the trail holding what it said — and its Money Event with it.
   */
  correctPayment: protectedProcedure
    .use(requireRole(...receivablePaymentCorrection.roles))
    .input(receivablePaymentCorrectionInput)
    .handler(({ context, input }) =>
      correct(context, receivablePaymentCorrection, input)
    ),
};
