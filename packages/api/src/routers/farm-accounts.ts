import { uuidv7 as newId } from "@OpenFarm/db/ids";
import { and, eq } from "@OpenFarm/db/operators";
import {
  FARM_ACCOUNT_KINDS,
  farmAccount,
  farmAccountCheck,
} from "@OpenFarm/db/schema/money";
import {
  maskedDigits,
  monthOf,
  roundMoney,
  startOfFarmDay,
} from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import {
  believedAtMonthEnd,
  farmAccountStandingOf,
  firstReadingOf,
} from "../farm-account-store";
import { protectedProcedure } from "../index";
import { monthInput } from "../money-inputs";
import {
  OWNER_ONLY,
  requireOnly,
  requirePersonalSession,
  requireRole,
} from "../roles";
import { lockTheFarm } from "../venture-store";

// The Farm's own mobile money numbers and bank accounts — its **Farm Accounts** — where its money by mobile money or the bank goes in
// and comes out. The Owner's to list and retire; everyone who writes money picks one by its name and last digits.

/** A Farm Account as the trail records it. */
const readFarmAccount = async (tx: Tx, id: string) =>
  (await tx.query.farmAccount.findFirst({ where: { id } })) ?? null;

/** A month's reading of a Farm Account's statement, as the trail records it. */
const readCheck = async (tx: Pick<Tx, "query">, id: string) =>
  (await tx.query.farmAccountCheck.findFirst({ where: { id } })) ?? null;

const idOfTheMonth = (farmId: string, farmAccountId: string, month: string) =>
  `${farmId}:${farmAccountId}:${month}`;

/** This farm's Farm Account, or nothing the caller may read a statement against. */
const ours = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  id: string
): Promise<{ id: string }> => {
  const row = await tx.query.farmAccount.findFirst({
    where: { id, farmId },
    columns: { id: true },
  });
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "No such Farm Account" });
  }
  return row;
};

/** A month before an account's first reading: there is nothing it could be read against. */
const beforeTheFirstReading = () =>
  new ORPCError("BAD_REQUEST", {
    message: "That month is before this account's first reading",
    data: { refusal: "before_the_first_reading" },
  });

