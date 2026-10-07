import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, notInArray, sql } from "@OpenFarm/db/operators";
import { animal, pen, shed } from "@OpenFarm/db/schema/herd";
import { EXIT_STATES } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { requirePen } from "../herd-store";
import { protectedProcedure } from "../index";
import { sameName } from "../names";
import { requireRole } from "../roles";
import { lockTheFarm } from "../venture-store";

const name = z.string().trim().min(1).max(80);
/** No pen on a farm of a few hundred head holds more; a figure past it is a slip of the thumb. */
const MOST_HEAD_A_PEN_HOLDS = 500;

/** Refuses a Shed name the farm already has, whatever the capitals or the keyboard: two Sheds called "Shed A" are one
 *  name for two places, and a register could not say which. */
const assertShedNameFree = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  wanted: string,
  exceptId?: string
): Promise<void> => {
  const sheds = await tx.query.shed.findMany({
    where: { farmId },
    columns: { id: true, name: true },
  });
  if (sheds.some((one) => one.id !== exceptId && sameName(one.name, wanted))) {
    throw new ORPCError("BAD_REQUEST", {
      message: "The farm has a shed by that name already",
      data: { refusal: "shed_name_taken" },
    });
  }
};

/** Refuses a Pen name its Shed already has, as a Shed's name is refused. Two Sheds may each have a "Pen 1". */
const assertPenNameFree = async (
  tx: Pick<Tx, "query">,
  shedId: string,
  wanted: string,
  exceptId?: string
): Promise<void> => {
  const pens = await tx.query.pen.findMany({
    where: { shedId },
    columns: { id: true, name: true },
  });
  if (pens.some((one) => one.id !== exceptId && sameName(one.name, wanted))) {
    throw new ORPCError("BAD_REQUEST", {
      message: "This shed has a pen by that name already",
      data: { refusal: "pen_name_taken" },
    });
  }
};

/** Sheds contain Pens; every Animal is in exactly one Pen. */
export const shedsRouter = {
  /** Each Shed with its Pens, and how many animals stand in each Pen today against the head it holds. */
  list: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .handler(async ({ context }) => {
      const [sheds, heads] = await Promise.all([
        context.db.query.shed.findMany({
          where: { farmId: context.farm.id },
          orderBy: { name: "asc" },
          with: { pens: { orderBy: { name: "asc" } } },
        }),
        context.db
          .select({ penId: animal.penId, head: sql<number>`count(*)::int` })
          .from(animal)
          .where(
            and(
              eq(animal.farmId, context.farm.id),
              notInArray(animal.state, [...EXIT_STATES])
            )
          )
          .groupBy(animal.penId),
      ]);
      const headIn = new Map(heads.map((one) => [one.penId, one.head]));
      return sheds.map((one) => ({
        ...one,
        pens: one.pens.map((each) => ({
          ...each,
          head: headIn.get(each.id) ?? 0,
        })),
      }));
    }),

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
        async (tx) => {
          await lockTheFarm(tx, context.farm.id);
          await assertShedNameFree(tx, context.farm.id, input.name);
          await tx
            .insert(shed)
            .values({ id, farmId: context.farm.id, name: input.name });
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
          await lockTheFarm(tx, context.farm.id);
          await assertShedNameFree(tx, context.farm.id, input.name, input.id);
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
            await lockTheFarm(tx, context.farm.id);
            await assertPenNameFree(tx, input.shedId, input.name);
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
            const which = await tx.query.pen.findFirst({
              where: { id: input.id, farmId: context.farm.id },
              columns: { shedId: true },
            });
            if (which) {
              await lockTheFarm(tx, context.farm.id);
              await assertPenNameFree(tx, which.shedId, input.name, input.id);
            }
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
     * How many head a Pen holds, as the Owner or the Manager reckons it from its stalls and trough — or none again, when
     * it is rebuilt and nobody has counted. Nothing is refused for it: a Pen over its capacity is told, never shut.
     */
    setCapacity: protectedProcedure
      .use(requireRole("owner", "manager"))
      .input(
        z.object({
          penId: z.string(),
          capacity: z
            .number()
            .int()
            .min(1)
            .max(MOST_HEAD_A_PEN_HOLDS)
            .nullable(),
        })
      )
      .handler(async ({ context, input }) => {
        await audited(context).write(
          {
            entity: "pen",
            entityId: input.penId,
            action: "update",
            before: async (tx) =>
              (await tx.query.pen.findFirst({
                where: { id: input.penId, farmId: context.farm.id },
                columns: { capacity: true },
              })) ?? null,
            after: { capacity: input.capacity },
          },
          async (tx) => {
            const [row] = await tx
              .update(pen)
              .set({ capacity: input.capacity })
              .where(
                and(eq(pen.id, input.penId), eq(pen.farmId, context.farm.id))
              )
              .returning({ id: pen.id });
            if (!row) {
              throw new ORPCError("NOT_FOUND", { message: "No such pen" });
            }
          }
        );
        return { penId: input.penId, capacity: input.capacity };
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
            if (input.quarantine) {
              // Dairy animals already in it would stand among the bulls the next Intake puts there (the Owner,
              // 2026-10-07).
              const herd = await tx.query.animal.findFirst({
                where: {
                  farmId: context.farm.id,
                  penId: input.penId,
                  side: "dairy",
                  state: { notIn: [...EXIT_STATES] },
                },
                columns: { tagNumber: true },
              });
              if (herd) {
                throw new ORPCError("BAD_REQUEST", {
                  message: `${herd.tagNumber} of the dairy herd is in this pen`,
                  data: {
                    refusal: "pen_holds_herd",
                    tagNumber: herd.tagNumber,
                  },
                });
              }
            }
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
