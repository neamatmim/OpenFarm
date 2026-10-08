import { portalOrigin } from "@OpenFarm/auth/hosts";
import { uuidv7 } from "@OpenFarm/db/ids";
import { farm } from "@OpenFarm/db/schema/farm";
import type {
  InvestorKind,
  PORTAL_TAKEN_AWAY_WHY,
} from "@OpenFarm/db/schema/venture";
import { investor } from "@OpenFarm/db/schema/venture";
import { farmDayOf } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { dataCopyOf } from "../data-copy";
import { farmDay } from "../farm-clock";
import type { FarmList } from "../farm-list";
import { bringBackToList, retireFromList } from "../farm-list";
import { protectedProcedure } from "../index";
import { emailChanged, forgetEmailCode } from "../investor-email";
import {
  countedInvestors,
  organizationOf,
  readInvestor,
  theSamePerson,
} from "../investor-store";
import type { NominationOnFile } from "../nomination-store";
import {
  nominationsInForceFor,
  nominationsOf,
  paperNominees,
} from "../nomination-store";
import {
  nominationToSign,
  nomineesInput,
  keepNominationPaper,
  nominationPhoto,
  recordNomination,
} from "../nominations";
import { assertPasswordGiven, requirePasswordGiven } from "../password-again";
import { closePayInNotes } from "../pay-in-notes";
import { photoInput } from "../photo-input";
import type { ConsentWithdrawnSaid } from "../portal-consent";
import {
  consentSheet,
  consentsInForce,
  lastConsentsWithdrawn,
  recordConsent,
} from "../portal-consent";
import {
  inviteToPortal,
  portalActivity,
  portalStandings,
  signatoryLeaves,
  takePortalAway,
  takenAwayWhy,
} from "../portal-store";
import { closeRequests, theirRequests } from "../requests-to-join";
import { OWNER_ONLY, requireOnly, requirePersonalSession } from "../roles";
import { theirAgreements } from "../their-agreements";
import { lockTheFarm } from "../venture-store";
import { CODE_PAPERS, codePaperFor, handOver } from "../welcome-letter";

/** Why an Investor's access was taken away, as their record says it: the reason, and for a withdrawn consent the day
 *  they asked and how. */
const takenAwaySaid = (
  why: (typeof PORTAL_TAKEN_AWAY_WHY)[number] | null,
  withdrawn: ConsentWithdrawnSaid | null
) => {
  if (!why) {
    return null;
  }
  const said =
    why === "withdrew_consent" && withdrawn
      ? withdrawn
      : { withdrawnOn: null, withdrawnHow: null };
  return { why, ...said };
};

/** An email as the Owner types it: kept lowercased, so the same address is never two. */
const emailInput = z.string().trim().toLowerCase().max(254).pipe(z.email());

const personInput = z.object({
  /** Left out by every caller written before an Investor could be an Organization: a person. */
  kind: z.literal("person").optional(),
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(1).max(20),
  address: z.string().trim().max(200).optional(),
  /** The number on their National ID, as the agreement asks for it. */
  nid: z.string().trim().max(40).optional(),
  /** Bank channels only, so the account is how they are paid. Written out as the bank would want it — the
   *  name on the account, its number, the bank and the branch — often on a line each. */
  bankAccount: z.string().trim().max(300).optional(),
  /** Their own email, optional: the farm sends a signing code there beside the phone once they confirm it (ADR 0022). */
  email: emailInput.optional(),
});

/** An Organization (ADR 0020): its own name, address, papers and bank account, and the one Signatory it acts through,
 *  whose mobile is the record's phone. */
const organizationInput = z.object({
  kind: z.literal("organization"),
  name: z.string().trim().min(1).max(120),
  /** The Signatory's mobile: the farm reaches the Organization on it, and the Signatory signs in to the portal with it. */
  phone: z.string().trim().min(1).max(20),
  address: z.string().trim().max(200).optional(),
  bankAccount: z.string().trim().max(300).optional(),
  tradeLicense: z.string().trim().max(40).optional(),
  rjscNumber: z.string().trim().max(40).optional(),
  tin: z.string().trim().max(40).optional(),
  /** The paper that names the Signatory — a board resolution, a letter — as the Owner describes it, and its date. */
  authority: z.string().trim().min(1).max(200),
  authorityOn: z.iso.date().optional(),
  signatoryName: z.string().trim().min(1).max(120),
  signatoryNid: z.string().trim().max(40).optional(),
  signatoryRole: z.string().trim().max(80).optional(),
  /** The Signatory's own email, optional, as a person's is. */
  email: emailInput.optional(),
});

