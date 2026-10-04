import { uuidv7 } from "@OpenFarm/db/ids";
import {
  YEAR_CHANGE_IN_FORCE,
  financialYearChange,
} from "@OpenFarm/db/schema/farm";
import type { YearChange, YearChangeRefusal } from "@OpenFarm/domain";
import {
  farmDayOf,
  financialYearOf,
  refusalOfChange,
  refusalOfWithdrawal,
  yearAfter,
  yearBefore,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { audited } from "../audit";
import { farmMonth } from "../farm-clock";
import { protectedProcedure } from "../index";
import {
  OWNER_ONLY,
  requireOnly,
  requirePersonalSession,
  requireRole,
} from "../roles";
import { yearChangesOf, yearRulesOf } from "../year-store";

/** How many years after this one the farm lists: far enough to see a Transition Year the law has set. */
const YEARS_AHEAD = 3;

const REFUSED: Record<YearChangeRefusal, string> = {
  year_change_not_a_year:
    "A change begins with a year that begins under the rules in force, after the last change",
  year_change_changes_nothing:
    "A change begins its new years in another month of the year",
  year_change_too_long:
    "A Transition Year runs from one month to under two years",
  year_change_reaches_an_ended_year: "A year that has ended keeps its length",
  year_change_not_the_last: "Only the latest change may be withdrawn",
};

const refuse = (refusal: YearChangeRefusal) =>
  new ORPCError("BAD_REQUEST", {
    message: REFUSED[refusal],
    data: { refusal },
  });

/**
 * The farm's Financial Years (ADR 0016, 0017): how they run, and the Year Changes the Owner records when the law moves
 * the year — Bangladesh's July–June to April–March, with 2027–28 a nine-month Transition Year.
 */
export const financialYearsRouter = {
  /**
   * The years around today — last year, this one, and the next few, so a Transition Year ahead is seen — with the
   * month years first began in and every change recorded, withdrawn ones too, and whether each could still be taken
   * back. For those who run the farm; the Owner alone records or withdraws.
   */
  list: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(async ({ context }) => {
      const today = farmDayOf(context.clock.now());
      const [rules, changes] = await Promise.all([
        yearRulesOf(context.db, context.farm.id),
        yearChangesOf(context.db, context.farm.id),
      ]);
      const current = financialYearOf(rules, today);
      const ahead = [current];
      for (let count = 0; count < YEARS_AHEAD; count += 1) {
        const last = ahead.at(-1) ?? current;
        ahead.push(yearAfter(rules, last));
      }
      return {
        firstStarts: rules.firstStarts,
        previous: yearBefore(rules, current),
        current,
        /** This year and the next few, oldest first: the years a change may begin with. */
        ahead,
        changes: changes.map((change) => ({
          ...change,
          withdrawable:
            change.withdrawn === null &&
            refusalOfWithdrawal(rules, change, today) === null,
        })),
      };
    }),

  /**
   * Records a **Year Change**: the year that changes, by the month it begins, the month the first year of the new rule
   * begins, and why. Refused where it would not begin with a year of the rules in force after the last change, would
   * keep the month, would run a Transition Year two years or longer, or would move a year that has ended. The Owner's
   * alone, from her own phone, an Audit Event.
   */
  recordChange: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        changingFrom: farmMonth,
        newFrom: farmMonth,
        reason: z.string().trim().min(1).max(500),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const rules = await yearRulesOf(context.db, context.farm.id);
      const change: YearChange = {
        changingFrom: input.changingFrom,
        newFrom: input.newFrom,
      };
      const refusal = refusalOfChange(rules, change, farmDayOf(now));
      if (refusal) {
        throw refuse(refusal);
      }
      const id = uuidv7(now);
      await audited(context).write(
        {
          entity: "financial_year_change",
          entityId: id,
          action: "create",
          after: { ...change, reason: input.reason },
        },
        (tx) =>
          tx.insert(financialYearChange).values({
            id,
            farmId: context.farm.id,
            ...change,
            reason: input.reason,
            recordedBy: context.actor.id,
            recordedAt: now,
          })
      );
      return { id };
    }),

  /**
   * Withdraws the latest Year Change, with why: the years from it run as they did before. Refused for an earlier
   * change while a later one stands, and for one whose years have begun to end. The Owner's alone, an Audit Event.
   */
  withdrawChange: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        changeId: z.string(),
        reason: z.string().trim().min(1).max(500),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const [rules, row] = await Promise.all([
        yearRulesOf(context.db, context.farm.id),
        context.db.query.financialYearChange.findFirst({
          where: {
            id: input.changeId,
            farmId: context.farm.id,
            ...YEAR_CHANGE_IN_FORCE,
          },
        }),
      ]);
      if (!row) {
        throw new ORPCError("NOT_FOUND", {
          message: "No such change in force",
        });
      }
      const refusal = refusalOfWithdrawal(rules, row, farmDayOf(now));
      if (refusal) {
        throw refuse(refusal);
      }
      await audited(context).write(
        {
          entity: "financial_year_change",
          entityId: row.id,
          action: "update",
          reason: input.reason,
          before: { changingFrom: row.changingFrom, newFrom: row.newFrom },
          after: { withdrawn: true },
        },
        (tx) =>
          tx
            .update(financialYearChange)
            .set({
              withdrawnBy: context.actor.id,
              withdrawnAt: now,
              withdrawnReason: input.reason,
            })
            .where(
              and(
                eq(financialYearChange.id, row.id),
                isNull(financialYearChange.withdrawnAt)
              )
            )
      );
      return { id: row.id };
    }),
};
