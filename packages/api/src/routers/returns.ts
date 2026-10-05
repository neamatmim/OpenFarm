import { uuidv7 } from "@OpenFarm/db/ids";
import {
  HEAD_PRICE_KINDS,
  bankRate,
  dairyEntryPrice,
  headPrice,
} from "@OpenFarm/db/schema/returns";
import { bredHere, farmDayOf } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "../audit";
import { EVER_ON_THE_DAIRY_SIDE } from "../dairy-returns";
import { farmDay } from "../farm-clock";
import { protectedProcedure } from "../index";
import { priceTheJoining, weighedForTheCrossing } from "../joining-store";
import {
  ACROSS_BREAKDOWNS,
  BREAKDOWNS,
  breakdownAcross,
  dairyAnimalReturns,
  returnsPage,
  runningSeasons,
  seasonBreakdown,
  ventureReturns,
} from "../returns-store";
import { OWNER_ONLY, requireOnly, requirePersonalSession } from "../roles";
import { priceAtWeight } from "../venture-store";

/**
 * What the money in the farm's cattle returned: the Owner's Returns page. Each Season of the Farm's own fattening
 * cattle and each Venture, worked as a Settlement is. The Owner's alone, as an animal's money is.
 */
export const returnsRouter = {
  list: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .handler(({ context }) =>
      returnsPage(context.db, context.farm, context.clock.now())
    ),

  /** The Seasons still going, for the strip above the Fattening board: the Owner's alone, as the animal prices are. */
  runningSeasons: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .handler(({ context }) =>
      runningSeasons(context.db, context.farm, context.clock.now())
    ),

  /**
   * A finished Season opened out by livestock market, trader, breed, buying weight or each Animal: the Season's own sum, line by
   * line, a share only. The Owner's alone.
   */
  breakdown: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ seasonKey: z.string(), by: z.enum(BREAKDOWNS) }))
    .handler(({ context, input }) =>
      seasonBreakdown(context.db, context.farm, input, context.clock.now())
    ),

  /**
   * Every finished Season opened out together by livestock market, trader, breed or buying weight, each line saying how
   * many Seasons it drew from: what has returned best over the years. A share only. The Owner's alone.
   */
  breakdownAcross: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ by: z.enum(ACROSS_BREAKDOWNS) }))
    .handler(({ context, input }) =>
      breakdownAcross(context.db, context.farm, input.by, context.clock.now())
    ),

  /** One dairy Animal's return and her calves', for her own page: the Owner's alone. */
  forAnimal: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ animalId: z.string() }))
    .handler(({ context, input }) =>
      dairyAnimalReturns(
        context.db,
        context.farm,
        input.animalId,
        context.clock.now()
      )
    ),

  /**
   * What a dairy cow bought, or here before the farm kept its books, was taken on at: a price and a note of where it came
   * from, from a day — the day she was registered unless the Owner says. Written again to put it right. One bred here
   * is counted from her birth and needs none. The Owner's alone, each an Audit Event.
   */
  priceCow: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        animalId: z.string(),
        priceMoney: z.number().int().min(0).max(10_000_000),
        asOf: farmDay.optional(),
        note: z.string().trim().min(1).max(300),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const her = await context.db.query.animal.findFirst({
        where: {
          id: input.animalId,
          farmId: context.farm.id,
          ...EVER_ON_THE_DAIRY_SIDE,
        },
        columns: { id: true, source: true, damId: true, createdAt: true },
        with: { entryPrice: true },
      });
      if (!her) {
        throw new ORPCError("NOT_FOUND", { message: "No such dairy animal" });
      }
      if (bredHere(her)) {
        throw new ORPCError("BAD_REQUEST", {
          message: "One bred here is counted from her birth, at nothing",
          data: { refusal: "bred_here_needs_no_price" },
        });
      }
      const asOf = input.asOf ?? farmDayOf(her.createdAt);
      const price = {
        priceMoney: input.priceMoney,
        asOf,
        note: input.note,
        setBy: context.actor.id,
        setAt: now,
      };
      await audited(context).write(
        {
          entity: "dairy_entry_price",
          entityId: her.id,
          action: her.entryPrice ? "update" : "create",
          before: her.entryPrice
            ? {
                priceMoney: her.entryPrice.priceMoney,
                asOf: her.entryPrice.asOf,
                note: her.entryPrice.note,
              }
            : undefined,
          after: { priceMoney: input.priceMoney, asOf, note: input.note },
        },
        (tx) =>
          tx
            .insert(dairyEntryPrice)
            .values({
              id: uuidv7(now),
              farmId: context.farm.id,
              animalId: her.id,
              ...price,
            })
            .onConflictDoUpdate({
              target: dairyEntryPrice.animalId,
              set: price,
            })
      );
      return { asOf };
    }),

  /**
   * A **Head Price**: the low and the high price a head for one kind of dairy Animal, which one still here counts at.
   * Both above nothing and the low no higher than the high. Written again to put it right. The Owner's alone, each an
   * Audit Event.
   */
  setHeadPrice: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        kind: z.enum(HEAD_PRICE_KINDS),
        lowMoney: z.number().int().max(10_000_000),
        highMoney: z.number().int().max(10_000_000),
      })
    )
    .handler(async ({ context, input }) => {
      const inOrder =
        input.lowMoney > 0 &&
        input.highMoney > 0 &&
        input.lowMoney <= input.highMoney;
      if (!inOrder) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            "A Head Price needs a low above nothing and no higher than its high",
          data: { refusal: "head_price_backwards" },
        });
      }
      const now = context.clock.now();
      const set = await context.db.query.headPrice.findFirst({
        where: { farmId: context.farm.id, kind: input.kind },
      });
      const price = {
        lowMoney: input.lowMoney,
        highMoney: input.highMoney,
        setBy: context.actor.id,
        setAt: now,
      };
      const id = set?.id ?? uuidv7(now);
      await audited(context).write(
        {
          entity: "head_price",
          entityId: id,
          action: set ? "update" : "create",
          before: set
            ? { lowMoney: set.lowMoney, highMoney: set.highMoney }
            : undefined,
          after: { lowMoney: input.lowMoney, highMoney: input.highMoney },
        },
        (tx) =>
          tx
            .insert(headPrice)
            .values({
              id,
              farmId: context.farm.id,
              kind: input.kind,
              ...price,
            })
            .onConflictDoUpdate({
              target: [headPrice.farmId, headPrice.kind],
              set: price,
            })
      );
      return { kind: input.kind };
    }),

  /** One Venture's returns, for the panel on its page: settled or still going; nothing before it has cattle. */
  venture: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ ventureId: z.string() }))
    .handler(({ context, input }) =>
      ventureReturns(
        context.db,
        context.farm,
        input.ventureId,
        context.clock.now()
      )
    ),

  /**
   * A **Bank Rate** the Owner types: a rate a year, with what it is, from a day — today unless said, never a day still
   * to come. Never an edit: a rate put right is typed again from the same day, and the later one holds. The Owner's
   * alone, each an Audit Event.
   */
  setBankRate: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        perYear: z.number().min(0).max(100),
        note: z.string().trim().min(1).max(200),
        fromDay: farmDay.optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const today = farmDayOf(now);
      const fromDay = input.fromDay ?? today;
      if (fromDay > today) {
        throw new ORPCError("BAD_REQUEST", {
          message: "A bank's rate holds from a day that has come",
          data: { refusal: "bank_rate_from_the_future" },
        });
      }
      const id = uuidv7(now);
      const row = {
        id,
        farmId: context.farm.id,
        perYear: input.perYear.toFixed(2),
        note: input.note,
        fromDay,
        recordedBy: context.actor.id,
        recordedAt: now,
      };
      await audited(context).write(
        {
          entity: "bank_rate",
          entityId: id,
          action: "create",
          after: { perYear: input.perYear, note: input.note, fromDay },
        },
        (tx) => tx.insert(bankRate).values(row)
      );
      return { id, fromDay };
    }),

  /**
   * Prices a crossing: her weight on the day she was walked across from Dairy — her latest Weigh-in by that day's end —
   * times a rate a kilo, with where the rate came from. It puts her in her Season at that price; until then she is
   * named and counted nowhere. Priced again, the price is replaced and the trail keeps each. The Owner's alone.
   */
  priceCrossing: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      z.object({
        joiningId: z.string(),
        rateMoneyPerKg: z.number().positive().max(100_000),
        note: z.string().trim().min(1).max(300),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const joining = await context.db.query.fatteningJoining.findFirst({
        where: { id: input.joiningId, farmId: context.farm.id, how: "crossed" },
      });
      if (!joining) {
        throw new ORPCError("NOT_FOUND", { message: "No such crossing" });
      }
      const weighed = await weighedForTheCrossing(
        context.db,
        joining.animalId,
        joining.joinedOn
      );
      if (!weighed) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            "Nobody has weighed her by the day she crossed: weigh her first",
          data: { refusal: "crossing_unweighed" },
        });
      }
      const price = {
        priceMoney: priceAtWeight(weighed.weightKg, input.rateMoneyPerKg),
        weighInId: weighed.id,
        weightKg: weighed.weightKg,
        rateMoneyPerKg: input.rateMoneyPerKg,
        note: input.note,
        pricedBy: context.actor.id,
        pricedAt: now,
      };
      await audited(context).write(
        {
          entity: "fattening_joining",
          entityId: joining.id,
          action: "update",
          before: {
            priceMoney: joining.priceMoney,
            rateMoneyPerKg:
              joining.rateMoneyPerKg === null
                ? null
                : Number(joining.rateMoneyPerKg),
            note: joining.note,
          },
          after: {
            priceMoney: price.priceMoney,
            rateMoneyPerKg: price.rateMoneyPerKg,
            weightKg: price.weightKg,
            note: price.note,
          },
        },
        (tx) => priceTheJoining(tx, joining.id, price)
      );
      return { weightKg: price.weightKg, priceMoney: price.priceMoney };
    }),
};