export const farmAccountsRouter = {
  /**
   * Every Farm Account, the retired ones last and said so: a Correction to old money may still name one. The number
   * whole for the Owner; for anybody else, every digit but the last four hidden, as an Investor's bank is.
   */
  list: protectedProcedure
    .use(requireRole("owner", "manager", "vet"))
    .handler(async ({ context }) => {
      const rows = await context.db.query.farmAccount.findMany({
        where: { farmId: context.farm.id },
        orderBy: { createdAt: "asc", id: "asc" },
      });
      const owner = context.roles.includes("owner");
      // How each stands against its statements, and what the farm believes it holds: the Owner's, as the Bank Check is.
      const standing = owner
        ? await farmAccountStandingOf(
            context.db,
            context.farm.id,
            rows.map((one) => one.id),
            context.clock.now()
          )
        : new Map();
      return rows
        .map((one) => ({
          id: one.id,
          kind: one.kind,
          name: one.name,
          number: owner ? one.number : maskedDigits(one.number),
          bank: one.bank,
          branch: one.branch,
          retired: one.retiredAt !== null,
          /** Never read, or not the Owner asking: nothing. */
          standing: standing.get(one.id) ?? null,
        }))
        .toSorted((a, b) => Number(a.retired) - Number(b.retired));
    }),

  /** One of the Farm's mobile money numbers or bank accounts listed. One per kind and number, retired or not. */
  create: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        kind: z.enum(FARM_ACCOUNT_KINDS),
        name: z.string().trim().min(1).max(80),
        number: z.string().trim().min(3).max(40),
        bank: z.string().trim().max(80).optional(),
        branch: z.string().trim().max(80).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const id = newId(now);
      await audited(context).write(
        {
          entity: "farm_account",
          entityId: id,
          action: "create",
          after: (tx) => readFarmAccount(tx, id),
        },
        async (tx) => {
          const same = await tx.query.farmAccount.findFirst({
            where: {
              farmId: context.farm.id,
              kind: input.kind,
              number: input.number,
            },
            columns: { id: true },
          });
          if (same) {
            throw new ORPCError("BAD_REQUEST", {
              message: "That number is listed already",
              data: { refusal: "farm_account_listed_already" },
            });
          }
          await tx.insert(farmAccount).values({
            id,
            farmId: context.farm.id,
            kind: input.kind,
            name: input.name,
            number: input.number,
            bank: input.kind === "bank" ? (input.bank ?? null) : null,
            branch: input.kind === "bank" ? (input.branch ?? null) : null,
            createdBy: context.actor.id,
            createdAt: now,
          });
        }
      );
      return { id };
    }),

  /** Retired, never removed: money booked last year still names it, and no new money may. */
  retire: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      await audited(context).write(
        {
          entity: "farm_account",
          entityId: input.id,
          action: "update",
          before: (tx) => readFarmAccount(tx, input.id),
          after: (tx) => readFarmAccount(tx, input.id),
        },
        async (tx) => {
          await tx
            .update(farmAccount)
            .set({ retiredAt: now })
            .where(
              and(
                eq(farmAccount.id, input.id),
                eq(farmAccount.farmId, context.farm.id)
              )
            );
        }
      );
      return { id: input.id };
    }),

  /**
   * What the farm believes a Farm Account held at a month's end, so the Owner has something to hold its statement
   * against before she writes anything down — nothing before its first reading, which is the statement itself.
   */
  expectedAtMonthEnd: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string(), month: monthInput }))
    .handler(async ({ context, input }) => {
      const row = await ours(context.db, context.farm.id, input.id);
      const expectedMoney = await believedAtMonthEnd(
        context.db,
        context.farm.id,
        row.id,
        input.month
      );
      const already = await context.db.query.farmAccountCheck.findFirst({
        where: { farmAccountId: row.id, forMonth: input.month },
      });
      return {
        /** Nothing: no statement read yet, or this month is before the first one. */
        expectedMoney,
        checked: already
          ? {
              readMoney: already.readMoney,
              expectedMoney: already.expectedMoney,
              note: already.note,
              stale:
                expectedMoney !== null &&
                roundMoney(expectedMoney - already.expectedMoney) !== 0,
            }
          : null,
      };
    }),

  /**
   * A month's reading of a Farm Account's statement — the Bank Check of the Farm's own money. Its first reading is what
   * it held from then on; a later month that disagrees is kept as disagreeing, and comes right only with what she found
   * out. The Owner's alone, from her own phone.
   */
  check: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        id: z.string(),
        month: monthInput,
        /** What the statement said. Signed: an overdrawn account is told, not refused. */
        readMoney: z.number().min(-1_000_000_000).max(1_000_000_000),
        /** What she has found out about a difference, where she has found out anything. */
        note: z.string().trim().max(400).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const row = await ours(context.db, context.farm.id, input.id);
      if (monthOf(startOfFarmDay(`${input.month}-01`)).until > now) {
        throw new ORPCError("BAD_REQUEST", {
          message: "That month is not over yet",
          data: { refusal: "month_not_over" },
        });
      }
      const id = idOfTheMonth(context.farm.id, row.id, input.month);
      const readBefore = await readCheck(context.db, id);
      let expectedMoney = 0;
      await audited(context).write(
        {
          entity: "farm_account_check",
          entityId: id,
          action: readBefore ? "update" : "create",
          reason: input.note,
          before: (tx) => readCheck(tx, id),
          after: (tx) => readCheck(tx, id),
        },
        async (tx) => {
          // Behind the farm's lock: what the farm believes is true only until the next Money Event commits.
          await lockTheFarm(tx, context.farm.id);
          const first = await firstReadingOf(tx, context.farm.id, row.id);
          if (first && input.month < first.forMonth) {
            throw beforeTheFirstReading();
          }
          // The first reading is the statement itself: what the account held, which every later month starts from.
          const isFirst = !first || first.forMonth === input.month;
          expectedMoney = isFirst
            ? input.readMoney
            : ((await believedAtMonthEnd(
                tx,
                context.farm.id,
                row.id,
                input.month
              )) ?? input.readMoney);
          const already = await tx.query.farmAccountCheck.findFirst({
            where: { id },
          });
          // A month found to disagree does not come right by being typed again: she says what she found out.
          const disagreed =
            already !== undefined &&
            roundMoney(already.readMoney - already.expectedMoney) !== 0;
          if (disagreed && !input.note) {
            throw new ORPCError("BAD_REQUEST", {
              message:
                "Say what you found out about the month that did not agree",
              data: { refusal: "say_what_you_found_out" },
            });
          }
          const agreesNow = roundMoney(input.readMoney - expectedMoney) === 0;
          await tx
            .insert(farmAccountCheck)
            .values({
              id,
              farmId: context.farm.id,
              farmAccountId: row.id,
              forMonth: input.month,
              readMoney: input.readMoney,
              expectedMoney,
              note: input.note ?? null,
              checkedBy: context.actor.id,
              checkedAt: now,
            })
            .onConflictDoUpdate({
              target: farmAccountCheck.id,
              set: {
                readMoney: input.readMoney,
                expectedMoney,
                // Kept unless she says something new; dropped once the month agrees.
                note:
                  input.note ?? (agreesNow ? null : (already?.note ?? null)),
                checkedBy: context.actor.id,
                checkedAt: now,
              },
            });
        }
      );
      return {
        expectedMoney,
        readMoney: input.readMoney,
        differenceMoney: roundMoney(input.readMoney - expectedMoney),
      };
    }),
};
