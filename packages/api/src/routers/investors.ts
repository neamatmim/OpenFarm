import { uuidv7 } from "@OpenFarm/db/ids";
import { farm } from "@OpenFarm/db/schema/farm";
import { investor } from "@OpenFarm/db/schema/venture";
import { farmDayOf } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import type { FarmList } from "../farm-list";
import { bringBackToList, retireFromList } from "../farm-list";
import { protectedProcedure } from "../index";
import {
  countedInvestors,
  readInvestor,
  theSamePerson,
} from "../investor-store";
import {
  consentSheet,
  consentsInForce,
  recordConsent,
} from "../portal-consent";
import {
  inviteToPortal,
  portalActivity,
  portalStandings,
  takePortalAway,
} from "../portal-store";
import { closeRequests, theirRequests } from "../requests-to-join";
import { OWNER_ONLY, requireOnly, requirePersonalSession } from "../roles";
import { theirAgreements } from "../their-agreements";
import { lockTheFarm } from "../venture-store";
import { CODE_PAPERS, codePaperFor, handOver } from "../welcome-letter";

const personInput = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(1).max(20),
  address: z.string().trim().max(200).optional(),
  /** The number on their National ID, as the agreement asks for it. */
  nid: z.string().trim().max(40).optional(),
  /** Bank channels only, so the account is how they are paid. Written out as the bank would want it — the
   *  name on the account, its number, the bank and the branch — often on a line each. */
  bankAccount: z.string().trim().max(300).optional(),
  nominee: z
    .object({
      name: z.string().trim().min(1).max(120),
      phone: z.string().trim().max(20).optional(),
      relation: z.string().trim().max(60).optional(),
    })
    .optional(),
});

const updateInput = personInput.extend({ id: z.string().min(1) });

/** Somebody the farm has written down already, said by what the Owner can do about it: a retired person is
 *  brought back rather than written down twice. */
const alreadyHere = (retired: boolean) =>
  retired
    ? new ORPCError("BAD_REQUEST", {
        message:
          "This person is already an Investor here, retired; bring them back rather than writing them down twice",
        data: { refusal: "investor_retired" },
      })
    : new ORPCError("BAD_REQUEST", {
        message: "This person is already an Investor here",
        data: { refusal: "investor_exists" },
      });

/** Everything written down about one person, as a correction replaces it: a field left out is a field
 *  cleared, since the form sends the whole record as it now stands. */
const theRecord = (input: z.infer<typeof personInput>) => ({
  name: input.name,
  phone: input.phone,
  address: input.address ?? null,
  nid: input.nid ?? null,
  bankAccount: input.bankAccount ?? null,
  nomineeName: input.nominee?.name ?? null,
  nomineePhone: input.nominee?.phone ?? null,
  nomineeRelation: input.nominee?.relation ?? null,
});

/** The farm's Investors, as the one way a list is kept keeps it: retired, never removed, because everything they
 *  signed and were paid is kept for twelve years and names them. The same person is found by name and phone, not by
 *  name alone, so they keep their own check (`theSamePerson`). */
const INVESTORS = {
  entity: "investor",
  table: investor,
  read: readInvestor,
  notFound: "No such Investor",
} satisfies FarmList;

/** A change to one Investor, audited with how they stood either side of it. */
const changeInvestor = async (
  context: Parameters<typeof audited>[0] & { farm: { id: string } },
  id: string,
  apply: (tx: Tx) => Promise<{ id: string }[]>
): Promise<void> => {
  await audited(context).write(
    {
      entity: "investor",
      entityId: id,
      action: "update",
      before: (tx) => readInvestor(tx, context.farm.id, id),
      after: (tx) => readInvestor(tx, context.farm.id, id),
    },
    async (tx) => {
      const [changed] = await apply(tx);
      if (!changed) {
        throw new ORPCError("NOT_FOUND", {
          message:
            "No such Investor, or they are already as you are asking for",
        });
      }
    }
  );
};