/** A person or an Organization, as the Owner writes them down. */
const investorInput = z.union([organizationInput, personInput]);

const updateInput = z.union([
  organizationInput.extend({ id: z.string().min(1) }),
  personInput.extend({ id: z.string().min(1) }),
]);

/** Somebody the farm has written down already, said by what the Owner can do about it: a retired Investor is
 *  brought back rather than written down twice. */
const alreadyHere = (retired: boolean) =>
  retired
    ? new ORPCError("BAD_REQUEST", {
        message:
          "This Investor is already written down here, retired; restore them rather than writing them down twice",
        data: { refusal: "investor_retired" },
      })
    : new ORPCError("BAD_REQUEST", {
        message: "This Investor is already written down here",
        data: { refusal: "investor_exists" },
      });

/** A Nomination as a screen shows it: how it came, the day, each Nominee marked a minor or not on `today`, and
 *  whether it has its photo. */
const nominationSaid = (nomination: NominationOnFile | null, today: string) =>
  nomination
    ? {
        id: nomination.id,
        how: nomination.how,
        signedOn: nomination.signedOn,
        agreementId: nomination.agreementId,
        ventureName: nomination.ventureName,
        hasPhoto: nomination.hasPhoto,
        nominees: paperNominees(nomination, today),
      }
    : null;

/** Everything written down about one Investor, as a correction replaces it: a field left out is a field cleared, since
 *  the form sends the whole record as it now stands. The other kind's columns are always empty. */
const theRecord = (input: z.infer<typeof investorInput>) =>
  input.kind === "organization"
    ? {
        kind: input.kind,
        name: input.name,
        phone: input.phone,
        email: input.email ?? null,
        address: input.address ?? null,
        nid: null,
        bankAccount: input.bankAccount ?? null,
        tradeLicense: input.tradeLicense ?? null,
        rjscNumber: input.rjscNumber ?? null,
        tin: input.tin ?? null,
        authority: input.authority,
        authorityOn: input.authorityOn ?? null,
        signatoryName: input.signatoryName,
        signatoryNid: input.signatoryNid ?? null,
        signatoryRole: input.signatoryRole ?? null,
      }
    : {
        kind: "person" as const,
        name: input.name,
        phone: input.phone,
        email: input.email ?? null,
        address: input.address ?? null,
        nid: input.nid ?? null,
        bankAccount: input.bankAccount ?? null,
        tradeLicense: null,
        rjscNumber: null,
        tin: null,
        authority: null,
        authorityOn: null,
        signatoryName: null,
        signatoryNid: null,
        signatoryRole: null,
      };

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

/**
 * Refuses the Farm's own partner record as nobody: it holds the Farm's own capital in a Venture, is on no list of
 * people, and is renamed, retired or brought back by nobody — it lives as long as the farm does.
 */
const assertAPerson = async (
  context: { db: { query: Tx["query"] }; farm: { id: string } },
  id: string
) => {
  const theFarm = await context.db.query.investor.findFirst({
    where: { id, farmId: context.farm.id, isFarm: true },
    columns: { id: true },
  });
  if (theFarm) {
    throw new ORPCError("NOT_FOUND", { message: "No such Investor" });
  }
};

/** Refuses turning a person into an Organization or back: what they signed is worded for the one they were (ADR 0020).
 *  One written down as the wrong kind is retired and written down again. */
