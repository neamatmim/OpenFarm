import type { Database } from "@OpenFarm/db";
import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { eq } from "@OpenFarm/db/operators";
import { READY_REASONS, readySetAside } from "@OpenFarm/db/schema/fattening";
import { animal } from "@OpenFarm/db/schema/herd";
import {
  readyGrounds,
  stillWorthSaying,
  underMeatWithdrawal,
  windowHasClosed,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { requireAnimal } from "../herd-store";
import { protectedProcedure } from "../index";
import { fatteningRows } from "../ready-store";
import { requireRole } from "../roles";

const tagInput = z.string().trim().min(1).max(32);

/** Her set-aside as the trail records it either side of a change, so a Manager who changes
 *  their mind leaves both decisions behind rather than one. */
const readSetAside = async (tx: Tx | Database, animalId: string) => {
  const row = await tx.query.readySetAside.findFirst({
    where: { animalId },
    columns: { grounds: true, reason: true, setAsideAt: true },
  });
  return row ?? null;
};

/** Her State, for the trail either side of a confirmation. */
const readState = async (tx: Tx, animalId: string) => {
  const row = await tx.query.animal.findFirst({
    where: { id: animalId },
    columns: { state: true, stateChangedAt: true },
  });
  return row ?? null;
};

/** Her State and her days, read inside the transaction that is about to act on them. */
const readAnimalForReady = async (tx: Tx, animalId: string) => {
  const row = await tx.query.animal.findFirst({
    where: { id: animalId },
    columns: {
      state: true,
      meatWithdrawalUntil: true,
      meatWithdrawalFromDoses: true,
      milkWithdrawalUntil: true,
      milkWithdrawalFromDoses: true,
      withdrawalShortenedAt: true,
      withdrawalShortenedReason: true,
    },
  });
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "No such animal" });
  }
  return row;
};

export const readyRouter = {
  /**
   * The animals the farm thinks may be sold, and the grounds it thinks so on.
   *
   * A suggestion and never a decision (the fattening decision, 2026-09-10): the system suggests
   * on target weight reached **or** Target Window open, and the Manager confirms. Both grounds
   * are reported when both hold — which of them moves a Manager is theirs to weigh.
   *
   * Only animals who could actually be confirmed appear: one still in Quarantine, or one inside
   * her meat Withdrawal, would be a button that refuses whoever pressed it.
   */
  suggestions: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(async ({ context }) => {
      const now = context.clock.now();
      const rows = await fatteningRows(
        context.db,
        context.farm.id,
        { states: ["fattening"] },
        now
      );
      return rows.flatMap((row) => {
        if (underMeatWithdrawal(row, now)) {
          return [];
        }
        const grounds = readyGrounds(row.view, row.window, now);
        if (!stillWorthSaying(grounds, row.setAside, row.stateChangedAt)) {
          return [];
        }
        // Her Eid has gone by and she is still eating: more reason to look, not less.
        const windowClosed = windowHasClosed(row.window, now);
        const { window: _window, setAside: _aside, view, ...rest } = row;
        return [{ ...rest, grounds, windowClosed, ...view }];
      });
    }),

  /**
   * The Manager's decision: this animal may be sold.
   *
   * Confirming is the State change, because readiness is a judgement and not an arithmetic
   * result. The Owner may confirm too (roles matrix: Ready for Sale is `confirm` for both).
   *
   * An animal inside her meat Withdrawal cannot be made ready at all — not warned about, not
   * confirmed anyway. `animals.setState` refuses the same move by name, so there is one door and
   * not two: a gate on one of them would be no gate.
   */
  confirm: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(z.object({ tagNumber: tagInput }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const tagNumber = input.tagNumber.toUpperCase();
      const her = await requireAnimal(context.db, context.farm.id, tagNumber);
      await audited(context).write(
        {
          entity: "animal",
          entityId: her.id,
          action: "update",
          before: (tx) => readState(tx, her.id),
          after: (tx) => readState(tx, her.id),
        },
        async (tx) => {
          // Read inside the transaction: her days and her State are what they are when the
          // write happens, not what they were when the request was parsed.
          const now_ = await readAnimalForReady(tx, her.id);
          if (underMeatWithdrawal(now_, now)) {
            throw new ORPCError("BAD_REQUEST", {
              message: "She is still inside her meat withdrawal",
              data: {
                refusal: "meat_withdrawal",
                fitOn: now_.meatWithdrawalUntil?.toISOString() ?? null,
              },
            });
          }
          if (now_.state !== "fattening") {
            throw new ORPCError("BAD_REQUEST", {
              message:
                "Only an animal being fattened can be made ready for sale",
              data: { refusal: "not_fattening", state: now_.state },
            });
          }
          // Her State change is what overtakes any set-aside standing against her: the record
          // of what the Manager decided and why stays, and stops being the last word.
          await tx
            .update(animal)
            .set({
              state: "ready_for_sale",
              stateChangedAt: now,
              updatedAt: now,
            })
            .where(eq(animal.id, her.id));
        }
      );
      return { tagNumber, state: "ready_for_sale" as const };
    }),

  /**
   * The Manager has looked at one the farm suggested and decided she is staying.
   *
   * Recorded rather than dismissed: why she is staying is worth as much as why she went, and a
   * queue cleared without a word is a queue nobody can audit. The farm stops saying it until it
   * has something new to say — a ground that was not there when the Manager looked.
   */
  setAside: protectedProcedure
    .use(requireRole("owner", "manager"))
    .input(
      z.object({
        tagNumber: tagInput,
        /** What the Manager was looking at when they decided. */
        grounds: z.array(z.enum(READY_REASONS)).min(1),
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
        grounds: input.grounds,
        reason: input.reason,
        setAsideBy: context.actor.id,
        setAsideAt: now,
      };
      const standing = await readSetAside(context.db, her.id);
      await audited(context).write(
        {
          entity: "ready_set_aside",
          entityId: her.id,
          action: standing ? "update" : "create",
          // What they decided last time, so a Manager who changes their mind leaves both
          // decisions behind. The row holds the latest; the trail holds all of them.
          before: (tx) => readSetAside(tx, her.id),
          after: (tx) => readSetAside(tx, her.id),
          reason: input.reason,
        },
        (tx) =>
          tx
            .insert(readySetAside)
            .values({ id: newId(now), ...values })
            .onConflictDoUpdate({
              target: readySetAside.animalId,
              set: values,
            })
      );
      return { tagNumber, grounds: input.grounds };
    }),
};


