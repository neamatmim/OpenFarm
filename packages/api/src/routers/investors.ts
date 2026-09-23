import { uuidv7 } from "@OpenFarm/db/ids";
import { investor } from "@OpenFarm/db/schema/venture";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import { protectedProcedure } from "../index";
import {
  countedInvestors,
  readInvestor,
  theSamePerson,
} from "../investor-store";
import { OWNER_ONLY, requireOnly, requirePersonalSession } from "../roles";

const recordInput = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(1).max(20),
  address: z.string().trim().max(200).optional(),
  /** The number on their National ID, as the agreement asks for it. */
  nid: z.string().trim().max(40).optional(),
  /** Bank channels only, so the account is how they are paid. Written out as the bank would want it — the
   *  name on the account, its number, the bank and the branch — often on a line each. */
  bankAccount: z.string().trim().max(300).optional(),
  nominee: z
    .object({
      name: z.string().trim().min(1).max(120),
      phone: z.string().trim().max(20).optional(),
      relation: z.string().trim().max(60).optional(),
    })
    .optional(),
});

export const investorsRouter = {
  /**
   * The people whose money is in the farm's Ventures, with how many Units each holds across the Ventures
   * still running, and whether the farm is nearing the cap it may not go past.
   *
   * The Owner's alone: who trusted her with money, and how much, is not the Manager's business.
   */
  list: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .handler(async ({ context }) => {
      const rows = await context.db.query.investor.findMany({
        where: { farmId: context.farm.id },
        orderBy: { name: "asc", id: "asc" },
      });
      const counted = await countedInvestors(context.db, context.farm.id);
      return {
        /** How many people are in, and how many the farm may have. Said once, beside the list rather
         *  than on it, so a farm with nobody in it still knows where it stands. */
        standing: counted.standing,
        cap: context.farm.investorCap,
        nearingTheCap: counted.standing >= context.farm.investorWarnAt,
        people: rows.map((one) => ({
          id: one.id,
          name: one.name,
          phone: one.phone,
          address: one.address,
          nid: one.nid,
          bankAccount: one.bankAccount,
          nominee: one.nomineeName
            ? {
                name: one.nomineeName,
                phone: one.nomineePhone,
                relation: one.nomineeRelation,
              }
            : null,
          /** The Units this person holds across the Ventures still running. */
          unitsHeld: counted.unitsOf.get(one.id) ?? 0,
        })),
      };
    }),

  /**
   * One person recorded once, and reused for every Venture they join: name, phone, address, NID, the bank
   * account they are paid into, and a nominee for their family's sake.
   */
  record: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(recordInput)
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const already = await theSamePerson(context.db, context.farm.id, {
        name: input.name,
        phone: input.phone,
      });
      if (already) {
        throw new ORPCError("BAD_REQUEST", {
          message: "This person is already an Investor here",
          data: { refusal: "investor_exists" },
        });
      }
      const id = uuidv7(now);
      await audited(context).write(
        {
          entity: "investor",
          entityId: id,
          action: "create",
          after: (tx) => readInvestor(tx, context.farm.id, id),
        },
        (tx) =>
          tx.insert(investor).values({
            id,
            farmId: context.farm.id,
            name: input.name,
            phone: input.phone,
            address: input.address,
            nid: input.nid,
            bankAccount: input.bankAccount,
            nomineeName: input.nominee?.name,
            nomineePhone: input.nominee?.phone,
            nomineeRelation: input.nominee?.relation,
            recordedBy: context.actor.id,
            createdAt: now,
          })
      );
      return { id };
    }),
};
