import { uuidv7 } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { venture } from "@OpenFarm/db/schema/venture";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import { farmDay } from "../farm-clock";
import { protectedProcedure } from "../index";
import { OWNER_ONLY, requireOnly, requirePersonalSession } from "../roles";
import { capitalInBdt, readVenture, ventureView } from "../venture-store";

/** Taka. A Venture is planned in lakhs; the column keeps poisha so the money can be added up. */
const money = z.number().min(0).max(1_000_000_000);

const openInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    targetCapitalBdt: money,
    /** The least capital this is worth starting on. The farm's own percentage unless the Owner says. */
    floorBdt: money.optional(),
    /** The day the Floor must be met by. */
    decideBy: farmDay,
    targetWindowStart: farmDay,
    targetWindowEnd: farmDay,
    unitPriceBdt: money,
    /** How many Units there are. As many as the unit price divides the capital into, unless the Owner
     *  says otherwise: a Venture may leave Units unsold and take less than it hoped. */
    units: z.number().int().min(1).max(10_000).optional(),
    /** The part of the capital meant for buying animals; the rest keeps them. The farm's own share
     *  unless the Owner says. */
    cattleBudgetBdt: money.optional(),
  })
  .refine((one) => one.targetWindowStart <= one.targetWindowEnd, {
    message: "A Target Window needs its days in order",
  });

/** The plan as it stands once the farm's own parameters have filled in what the Owner did not say. */
const planned = (
  input: z.infer<typeof openInput>,
  farm: { ventureFloorPercent: number; ventureRunningPercent: number }
) => ({
  floorBdt:
    input.floorBdt ??
    Math.round((input.targetCapitalBdt * farm.ventureFloorPercent) / 100),
  units:
    input.units ??
    Math.max(1, Math.round(input.targetCapitalBdt / input.unitPriceBdt)),
  cattleBudgetBdt:
    input.cattleBudgetBdt ??
    Math.round(
      (input.targetCapitalBdt * (100 - farm.ventureRunningPercent)) / 100
    ),
});

/** What a Venture may be moved to by hand, and from where. Everything else moves by what the farm does. */
const MOVES = {
  buying: "open",
  fattening: "buying",
} as const;

/** The context a gated handler has: the Role is settled and the Farm is certain. */
type Context = Parameters<typeof audited>[0] & { farm: { id: string } };

/** This Farm's Venture, or nothing the caller may act on. */
const ours = async (context: Context, id: string) => {
  const row = await context.db.query.venture.findFirst({
    where: { id, farmId: context.farm.id },
  });
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "No such Venture" });
  }
  return row;
};

/** Moves a Venture on, from the one state it may be moved from, and says why not when it may not. */
const moveTo = async (
  context: Context,
  id: string,
  to: keyof typeof MOVES
): Promise<{ state: keyof typeof MOVES }> => {
  const row = await ours(context, id);
  if (row.state !== MOVES[to]) {
    throw new ORPCError("BAD_REQUEST", {
      message: `A Venture goes to ${to} from ${MOVES[to]}, and this one is ${row.state}`,
      data: { refusal: "venture_wrong_state" },
    });
  }
  if (to === "buying") {
    const held = await capitalInBdt(context.db, [row.id]);
    if ((held.get(row.id) ?? 0) < Number(row.floorBdt)) {
      throw new ORPCError("BAD_REQUEST", {
        message: "The Venture holds less than its Floor",
        data: { refusal: "venture_under_floor" },
      });
    }
  }
  await audited(context).write(
    {
      entity: "venture",
      entityId: row.id,
      action: "update",
      before: (tx) => readVenture(tx, context.farm.id, row.id),
      after: (tx) => readVenture(tx, context.farm.id, row.id),
    },
    (tx) => tx.update(venture).set({ state: to }).where(eq(venture.id, row.id))
  );
  return { state: to };
};

export const venturesRouter = {
  /**
   * The Ventures the farm has, newest first, each with what it holds against what it was looking for.
   *
   * The Owner's alone. A Venture is money between her and the people who trusted her with it; the Manager
   * runs the shed and sees which Venture owns an Animal, which arrives with the buying increment.
   */
  list: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .handler(async ({ context }) => {
      const rows = await context.db.query.venture.findMany({
        where: { farmId: context.farm.id },
        orderBy: { createdAt: "desc", id: "desc" },
      });
      const held = await capitalInBdt(
        context.db,
        rows.map((one) => one.id)
      );
      return rows.map((one) => ventureView(one, held.get(one.id) ?? 0));
    }),

  /**
   * One Venture written up before anybody pays into it: what it is looking for, the Floor below which
   * buying is not worth starting, the day to decide by, the window it sells in, its Units and how its
   * capital is planned between buying the animals and keeping them.
   */
  open: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(openInput)
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const plan = planned(input, context.farm);
      if (plan.floorBdt > input.targetCapitalBdt) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            "The Floor cannot be more than the capital the Venture is after",
          data: { refusal: "venture_floor_over_target" },
        });
      }
      if (plan.cattleBudgetBdt > input.targetCapitalBdt) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            "The Cattle Budget cannot be more than the capital it comes from",
          data: { refusal: "venture_budget_over_capital" },
        });
      }
      const id = uuidv7(now);
      await audited(context).write(
        {
          entity: "venture",
          entityId: id,
          action: "create",
          after: (tx) => readVenture(tx, context.farm.id, id),
        },
        (tx) =>
          tx.insert(venture).values({
            id,
            farmId: context.farm.id,
            name: input.name,
            targetCapitalBdt: input.targetCapitalBdt.toFixed(2),
            floorBdt: plan.floorBdt.toFixed(2),
            decideBy: input.decideBy,
            targetWindowStart: input.targetWindowStart,
            targetWindowEnd: input.targetWindowEnd,
            unitPriceBdt: input.unitPriceBdt.toFixed(2),
            units: plan.units,
            cattleBudgetBdt: plan.cattleBudgetBdt.toFixed(2),
            openedBy: context.actor.id,
            openedByRole: context.roleUsed,
            createdAt: now,
          })
      );
      return { id };
    }),

  /**
   * The Owner says the money is in and the buying may start. Refused while what the Venture holds is under
   * its Floor: buying a handful of bulls on half the capital is not the run anybody signed for.
   */
  startBuying: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string() }))
    .handler(({ context, input }) => moveTo(context, input.id, "buying")),

  /** All bought: the Venture is feeding them now. */
  startFattening: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string() }))
    .handler(({ context, input }) => moveTo(context, input.id, "fattening")),

  /**
   * A Venture called off: the Floor was not met by the day it had to be, so nothing is bought and every
   * taka goes back. Only from Open — once an animal has been bought with the money, it is not a plan any
   * more. The refunds themselves arrive with the capital ticket.
   */
  cancel: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({ id: z.string(), reason: z.string().trim().min(1).max(400) })
    )
    .handler(async ({ context, input }) => {
      const row = await ours(context, input.id);
      if (row.state !== "open") {
        throw new ORPCError("BAD_REQUEST", {
          message: "Only a Venture still open may be called off",
          data: { refusal: "venture_wrong_state" },
        });
      }
      await audited(context).write(
        {
          entity: "venture",
          entityId: row.id,
          action: "update",
          reason: input.reason,
          before: (tx) => readVenture(tx, context.farm.id, row.id),
          after: (tx) => readVenture(tx, context.farm.id, row.id),
        },
        (tx) =>
          tx
            .update(venture)
            .set({ state: "cancelled", cancelledReason: input.reason })
            .where(eq(venture.id, row.id))
      );
      return { state: "cancelled" as const };
    }),
};
