import { MANY_AT_ONCE, tagNumberAsWritten } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import {
  campaignsComingRound,
  campaignsOpen,
  herdOnTheFarm,
  owedTheirCampaigns,
  soonestFirst,
} from "../campaign-interval-store";
import type { Recorder } from "../completion-store";
import { correct } from "../corrections/correction";
import {
  doseNotPrescribedCorrection,
  doseNotPrescribedCorrectionInput,
} from "../corrections/dose-not-prescribed";
import {
  mayBeGivenNotPrescribed,
  recordDoseNotPrescribed,
} from "../dose-not-prescribed-store";
import { protectedProcedure } from "../index";
import { penLabel } from "../instances-store";
import type { RefusedOne } from "../one-of-several";
import { eachOnce, refusedOne } from "../one-of-several";
import { takeBackTheExcuse, excuseArrivalDose } from "../put-off-store";
import { requireOnly, requirePersonalSession, requireRole } from "../roles";
import { sopsInForce } from "../sops-in-force";

/** Whether a dose is needed is the Vet's to say. */
const EXCUSED_BY_THE_VET = {
  message: "Only the Vet may say a dose is not needed",
  reason: "vet_only",
} as const;

/** One dose not prescribed, written for one animal and held as any dose holds her: the one way in, alone or with her
 *  Pen. */
const giveOneNotPrescribed = async (
  context: Recorder,
  input: {
    /** The id the screen gave her dose: sent again, the same dose. */
    id?: string;
    tag: string;
    productId: string;
    givenAt?: Date;
    advice: string;
  }
) => {
  const now = context.clock.now();
  let id = input.id ?? "";
  const done = await audited(context).write(
    {
      entity: "treatment",
      entityId: () => id,
      action: "create",
      after: async (tx) =>
        (await tx.query.treatment.findFirst({ where: { id } })) ?? null,
    },
    async (tx) => {
      const made = await recordDoseNotPrescribed(
        tx,
        context.farm.id,
        {
          ...(input.id ? { id: input.id } : {}),
          tagNumber: tagNumberAsWritten(input.tag),
          productId: input.productId,
          givenAt: input.givenAt ?? now,
          advice: input.advice,
          givenBy: context.actor.id,
        },
        now
      );
      ({ id } = made);
      return made;
    }
  );
  return { id: done.id };
};

/** Whether the dose the screen gave this id was written already, on this farm: sent again, it is not written twice. */
const alreadyGiven = async (context: Recorder, id: string) =>
  (await context.db.query.treatment.findFirst({
    where: { id, farmId: context.farm.id },
    columns: { id: true },
  })) !== undefined;