export const investorsRouter = {
  /**
   * The people whose money is in the farm's Ventures, with how many Units each holds across the Ventures
   * still running, and whether the farm is nearing the cap it may not go past.
   *
   * The Owner's alone: who trusted her with money, and how much, is not the Manager's business.
   */
  list: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .handler(async ({ context }) => {
      const rows = await context.db.query.investor.findMany({
        where: { farmId: context.farm.id },
        orderBy: { name: "asc", id: "asc" },
      });
      const [counted, signed, ventures, portal, consents] = await Promise.all([
        countedInvestors(context.db, context.farm.id),
        context.db.query.investmentAgreement.findMany({
          where: { farmId: context.farm.id },
          columns: { investorId: true, ventureId: true, units: true },
          orderBy: { createdAt: "desc", id: "desc" },
        }),
        context.db.query.venture.findMany({
          where: { farmId: context.farm.id },
          columns: { id: true, name: true, state: true },
        }),
        portalStandings(context.db, context.farm.id, context.clock.now()),
        consentsInForce(context.db, context.farm.id),
      ]);
      // Every Venture each person signed into, the latest first, running or long settled — so their
      // record leads to each run their money went to.
      const ventureOf = new Map(ventures.map((one) => [one.id, one]));
      const theirs = new Map<
        string,
        {
          id: string;
          name: string;
          state: (typeof ventures)[number]["state"];
          units: number;
        }[]
      >();
      for (const one of signed) {
        const run = ventureOf.get(one.ventureId);
        if (run) {
          const list = theirs.get(one.investorId) ?? [];
          list.push({
            id: run.id,
            name: run.name,
            state: run.state,
            units: one.units,
          });
          theirs.set(one.investorId, list);
        }
      }
      return {
        /** How many people are in, and how many the farm may have. Said once, beside the list rather
         *  than on it, so a farm with nobody in it still knows where it stands. */
        standing: counted.standing,
        cap: context.farm.investorCap,
        nearingTheCap: counted.standing >= context.farm.investorWarnAt,
        /** Whether invited Investors may sign in to the portal (ADR 0007). */
        portalOpen: context.farm.investorPortal,
        people: rows.map((one) => ({
          id: one.id,
          name: one.name,
          phone: one.phone,
          address: one.address,
          nid: one.nid,
          bankAccount: one.bankAccount,
          nominee: one.nomineeName
            ? {
                name: one.nomineeName,
                phone: one.nomineePhone,
                relation: one.nomineeRelation,
              }
            : null,
          /** The Units this person holds across the Ventures still running. */
          unitsHeld: counted.unitsOf.get(one.id) ?? 0,
          /** The Ventures they signed into, the latest first, with the Units of each Agreement. */
          ventures: theirs.get(one.id) ?? [],
          /** When they were retired, or nothing while the farm may still sign them. */
          retiredAt: one.retiredAt,
          /** Where they stand with the portal: never invited, invited, their code run out, in, or taken away. */
          portal: portal.get(one.id)?.standing ?? "none",
          /** Until when their open code can be taken up; null where none is open. */
          portalCodeUntil: portal.get(one.id)?.codeUntil ?? null,
          /** When they were last in the portal, to the hour; null for somebody never seen there. */
          portalLastSeenAt: portal.get(one.id)?.lastSeenAt ?? null,
          /** Their Portal Consent in force — the day signed and the Version — or null before they sign one. */
          portalConsent: consents.get(one.id) ?? null,
        })),
      };
    }),

  /**
   * One Investor's Agreements and money, for their own page: each paper they signed with its Venture, the terms in
   * force today, the stamp, the capital the Farm holds on it and what a Settlement owes on it — and every taka of
   * theirs that moved. Nobody else's. The Owner's alone, as the list is.
   */
  agreements: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const who = await context.db.query.investor.findFirst({
        where: { id: input.id, farmId: context.farm.id },
        columns: { id: true },
      });
      if (!who) {
        throw new ORPCError("NOT_FOUND", { message: "No such Investor" });
      }
      return theirAgreements(
        context.db,
        context.farm.id,
        input.id,
        farmDayOf(context.clock.now())
      );
    }),

  /**
   * What an Investor has done in the portal: when they came in, when they were last in, where they are signed in
   * now, the papers they read and what they did to their Requests. Null for somebody who never took an invitation up.
   * The Owner's alone.
   */
  portalActivity: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string() }))
    .handler(({ context, input }) =>
      portalActivity(context.db, context.farm.id, input.id, context.clock.now())
    ),

  /**
   * One Investor's Requests to Join across every Venture, the newest first, each with where it stands, the Owner's
   * answer and why it closed if it did: their whole conversation with the farm in one place. The Owner's alone.
   */
  requests: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string() }))
    .handler(({ context, input }) =>
      theirRequests(context.db, context.farm.id, input.id)
    ),

  /**
   * One person recorded once, and reused for every Venture they join: name, phone, address, NID, the bank
   * account they are paid into, and a nominee for their family's sake.
   */
  record: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(personInput)
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const already = await theSamePerson(context.db, context.farm.id, {
        name: input.name,
        phone: input.phone,
      });
      if (already) {
        throw alreadyHere(already.retiredAt !== null);
      }
      const id = uuidv7(now);
      await audited(context).write(
        {
          entity: "investor",
          entityId: id,
          action: "create",
          after: (tx) => readInvestor(tx, context.farm.id, id),
        },
        (tx) =>
          tx.insert(investor).values({
            id,
            farmId: context.farm.id,
            name: input.name,
            phone: input.phone,
            address: input.address,
            nid: input.nid,
            bankAccount: input.bankAccount,
            nomineeName: input.nominee?.name,
            nomineePhone: input.nominee?.phone,
            nomineeRelation: input.nominee?.relation,
            recordedBy: context.actor.id,
            createdAt: now,
          })
      );
      return { id };
    }),

  /**
   * What was written down about somebody, put right — a phone changed, a bank account moved, a nominee who
   * has died replaced. The whole record as it now stands replaces the old one, and the trail keeps what it
   * said before: a payout sent to an account that was typed over has to be traceable to who typed it.
   */
  update: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(updateInput)
    .handler(async ({ context, input }) => {
      const already = await theSamePerson(context.db, context.farm.id, {
        name: input.name,
        phone: input.phone,
      });
      if (already && already.id !== input.id) {
        throw alreadyHere(already.retiredAt !== null);
      }
      await changeInvestor(context, input.id, (tx) =>
        tx
          .update(investor)
          .set(theRecord(input))
          .where(
            and(eq(investor.id, input.id), eq(investor.farmId, context.farm.id))
          )
          .returning({ id: investor.id })
      );
      return { id: input.id };
    }),

  /**
   * Somebody done with the farm, taken out of the people it may sign — retired, never removed, because
   * everything they signed and were paid is kept for twelve years and names them. Not while their money is
   * in a Venture still running: they are still in it, and the farm still owes them its end.
   */
  retire: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      await retireFromList(context, INVESTORS, input.id, {
        refuseWhile: async (tx) => {
          // Counted behind the same lock a signature takes, so nobody is signed between the count and the
          // retiring.
          await lockTheFarm(tx, context.farm.id);
          const counted = await countedInvestors(tx, context.farm.id);
          if (counted.unitsOf.has(input.id)) {
            throw new ORPCError("BAD_REQUEST", {
              message:
                "Their money is in a Venture still running; they are retired once it settles or is called off",
              data: { refusal: "investor_still_in" },
            });
          }
        },
        // A retired Investor is not signed for another Venture, so nothing they asked for is waiting any more.
        alsoWrite: async (tx) => {
          await closeRequests(
            tx,
            audited(context).recordEvent,
            context.farm.id,
            { investorId: input.id },
            "investor_retired",
            context.clock.now()
          );
        },
      });
      return { id: input.id };
    }),

  /** A retired Investor coming back for another Venture. The Owner's, like retiring them. */
  bringBack: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      await bringBackToList(context, INVESTORS, input.id);
      return { id: input.id };
    }),

  /**
   * Opens or closes the Investor portal for the whole farm (ADR 0007). Closed, no Investor signs in and no invitation
   * is taken up, and nothing about anybody's access is lost: it is how the farm answers a lawyer who says the portal
   * is a platform. The Owner's alone.
   */
  setPortalOpen: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ open: z.boolean() }))
    .handler(async ({ context, input }) => {
      await audited(context).write(
        {
          entity: "farm",
          entityId: context.farm.id,
          action: "update",
          before: { investorPortal: context.farm.investorPortal },
          after: { investorPortal: input.open },
        },
        (tx) =>
          tx
            .update(farm)
            .set({ investorPortal: input.open })
            .where(eq(farm.id, context.farm.id))
      );
      return { open: input.open };
    }),

  /**
   * The Portal Consent sheet for one Investor, to print and have them sign in front of the Owner before any code: the
   * wording in force with their name in it, its Version in the foot. The Owner's alone.
   */
  consentSheet: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => ({
      document: await consentSheet(context, input.id),
    })),

  /**
   * Records that the Investor signed the Portal Consent today, in front of the Owner, on the wording in force — the
   * step before any code. The Owner's alone.
   */
  recordConsent: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string() }))
    .handler(({ context, input }) => recordConsent(context, input.id)),

  /**
   * Invites one Investor to the portal, or gives them a new code: shown once, to hand over in person, good for a week.
   * They take it up with their phone and a password of their own — once they have signed the Portal Consent. Says
   * which paper it goes out with (`codePaperFor`).
   */
  inviteToPortal: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const given = await inviteToPortal(context, input.id);
      return {
        ...given,
        paper: await codePaperFor(context.db, context.farm.id, input.id),
      };
    }),

  /**
   * Lays out the Welcome Letter or the Code Slip for the code on the Owner's screen, and records it as an Export: all
   * of it but the code, which never leaves their screen. The Owner's alone.
   */
  handOver: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string().min(1), paper: z.enum(CODE_PAPERS) }))
    .handler(({ context, input }) => handOver(context, input.id, input.paper)),

  /** Takes an Investor's portal access away: their account is disabled and signed out everywhere. */
  takePortalAway: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      await takePortalAway(context, input.id);
      return { id: input.id };
    }),
};
