import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq } from "@OpenFarm/db/operators";
import { pen, shed } from "@OpenFarm/db/schema/herd";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import { protectedProcedure } from "../index";
import { requireRole } from "../roles";

const name = z.string().trim().min(1).max(80);

/** Sheds contain Pens; every Animal is in exactly one Pen. */
export const herdRouter = {
  list: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .handler(({ context }) =>
      context.db.query.shed.findMany({
        where: { farmId: context.farm.id },
        orderBy: { name: "asc" },
        with: { pens: { orderBy: { name: "asc" } } },
      })
    ),

  createShed: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ name }))
    .handler(async ({ context, input }) => {
      const id = uuidv7(context.clock.now());
      await audited(context).write(
        {
          entity: "shed",
          entityId: id,
          action: "create",
          after: { name: input.name },
        },
        (tx) =>
          tx
            .insert(shed)
            .values({ id, farmId: context.farm.id, name: input.name })
      );
      return { id, name: input.name };
    }),

  renameShed: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ id: z.string(), name }))
    .handler(async ({ context, input }) => {
      await audited(context).write(
        {
          entity: "shed",
          entityId: input.id,
          action: "update",
          before: async (tx) => {
            const row = await tx.query.shed.findFirst({
              where: { id: input.id },
              columns: { name: true },
            });
            return row ?? null;
          },
          after: { name: input.name },
        },
        async (tx) => {
          const [row] = await tx
            .update(shed)
            .set({ name: input.name })
            .where(and(eq(shed.id, input.id), eq(shed.farmId, context.farm.id)))
            .returning({ id: shed.id });
          if (!row) {
            throw new ORPCError("NOT_FOUND");
          }
        }
      );
      return { id: input.id, name: input.name };
    }),

  createPen: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ shedId: z.string(), name }))
    .handler(async ({ context, input }) => {
      const id = uuidv7(context.clock.now());
      await audited(context).write(
        {
          entity: "pen",
          entityId: id,
          action: "create",
          after: { name: input.name, shedId: input.shedId },
        },
        async (tx) => {
          const parent = await tx.query.shed.findFirst({
            where: { id: input.shedId, farmId: context.farm.id },
            columns: { id: true },
          });
          if (!parent) {
            throw new ORPCError("NOT_FOUND", { message: "No such shed" });
          }
          await tx.insert(pen).values({
            id,
            farmId: context.farm.id,
            shedId: input.shedId,
            name: input.name,
          });
        }
      );
      return { id, name: input.name };
    }),

  renamePen: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ id: z.string(), name }))
    .handler(async ({ context, input }) => {
      await audited(context).write(
        {
          entity: "pen",
          entityId: input.id,
          action: "update",
          before: async (tx) => {
            const row = await tx.query.pen.findFirst({
              where: { id: input.id },
              columns: { name: true },
            });
            return row ?? null;
          },
          after: { name: input.name },
        },
        async (tx) => {
          const [row] = await tx
            .update(pen)
            .set({ name: input.name })
            .where(and(eq(pen.id, input.id), eq(pen.farmId, context.farm.id)))
            .returning({ id: pen.id });
          if (!row) {
            throw new ORPCError("NOT_FOUND");
          }
        }
      );
      return { id: input.id, name: input.name };
    }),
};
