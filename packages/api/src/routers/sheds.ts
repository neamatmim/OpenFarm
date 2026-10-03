import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq } from "@OpenFarm/db/operators";
import { pen, shed } from "@OpenFarm/db/schema/herd";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { requirePen } from "../herd-store";
import { protectedProcedure } from "../index";
import { requireRole } from "../roles";

const name = z.string().trim().min(1).max(80);

/** Sheds contain Pens; every Animal is in exactly one Pen. */
export const shedsRouter = {
  list: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .handler(({ context }) =>
      context.db.query.shed.findMany({
        where: { farmId: context.farm.id },
        orderBy: { name: "asc" },
        with: { pens: { orderBy: { name: "asc" } } },
      })
    ),

  /**
   * Animals in Quarantine standing outside every quarantine pen — put there before pens were marked — for the Manager to
   * walk in. Nothing moves them by itself; empty once they are in.
   */
  quarantineAstray: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(async ({ context }) => {
      const rows = await context.db.query.animal.findMany({
        where: { farmId: context.farm.id, state: "quarantine" },
        columns: { tagNumber: true },
        with: {
          pen: { columns: { name: true, quarantine: true } },
        },
        orderBy: { tagNumber: "asc" },
      });
      return rows
        .filter((one) => !one.pen.quarantine)
        .map((one) => ({ tagNumber: one.tagNumber, penName: one.pen.name }));
    }),

  create: protectedProcedure
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

  rename: protectedProcedure
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

  /** The Pens inside a Shed, where every Animal is. */
  pens: {
    create: protectedProcedure
      .use(requireRole("owner", "manager"))
      .input(
        z.object({
          shedId: z.string(),
          name,
          /** A quarantine pen, where bought animals come in. */
          quarantine: z.boolean().default(false),
        })
      )
      .handler(async ({ context, input }) => {
        const id = uuidv7(context.clock.now());
        await audited(context).write(
          {
            entity: "pen",
            entityId: id,
            action: "create",
            after: {
              name: input.name,
              shedId: input.shedId,
              quarantine: input.quarantine,
            },
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
              quarantine: input.quarantine,
            });
          }
        );
        return { id, name: input.name };
      }),

    rename: protectedProcedure
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

    /**
     * A Pen marked as a quarantine pen, or not: where a bought animal comes in, and is kept until released. The Owner's or
     * the Manager's, as Pens are made. Never unmarked while it holds an animal in Quarantine — that would leave her
     * standing outside every quarantine pen without having been walked.
     */
    markQuarantine: protectedProcedure
      .use(requireRole("owner", "manager"))
      .input(z.object({ penId: z.string(), quarantine: z.boolean() }))
      .handler(async ({ context, input }) => {
        const readPen = async (tx: Pick<Tx, "query">) =>
          (await tx.query.pen.findFirst({
            where: { id: input.penId, farmId: context.farm.id },
            columns: { name: true, quarantine: true },
          })) ?? null;
        await audited(context).write(
          {
            entity: "pen",
            entityId: input.penId,
            action: "update",
            before: readPen,
            after: readPen,
          },
          async (tx) => {
            await requirePen(tx, context.farm.id, input.penId);
            if (!input.quarantine) {
              const held = await tx.query.animal.findFirst({
                where: {
                  farmId: context.farm.id,
                  penId: input.penId,
                  state: "quarantine",
                },
                columns: { tagNumber: true },
              });
              if (held) {
                throw new ORPCError("BAD_REQUEST", {
                  message: `${held.tagNumber} is in Quarantine in this pen`,
                  data: {
                    refusal: "pen_holds_quarantine",
                    tagNumber: held.tagNumber,
                  },
                });
              }
            }
            await tx
              .update(pen)
              .set({ quarantine: input.quarantine })
              .where(
                and(eq(pen.id, input.penId), eq(pen.farmId, context.farm.id))
              );
          }
        );
        return { penId: input.penId, quarantine: input.quarantine };
      }),
  },
};
