import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { READY_REASONS, readySetAside } from "@OpenFarm/db/schema/fattening";
import { animal } from "@OpenFarm/db/schema/herd";
import {
  readySuggestion,
  startOfFarmDay,
  stillWorthSaying,
  underMeatWithdrawal,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import { fatteningOf } from "../fattening-store";
import { requireAnimal } from "../herd-store";
import { protectedProcedure } from "../index";
import { requireRole } from "../roles";

/** Enough that the Manager sees the morning's work; a suggestion list is not a herd list. */
const SUGGESTIONS_SHOWN = 100;

const tagInput = z.string().trim().min(1).max(32);

/** How a suggestion reads: what she weighs, what she is fed towards, and why she is here. */
const withSuggestion = {
  columns: {
    id: true,
    tagNumber: true,
    state: true,
    penId: true,
    stateChangedAt: true,
  },
  with: {
    pen: { columns: { name: true } },
    intake: {
      columns: {
        weightKg: true,
        arrivedAt: true,
        targetWeightKg: true,
        targetWindowStart: true,
        targetWindowEnd: true,
      },
    },
    weighIns: {
      orderBy: { weighedAt: "desc", id: "desc" },
      limit: 12,
      columns: { weightKg: true, weighedAt: true },
    },
    readySetAside: { columns: { because: true, setAsideAt: true } },
  },
} as const;

export const readyRouter = {
  /**
   * The animals the farm thinks are ready to sell, and why it thinks so.
   *
   * A suggestion and never a decision (the fattening decision, 2026-09-10): the system suggests
   * on target weight reached or Target Window open, and the Manager confirms. One the Manager has
   * already answered is not offered again until the farm has something new to say.
   */
  suggestions: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(async ({ context }) => {
      const now = context.clock.now();
      const rows = await context.db.query.animal.findMany({
        where: {
          farmId: context.farm.id,
          side: "fattening",
          // One already confirmed needs no suggesting, and one that has left the farm none at all.
          state: { in: ["quarantine", "fattening"] },
        },
        limit: SUGGESTIONS_SHOWN,
        ...withSuggestion,
      });
      return rows.flatMap(
        ({ intake, weighIns, pen, readySetAside: aside, ...beast }) => {
          const view = fatteningOf(intake, weighIns, now);
          const because = readySuggestion(
            view,
            intake ? startOfFarmDay(intake.targetWindowStart) : null,
            now
          );
          if (
            !(
              because &&
              stillWorthSaying(because, aside ?? null, beast.stateChangedAt)
            )
          ) {
            return [];
          }
          return [{ ...beast, penName: pen.name, because, ...view }];
        }
      );
    }),

  /**
   * The Manager's decision: this animal may be sold.
   *
   * Confirming is the State change, because readiness is a judgement and not an arithmetic
   * result. The Owner may confirm too (roles matrix: Ready for Sale is `confirm` for both).
   *
   * An animal inside her meat Withdrawal cannot be made ready at all — not "warned about", not
   * "confirmed anyway". Her days are not up, and the whole point of the record is that nobody can
   * decide otherwise on the day.
   */
  confirm: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ tagNumber: tagInput }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const tagNumber = input.tagNumber.toUpperCase();
      const her = await requireAnimal(context.db, context.farm.id, tagNumber);
      if (underMeatWithdrawal(her, now)) {
        throw new ORPCError("BAD_REQUEST", {
          message: "She is still inside her meat withdrawal",
          data: {
            refusal: "meat_withdrawal",
            fitOn: her.meatWithdrawalUntil?.toISOString() ?? null,
          },
        });
      }
      if (her.state !== "fattening") {
        throw new ORPCError("BAD_REQUEST", {
          message: "Only an animal being fattened can be made ready for sale",
          data: { refusal: "not_fattening", state: her.state },
        });
      }
      await audited(context).write(
        {
          entity: "animal",
          entityId: her.id,
          action: "update",
          before: { state: her.state },
          after: { state: "ready_for_sale" },
        },
        // Her State change is what overtakes any set-aside standing against her: the record of
        // what the Manager decided and why stays, and simply stops being the last word.
        (tx) =>
          tx
            .update(animal)
            .set({
              state: "ready_for_sale",
              stateChangedAt: now,
              updatedAt: now,
            })
            .where(eq(animal.id, her.id))
      );
      return { tagNumber, state: "ready_for_sale" as const };
    }),

  /**
   * The Manager has looked at one the farm suggested and decided she is staying.
   *
   * Recorded rather than dismissed: why she is staying is worth as much as why she went, and a
   * queue cleared without a word is a queue nobody can audit.
   */
  setAside: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(
      z.object({
        tagNumber: tagInput,
        because: z.enum(READY_REASONS),
        reason: z.string().trim().min(1).max(300),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const tagNumber = input.tagNumber.toUpperCase();
      const her = await requireAnimal(context.db, context.farm.id, tagNumber);
      const values = {
        farmId: context.farm.id,
        animalId: her.id,
        because: input.because,
        reason: input.reason,
        setAsideBy: context.actor.id,
        setAsideAt: now,
      };
      await audited(context).write(
        {
          entity: "ready_set_aside",
          entityId: her.id,
          action: "update",
          after: { because: input.because, reason: input.reason },
          reason: input.reason,
        },
        (tx) =>
          tx
            .insert(readySetAside)
            .values({ id: newId(now), ...values })
            // A second look replaces the first: what matters is the last thing decided.
            .onConflictDoUpdate({
              target: readySetAside.animalId,
              set: values,
            })
      );
      return { tagNumber, because: input.because };
    }),
};