const assertTheSameKind = async (
  context: { db: { query: Tx["query"] }; farm: { id: string } },
  id: string,
  kind: InvestorKind
) => {
  const row = await context.db.query.investor.findFirst({
    where: { id, farmId: context.farm.id },
    columns: { kind: true },
  });
  if (row && row.kind !== kind) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "A person stays a person and an Organization an Organization; retire this one and write them down again",
      data: { refusal: "investor_kind_fixed" },
    });
  }
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
      // People only: the Farm's own partner record, for its own capital in a Venture, is no Investor to list.
      const rows = await context.db.query.investor.findMany({
        where: { farmId: context.farm.id, isFarm: false },
        orderBy: { name: "asc", id: "asc" },
      });
      const [
        counted,
        signed,
        ventures,
        portal,
        consents,
        withdrawals,
        nominations,
      ] = await Promise.all([
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
        lastConsentsWithdrawn(context.db, context.farm.id),
        nominationsInForceFor(
          context.db,
          context.farm.id,
          rows.map((one) => one.id)
        ),
      ]);
      const today = farmDayOf(context.clock.now());
      const theFarm = await context.db.query.investor.findFirst({
        where: { farmId: context.farm.id, isFarm: true },
        columns: { id: true },
      });
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
        /** Whether invited Investors are shown each Venture's Projection (ADR 0010). */
        projectionsShown: context.farm.investorProjections,
        /** Whether Agreements and Amendments may be agreed within the app. */
        agreementsInApp: context.farm.agreementsInApp,
        /** The ways the farm can send a Signing Code at all: a text gateway, an email sender (ADR 0022). */
        codesBy: { sms: context.sms.sends, email: context.email.sends },
        /** Whether an Investor may send a Pay-in Note from the portal (ADR 0018). */
        payInNotes: context.farm.payInNotes,
        /** Whether invited Investors are shown a settled Venture's Return on Capital (ADR 0012). */
        returnsShown: context.farm.investorReturns,
        /** The Farm's own partner record, which holds its own capital in a Venture and is in no list of people: so a
         *  screen naming whose money a movement was names the Farm, not an id. Nothing until it has taken Units. */
        farmPartnerId: theFarm?.id ?? null,
        people: rows.map((one) => ({
          id: one.id,
          kind: one.kind,
          name: one.name,
          phone: one.phone,
          /** Their email (an Organization's Signatory's), and when they confirmed it in the portal; null for none and
           *  for one not confirmed yet. */
          email: one.email,
          emailConfirmedAt: one.emailConfirmedAt,
          /** The ways a Signing Code would reach them now: by text through the farm's gateway, and by email to one
           *  they confirmed through its sender. */
          codesBy: {
            sms: context.sms.sends,
            email:
              context.email.sends &&
              one.email !== null &&
              one.emailConfirmedAt !== null,
          },
          address: one.address,
          nid: one.nid,
          bankAccount: one.bankAccount,
          /** An Organization's own papers, authority and Signatory; null for a person. */
          organization: organizationOf(one),
          /** Their Nominees in force — how the list came, the day, and each Nominee marked a minor or not today — or
           *  null for somebody who has never had one on file. */
          nomination: nominationSaid(nominations.get(one.id) ?? null, today),
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
          /** Why their access was taken away, and for a withdrawn consent the day they asked and how; null while it
           *  stands, or where it was taken away before the farm asked why. */
          portalTakenAway: takenAwaySaid(
            portal.get(one.id)?.takenAwayWhy ?? null,
            withdrawals.get(one.id) ?? null
          ),
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
        // The Farm's own Units are on their Ventures, not on an Investor's record.
        where: { id: input.id, farmId: context.farm.id, isFarm: false },
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
   * Every Nomination one Investor has on file, newest first, so the first is the list in force: how each came, the
   * day it was signed, and its Nominees, each marked a minor or not on that day. The history of who was named, and
   * when, is the farm's answer to a family. The Owner's alone.
   */
  nominations: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const all = await nominationsOf(context.db, context.farm.id, input.id);
      return all.map((one) => ({
        id: one.id,
        how: one.how,
        signedOn: one.signedOn,
        agreementId: one.agreementId,
        ventureName: one.ventureName,
        hasPhoto: one.hasPhoto,
        recordedAt: one.recordedAt,
        nominees: paperNominees(one, one.signedOn),
      }));
    }),

  /**
   * The মনোনয়নপত্র for one Investor and the Nominees the Owner has written down, laid out to print and have signed in
   * front of them today. Refused for Nominees no paper may name, and for a retired Investor. An Export on the Investor.
   */
  nominationToSign: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string(), nominees: nomineesInput }))
    .handler(({ context, input }) =>
      nominationToSign(context, input.id, input.nominees)
    ),

  /**
   * Records a মনোনয়নপত্র signed in front of the Owner, with its day and — when the Owner has one to hand — a photo of
   * it: from then on the list in force for all the Investor's Agreements. The Owner's alone, from their own phone.
   */
  recordNomination: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      photoInput.partial().extend({
        id: z.string(),
        nominees: nomineesInput,
        signedOn: farmDay,
      })
    )
    .handler(({ context, input }) =>
      recordNomination(context, {
        investorId: input.id,
        nominees: input.nominees,
        signedOn: input.signedOn,
        photo:
          input.contentType && input.data
            ? { contentType: input.contentType, data: input.data }
            : null,
      })
    ),

  /**
   * The photo of a signed মনোনয়নপত্র as the farm kept it, to look at, save or replace; nothing before one is kept. The
   * Owner's alone, as keeping it is.
   */
  nominationPhoto: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ nominationId: z.string() }))
    .handler(({ context, input }) =>
      nominationPhoto(context, input.nominationId)
    ),

  /**
   * Keeps the photo of a মনোনয়নপত্র recorded without one, or puts a better one in its place. The Owner's alone, from
   * their own phone.
   */
  keepNominationPaper: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(photoInput.extend({ nominationId: z.string() }))
    .handler(({ context, input }) =>
      keepNominationPaper(context, {
        nominationId: input.nominationId,
        photo: { contentType: input.contentType, data: input.data },
      })
    ),

  /**
   * One Investor recorded once, and reused for every Venture they join. A person: name, phone, address, NID and the
   * bank account they are paid into; their Nominees are not written here, since only a paper they sign names them. An
   * Organization: its own name, address, papers and bank account, its authority, and its Signatory (ADR 0020).
   */
  record: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(investorInput)
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
            ...theRecord(input),
            recordedBy: context.actor.id,
            createdAt: now,
          })
      );
      return { id };
    }),

  /**
   * What was written down about somebody, put right — a phone changed, a bank account moved, a Signatory's NID typed
   * again. Never their Nominees, which only a paper they sign changes, and never whether they are a person or an
   * Organization: their papers are worded for the one they signed as. The whole record as it now stands replaces the
   * old one, and the trail keeps what it said before: a payout sent to an account that was typed over has to be
   * traceable to who typed it.
   */
  update: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(updateInput)
    .handler(async ({ context, input }) => {
      await assertAPerson(context, input.id);
      await assertTheSameKind(context, input.id, input.kind ?? "person");
      const already = await theSamePerson(context.db, context.farm.id, {
        name: input.name,
        phone: input.phone,
      });
      if (already && already.id !== input.id) {
        throw alreadyHere(already.retiredAt !== null);
      }
      const record = theRecord(input);
      await changeInvestor(context, input.id, async (tx) =>
        tx
          .update(investor)
          .set({
            ...record,
            // A new address is theirs to confirm again; the same one stays as it was.
            ...(await emailChanged(
              tx,
              context.farm.id,
              input.id,
              record.email
            )),
          })
          .where(
            and(eq(investor.id, input.id), eq(investor.farmId, context.farm.id))
          )
          .returning({ id: investor.id })
      );
      return { id: input.id };
    }),

  /**
   * An Organization's Signatory changed for another person (ADR 0020): who they are, their mobile — the record's phone
   * from now — and the paper that names them. Not putting the record right, which `update` does for the same person:
   * the portal sign-in and the Portal Consent were the old Signatory's, so both end in the same transaction, and the
   * new Signatory signs a consent of their own before they are invited. What the Organization signed before stands. The
   * Owner's alone.
   */
  changeSignatory: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(
      organizationInput
        .pick({
          phone: true,
          authority: true,
          authorityOn: true,
          signatoryName: true,
          signatoryNid: true,
          signatoryRole: true,
          email: true,
        })
        .extend({ id: z.string().min(1) })
    )
    .handler(async ({ context, input }) => {
      await assertAPerson(context, input.id);
      const them = await context.db.query.investor.findFirst({
        where: { id: input.id, farmId: context.farm.id },
        columns: { kind: true, name: true, retiredAt: true },
      });
      if (!them) {
        throw new ORPCError("NOT_FOUND", { message: "No such Investor" });
      }
      if (them.kind !== "organization") {
        throw new ORPCError("BAD_REQUEST", {
          message: "Only an Organization has a Signatory to change",
          data: { refusal: "investor_is_a_person" },
        });
      }
      if (them.retiredAt) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            "This Investor is retired; restore them before changing their Signatory",
          data: { refusal: "investor_retired" },
        });
      }
      const already = await theSamePerson(context.db, context.farm.id, {
        name: them.name,
        phone: input.phone,
      });
      if (already && already.id !== input.id) {
        throw alreadyHere(already.retiredAt !== null);
      }
      await changeInvestor(context, input.id, async (tx) => {
        const changed = await tx
          .update(investor)
          .set({
            phone: input.phone,
            authority: input.authority,
            authorityOn: input.authorityOn ?? null,
            signatoryName: input.signatoryName,
            signatoryNid: input.signatoryNid ?? null,
            signatoryRole: input.signatoryRole ?? null,
            // The new Signatory's own, which they confirm for themselves.
            email: input.email ?? null,
            emailConfirmedAt: null,
          })
          .where(
            and(eq(investor.id, input.id), eq(investor.farmId, context.farm.id))
          )
          .returning({ id: investor.id });
        await forgetEmailCode(tx, input.id);
        await signatoryLeaves(tx, context, input.id);
        return changed;
      });
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
      await assertAPerson(context, input.id);
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
          await closePayInNotes(
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
  restore: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      await assertAPerson(context, input.id);
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
      // Opening asks for the password again; shutting never waits for it.
      if (input.open) {
        await assertPasswordGiven(context);
      }
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
   * Lets an Investment Agreement or an Amendment be agreed within the app — offered by the Owner, agreed by the Investor
   * in the portal with a Signing Code, approved by the Owner — or stops it. Off until the Owner turns it on, accepting
   * that such an Agreement carries no stamp (ADR 0022). Turned off, an offer already agreed may still be approved. The
   * Owner's alone.
   */
  setAgreementsInApp: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ shown: z.boolean() }))
    .handler(async ({ context, input }) => {
      await audited(context).write(
        {
          entity: "farm",
          entityId: context.farm.id,
          action: "update",
          before: { agreementsInApp: context.farm.agreementsInApp },
          after: { agreementsInApp: input.shown },
        },
        (tx) =>
          tx
            .update(farm)
            .set({ agreementsInApp: input.shown })
            .where(eq(farm.id, context.farm.id))
      );
      return { shown: input.shown };
    }),

  /**
   * Lets an Investor send a **Pay-in Note** from the portal — their word that they sent money towards one of their
   * Agreements, for the Owner to check against the Venture Account — or stops it (ADR 0018). It moves no money and
   * records no capital. Off until the Owner turns it on, once the lawyer and the Shariah scholar have seen it. The
   * Owner's alone.
   */
  setPayInNotes: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ shown: z.boolean() }))
    .handler(async ({ context, input }) => {
      await audited(context).write(
        {
          entity: "farm",
          entityId: context.farm.id,
          action: "update",
          before: { payInNotes: context.farm.payInNotes },
          after: { payInNotes: input.shown },
        },
        (tx) =>
          tx
            .update(farm)
            .set({ payInNotes: input.shown })
            .where(eq(farm.id, context.farm.id))
      );
      return { shown: input.shown };
    }),

  /**
   * Shows invited Investors each Venture's Projection in the portal, or stops showing it (ADR 0010). Off until the
   * Owner turns it on — once the lawyer and the Shariah scholar have seen what it says — and the Portal Preview shows
   * it to the Owner either way. The Owner's alone.
   */
  setProjectionsShown: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ shown: z.boolean() }))
    .handler(async ({ context, input }) => {
      await audited(context).write(
        {
          entity: "farm",
          entityId: context.farm.id,
          action: "update",
          before: { investorProjections: context.farm.investorProjections },
          after: { investorProjections: input.shown },
        },
        (tx) =>
          tx
            .update(farm)
            .set({ investorProjections: input.shown })
            .where(eq(farm.id, context.farm.id))
      );
      return { shown: input.shown };
    }),

  /**
   * Shows invited Investors a settled Venture's Return on Capital — a share over its days, in the portal and on their
   * হিসাব নিকাশ, never a rate a year — or stops showing it (ADR 0012). Off until the Owner turns it on, once the
   * lawyer and the Shariah scholar have seen its wording; the Portal Preview shows it to the Owner either way. The
   * Owner's alone.
   */
  setReturnsShown: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ shown: z.boolean() }))
    .handler(async ({ context, input }) => {
      await audited(context).write(
        {
          entity: "farm",
          entityId: context.farm.id,
          action: "update",
          before: { investorReturns: context.farm.investorReturns },
          after: { investorReturns: input.shown },
        },
        (tx) =>
          tx
            .update(farm)
            .set({ investorReturns: input.shown })
            .where(eq(farm.id, context.farm.id))
      );
      return { shown: input.shown };
    }),

  /**
   * The Data Copy, «খামারে আপনার তথ্য»: everything the farm holds on one Investor, unmasked, the privacy notice's
   * points first, to answer their written request for a copy (`dataCopyOf`). An Export; the Owner's alone, and never
   * offered in the portal.
   */
  dataCopy: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .use(requirePasswordGiven())
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => ({
      document: await dataCopyOf(context, input.id),
    })),

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
   * which paper it goes out with (`codePaperFor`), and the portal's own address where it has one, for the screen and
   * the paper to send them to (ADR 0009).
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
        portalOrigin: portalOrigin(),
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

  /**
   * Takes an Investor's portal access away, saying why: their account is disabled and signed out everywhere. A withdrawn
   * consent is marked withdrawn with the day they asked and how (`takePortalAway`).
   */
  takePortalAway: protectedProcedure
    .use(requireOnly("owner", OWNER_ONLY))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string().min(1), why: takenAwayWhy }))
    .handler(async ({ context, input }) => {
      await takePortalAway(context, input.id, input.why);
      return { id: input.id };
    }),
};