export const treatmentsRouter = {
  /**
   * A dose given without a Prescription — the pharmacy's advice, or anybody's — written by the Owner or the Manager once
   * it was given. It holds her milk and her meat as any dose does: for the product's own days, or else the Vet's Default
   * Withdrawal Days. The Vet is told of it at once, by the sweep.
   */
  giveNotPrescribed: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(
      z.object({
        animalTag: z.string().trim().min(1).max(32),
        productId: z.string(),
        /** When it was given; left out, now. */
        givenAt: z.coerce.date().optional(),
        /** Who advised it and why: "জ্বর, ফার্মেসির পরামর্শে". */
        advice: z.string().trim().min(1).max(300),
      })
    )
    .handler(({ context, input }) =>
      giveOneNotPrescribed(context, { ...input, tag: input.animalTag })
    ),

  /**
   * The same dose given to several at once — the pharmacy's wormer for a Pen of calves. Each animal's dose is her own
   * Treatment, written and held as one given alone, under the id the screen gave it: sent again after an answer that never
   * came, a dose already written is found and counted, never written twice. A medicine that may not be given is refused
   * for the whole request before anybody is dosed; one animal the farm refuses is named, with why, and stops nobody else.
   */
  giveNotPrescribedMany: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(
      z.object({
        animals: z
          .array(
            z.object({
              tagNumber: z.string().trim().min(1).max(32),
              id: z.string().uuid(),
            })
          )
          .min(1)
          .max(MANY_AT_ONCE),
        productId: z.string(),
        givenAt: z.coerce.date().optional(),
        advice: z.string().trim().min(1).max(300),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      // The medicine and the time are the request's, not any one animal's: refused whole, before anybody is dosed.
      await mayBeGivenNotPrescribed(
        context.db,
        context.farm.id,
        { productId: input.productId, givenAt: input.givenAt ?? now },
        now
      );
      const given: string[] = [];
      const refused: RefusedOne[] = [];
      for (const one of eachOnce(input.animals, (each) => each.tagNumber)) {
        const tagNumber = tagNumberAsWritten(one.tagNumber);
        try {
          // oxlint-disable-next-line no-await-in-loop -- each dose its own write, in turn, so one refused stops nobody else
          const written = await alreadyGiven(context, one.id);
          if (!written) {
            // oxlint-disable-next-line no-await-in-loop -- as above
            await giveOneNotPrescribed(context, {
              ...input,
              id: one.id,
              tag: one.tagNumber,
            });
          }
          given.push(tagNumber);
        } catch (error) {
          refused.push(refusedOne(one.tagNumber, error));
        }
      }
      return { given, refused };
    }),

  /** A dose not prescribed voided: the wrong cow, written twice (`doseNotPrescribedCorrection`). */
  correctNotPrescribed: protectedProcedure
    .use(requireRole(...doseNotPrescribedCorrection.roles))
    .use(requirePersonalSession())
    .input(doseNotPrescribedCorrectionInput)
    .handler(async ({ context, input }) => {
      await correct(context, doseNotPrescribedCorrection, input);
      return { id: input.id };
    }),

  /**
   * The Vet's written reason one of a bull's arrival doses is not needed — the card from the farm he came from, say. It
   * is no longer owed, what was raised again for it is called off, and his Release may go ahead. The Vet's alone, from
   * their own account; kept, never removed.
   */
  excuseArrivalDose: protectedProcedure
    .use(requireOnly("vet", EXCUSED_BY_THE_VET))
    .use(requirePersonalSession())
    .input(
      z.object({
        tagNumber: z.string().trim().min(1).max(32),
        definitionId: z.string(),
        reason: z.string().trim().min(3).max(300),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const him = await context.db.query.animal.findFirst({
        where: {
          farmId: context.farm.id,
          tagNumber: tagNumberAsWritten(input.tagNumber),
        },
        columns: { id: true },
      });
      if (!him) {
        throw new ORPCError("NOT_FOUND", { message: "No such animal" });
      }
      const readExcuse = async (tx: Pick<Tx, "query">) =>
        (await tx.query.excusedDose.findFirst({
          where: { animalId: him.id, definitionId: input.definitionId },
        })) ?? null;
      await audited(context).write(
        {
          entity: "excused_dose",
          entityId: `${him.id}:${input.definitionId}`,
          action: "create",
          reason: input.reason,
          after: readExcuse,
        },
        (tx) =>
          excuseArrivalDose(tx, {
            farmId: context.farm.id,
            animalId: him.id,
            definitionId: input.definitionId,
            reason: input.reason,
            vetId: context.actor.id,
            now,
            trail: audited(context).recordEvent,
          })
      );
      return { tagNumber: tagNumberAsWritten(input.tagNumber) };
    }),

  /** The Vet's excuse for an arrival dose taken back, with a reason (`takeBackTheExcuse`). The Vet's alone. */
  takeBackExcuse: protectedProcedure
    .use(requireOnly("vet", EXCUSED_BY_THE_VET))
    .use(requirePersonalSession())
    .input(
      z.object({
        tagNumber: z.string().trim().min(1).max(32),
        definitionId: z.string(),
        reason: z.string().trim().min(3).max(300),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const him = await context.db.query.animal.findFirst({
        where: {
          farmId: context.farm.id,
          tagNumber: tagNumberAsWritten(input.tagNumber),
        },
        columns: { id: true },
      });
      if (!him) {
        throw new ORPCError("NOT_FOUND", { message: "No such animal" });
      }
      await audited(context).write(
        {
          entity: "excused_dose",
          entityId: `${him.id}:${input.definitionId}`,
          action: "correct",
          reason: input.reason,
          after: () => Promise.resolve(null),
        },
        (tx) =>
          takeBackTheExcuse(tx, {
            farmId: context.farm.id,
            animalId: him.id,
            definitionId: input.definitionId,
            now,
          })
      );
      return { tagNumber: tagNumberAsWritten(input.tagNumber) };
    }),

  /**
   * Who is **Due for a Campaign**: for each Campaign that comes round, every animal whose next dose by its interval has
   * come, or comes within the fortnight, with her last dose and her day — soonest first. The Vet's to see, and the
   * farm's who raise the Campaign.
   */
  campaignsDue: protectedProcedure
    .use(requireRole("owner", "manager", "vet"))
    .handler(async ({ context }) => {
      const now = context.clock.now();
      const campaigns = campaignsComingRound(
        await sopsInForce(context.db, context.farm.id)
      );
      const herd = await herdOnTheFarm(context.db, context.farm.id);
      const [owed, open, pens, products] = await Promise.all([
        owedTheirCampaigns(context.db, context.farm.id, campaigns, herd, now),
        campaignsOpen(
          context.db,
          context.farm.id,
          campaigns.map((one) => one.definitionId)
        ),
        context.db.query.pen.findMany({
          where: { farmId: context.farm.id },
          columns: { id: true, name: true },
          with: { shed: { columns: { name: true } } },
        }),
        campaigns.length === 0
          ? []
          : context.db.query.drugProduct.findMany({
              where: {
                farmId: context.farm.id,
                id: { in: campaigns.map((one) => one.productId) },
              },
              columns: { id: true, nameBn: true, nameEn: true },
            }),
      ]);
      const penNamed = new Map(pens.map((pen) => [pen.id, penLabel(pen)]));
      const productNamed = new Map(products.map((one) => [one.id, one]));
      return campaigns.map((campaign) => ({
        definitionId: campaign.definitionId,
        name: campaign.content.name,
        months: campaign.months,
        product: {
          nameBn: productNamed.get(campaign.productId)?.nameBn ?? null,
          nameEn: productNamed.get(campaign.productId)?.nameEn ?? null,
        },
        animals: soonestFirst(owed.get(campaign.definitionId) ?? []).map(
          (beast) => ({
            ...beast,
            penLabel: penNamed.get(beast.penId) ?? null,
            // Her Pen's Campaign already stands open: raised, waiting to be walked, not to be raised again.
            raisedOpen: open.has(`${campaign.definitionId}:${beast.penId}`),
          })
        ),
      }));
    }),
};
