import { auth, setPasswordFor } from "@OpenFarm/auth";
import { eq } from "@OpenFarm/db/operators";
import { user } from "@OpenFarm/db/schema/auth";
import type { RoleName } from "@OpenFarm/db/schema/farm";
import { ACTIVE_ROLE, ROLES } from "@OpenFarm/db/schema/farm";
import { ACTIVE_ASSIGNMENT } from "@OpenFarm/db/schema/herd";
import type { SopContent } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { CODE_ATTEMPTS, countFailure, lockedOut } from "../attempts";
import type { Tx } from "../audit";
import { audited } from "../audit";
import { correct } from "../corrections/correction";
import { nameCorrection, nameCorrectionInput } from "../corrections/name";
import { hashToken } from "../device";
import { farmDay } from "../farm-clock";
import { protectedProcedure, publicProcedure } from "../index";
import {
  acceptInvite,
  approveInvite,
  endMembership,
  newInviteCode,
  newPin,
  pensOf,
  planInvite,
  reissueInvite,
  restoreMembership,
  rolesOf,
  setPens,
  setPin,
  newPasswordCode,
  personByEmail,
  setRoles,
  signOutOf,
  signedInOn,
  spendPasswordCode,
  theRoster,
  whoTheyAre,
  writeInvite,
  writePasswordCode,
} from "../membership";
import { requirePersonalSession, requireRole } from "../roles";
import { scopesOf } from "../scope";

const roleSchema = z.enum(ROLES);

/** One teaching, as a person's row shows it. */
export interface TaughtOnce {
  id: string;
  definitionId: string;
  versionNumber: number;
  sopName: { bn: string; en?: string };
  trainedAt: Date;
}

/** The number as it stands, for the trail to record either side of a change. */
const readPhone = async (tx: Tx, userId: string) => {
  const row = await tx.query.user.findFirst({
    where: { id: userId },
    columns: { phone: true },
  });
  return row ?? null;
};

/** A number as the farm writes it down. Not validated into a shape: a farm writes numbers the
 *  way the people who use them do, and a gateway that cannot dial one will say so. */
const phoneInput = z.string().trim().min(6).max(20);

export const peopleRouter = {
  /**
   * The number the farm can text. Your own always; somebody else's if you run the farm, because
   * a Manager writing down the Owner's number from a scrap of paper is how a farm actually gets
   * these.
   *
   * Only the two safety notices go by text — a Withdrawal ending and a notifiable Diagnosis —
   * and a person with no number simply does not get those; the in-app Alert is the record.
   */
  setPhone: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .input(
      z.object({
        /** Whose. Left out, your own. */
        userId: z.string().optional(),
        /** Cleared by sending nothing at all. */
        phone: phoneInput.nullish(),
      })
    )
    .handler(async ({ context, input }) => {
      const whose = input.userId ?? context.actor.id;
      const mine = whose === context.actor.id;
      const runsTheFarm =
        context.roleUsed === "owner" || context.roleUsed === "manager";
      if (!(mine || runsTheFarm)) {
        throw new ORPCError("FORBIDDEN", {
          message:
            "Only you, or whoever runs the farm, may write down your number",
        });
      }
      if (!mine) {
        // Somebody on this Farm. The user table belongs to the whole database, and a Manager
        // here is nobody to a person who does not work here.
        const theirs = await rolesOf(context.db, context.farm.id, whose);
        if (theirs.length === 0) {
          throw new ORPCError("NOT_FOUND", {
            message: "Nobody on this farm by that name",
          });
        }
        // The Owner's own number is the Owner's. It is where the farm's safety messages go, and
        // a Manager who could redirect or blank it could quietly stop them arriving. Every Role
        // they hold is asked for: an Owner who is also a Manager is still the Owner.
        if (theirs.includes("owner") && context.roleUsed !== "owner") {
          throw new ORPCError("FORBIDDEN", {
            message: "The Owner writes down their own number",
            data: { refusal: "owner_writes_their_own" },
          });
        }
      }
      await audited(context).write(
        {
          entity: "user",
          entityId: whose,
          action: "update",
          // What it was, as well as what it is: this is the number the farm's safety messages
          // go to, and a trail that cannot show what was replaced is no help at all.
          before: (tx) => readPhone(tx, whose),
          after: (tx) => readPhone(tx, whose),
        },
        (tx) =>
          tx
            .update(user)
            .set({ phone: input.phone ?? null })
            .where(eq(user.id, whose))
      );
      return { userId: whose };
    }),

  /** Who am I on this Farm. */
  me: protectedProcedure.handler(({ context }) => ({
    id: context.actor.id,
    name: context.actor.name,
    // Which farm, by name — not its settings: thresholds and windows are read where a Role may read them
    // (farm.current, farm.identity), and a visiting Vet or somebody holding no Role yet may not.
    farm: context.farm
      ? { id: context.farm.id, name: context.farm.name }
      : null,
    roles: context.roles,
    /** What they may see and record under each Role they hold — the farm, their Pens, their Cases, or their Pens or
     *  their Cases — worked out by the same Scope every procedure is held to, so a screen shows what each of their
     *  Roles lets them reach rather than working the rule out again. */
    scopes: scopesOf(context),
    /** The number the farm can text, so a screen can show what is written down. */
    phone: context.person?.phone ?? null,
    disabled: Boolean(context.person?.disabledAt),
  })),

  list: protectedProcedure
    .use(requireRole("owner", "manager"))
    .handler(async ({ context }) => {
      const farmId = context.farm.id;
      const inviteColumns = {
        id: true,
        email: true,
        name: true,
        roles: true,
        invitedByRole: true,
        acceptedAt: true,
        accessUntil: true,
        createdAt: true,
      } as const;
      const [people, pending, approved] = await Promise.all([
        context.db.query.user.findMany({
          columns: { id: true, name: true, email: true, disabledAt: true },
          with: {
            roles: {
              where: { farmId, ...ACTIVE_ROLE },
              columns: { role: true, scope: true, expiresAt: true },
            },
          },
          orderBy: { name: "asc" },
        }),
        context.db.query.invite.findMany({
          where: { farmId, status: "pending" },
          columns: inviteColumns,
          orderBy: { createdAt: "asc" },
        }),
        context.db.query.invite.findMany({
          where: { farmId, status: "approved" },
          columns: inviteColumns,
          orderBy: { createdAt: "asc" },
        }),
      ]);
      const assignments = await context.db.query.penAssignment.findMany({
        where: { farmId, ...ACTIVE_ASSIGNMENT },
        columns: { userId: true, penId: true },
      });
      // What everybody has been taught, in one question rather than one per person.
      const taught = await context.db.query.sopTraining.findMany({
        where: { farmId },
        orderBy: { trainedAt: "desc" },
        with: { version: { columns: { number: true, content: true } } },
      });
      const theirTraining = new Map<string, TaughtOnce[]>();
      for (const row of taught) {
        const forThem = theirTraining.get(row.userId) ?? [];
        forThem.push({
          id: row.id,
          definitionId: row.definitionId,
          versionNumber: row.version.number,
          sopName: (row.version.content as SopContent).name,
          trainedAt: row.trainedAt,
        });
        theirTraining.set(row.userId, forThem);
      }
      return {
        people: people.map((p) => ({
          ...p,
          roles: p.roles.map((r) => r.role),
          /** When a visiting Vet's access ends; null for everyone else. */
          visitUntil:
            p.roles.find((r) => r.role === "vet" && r.scope === "visiting")
              ?.expiresAt ?? null,
          /** The Pens whose work is theirs. */
          penIds: assignments
            .filter((row) => row.userId === p.id)
            .map((row) => row.penId),
          training: theirTraining.get(p.id) ?? [],
        })),
        pendingInvites: pending,
        /** Approved, but the person has not signed up yet — Roles are granted when they do. */
        awaitingSignup: approved.filter((i) => !i.acceptedAt),
      };
    }),

  /** Owner invites anyone with any Roles (approved at once); Manager invites Staff (pending). */
  /** One person of this farm, and what they have been taught. Anybody may ask about
   *  themselves — the person who has to follow a procedure should be able to see when they
   *  were taught it — and the Manager may ask about anybody who works here. */
  get: protectedProcedure
    .use(requireRole("owner", "manager", "staff", "vet"))
    .input(z.object({ userId: z.string() }))
    .handler(async ({ context, input }) => {
      const aboutThemselves = input.userId === context.actor.id;
      const runsTheFarm =
        context.roleUsed === "owner" || context.roleUsed === "manager";
      if (!(aboutThemselves || runsTheFarm)) {
        throw new ORPCError("FORBIDDEN");
      }
      const person = await context.db.query.user.findFirst({
        where: { id: input.userId },
        columns: { id: true, name: true, email: true, disabledAt: true },
        with: {
          roles: {
            where: { farmId: context.farm.id, ...ACTIVE_ROLE },
            columns: { role: true, scope: true, expiresAt: true },
          },
        },
      });
      // Somebody with no Role here is not this farm's business to talk about.
      if (!person || person.roles.length === 0) {
        throw new ORPCError("NOT_FOUND", { message: "No such person" });
      }
      const training = await context.db.query.sopTraining.findMany({
        where: { farmId: context.farm.id, userId: input.userId },
        orderBy: { trainedAt: "desc" },
        with: {
          version: {
            columns: { number: true, content: true, publishedAt: true },
          },
        },
      });
      return {
        ...person,
        roles: person.roles.map((role) => role.role),
        /** When a visiting Vet's stint ends; nothing for everybody else. */
        visitUntil:
          person.roles.find(
            (role) => role.role === "vet" && role.scope === "visiting"
          )?.expiresAt ?? null,
        /** The Pens whose work is theirs. */
        penIds: await pensOf(context.db, context.farm.id, input.userId),
        training: training.map(({ version, ...row }) => ({
          ...row,
          versionNumber: version.number,
          versionPublishedAt: version.publishedAt,
          sopName: (version.content as SopContent).name,
        })),
      };
    }),

  invite: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(
      z.object({
        email: z.email().trim().toLowerCase(),
        name: z.string().trim().min(1),
        roles: z.array(roleSchema).min(1),
        /** For a Vet called in for a visit: the last farm day their access lasts. */
        visitUntil: farmDay.optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const by = { id: context.actor.id, role: context.roleUsed };
      const planned = await planInvite(input, by, now);
      await audited(context).write(
        {
          entity: "invite",
          entityId: planned.id,
          action: "create",
          after: {
            email: planned.email,
            name: planned.name,
            roles: planned.roles,
            status: planned.status,
            visitUntil: planned.visitUntil,
          },
        },
        (tx) => writeInvite(tx, context.farm.id, planned)
      );
      // The code is shown once, to whoever invited them, to hand over in person; the farm keeps only its hash.
      return { id: planned.id, status: planned.status, code: planned.code };
    }),

  /**
   * A new code for an invite not yet taken up — the first one lost, or never written down. The old code stops
   * working at once.
   */
  reissueInviteCode: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const { code, codeHash } = await newInviteCode();
      await audited(context).write(
        {
          entity: "invite",
          entityId: input.id,
          action: "update",
          after: { code: "reissued" },
        },
        (tx) => reissueInvite(tx, context.farm.id, input.id, codeHash)
      );
      return { id: input.id, code };
    }),

  /**
   * Taking up an invite: the person signed in with the email they were invited under enters the code they were
   * handed, and receives the invite's Roles. The code works once, only once the Owner has approved the invite, and
   * only for that email — so somebody who signs up first with another person's address gets nothing.
   */
  acceptInvite: protectedProcedure
    .use(requirePersonalSession())
    .input(z.object({ code: z.string().trim().min(4).max(32) }))
    .handler(async ({ context, input }) => {
      const farmId = context.farm?.id;
      const email = context.session?.user.email.toLowerCase();
      if (!(farmId && email)) {
        throw new ORPCError("NOT_FOUND", { message: "That code is not right" });
      }
      const now = context.clock.now();
      const guesses = `invite:${context.actor.id}`;
      if (lockedOut(guesses, now, CODE_ATTEMPTS)) {
        throw new ORPCError("TOO_MANY_REQUESTS", {
          message: "Too many wrong codes — wait fifteen minutes",
        });
      }
      const codeHash = await hashToken(input.code.toUpperCase());
      let roles: RoleName[] = [];
      await audited(context).write(
        {
          entity: "user",
          entityId: context.actor.id,
          action: "update",
          after: () => Promise.resolve({ roles, source: "invite accepted" }),
        },
        async (tx) => {
          const taken = await acceptInvite(
            tx,
            farmId,
            { userId: context.actor.id, email, codeHash },
            now
          );
          if (!taken) {
            // A code this farm is not waiting for is a wrong guess, and enough of them wait fifteen minutes.
            countFailure(guesses, now, CODE_ATTEMPTS);
            throw new ORPCError("NOT_FOUND", {
              message: "That code is not right",
            });
          }
          roles = taken;
        }
      );
      return { roles };
    }),

  approveInvite: protectedProcedure
    .use(requireRole("owner"))
    .use(requirePersonalSession())
    .input(z.object({ id: z.string() }))
    .handler(async ({ context, input }) => {
      const by = { id: context.actor.id, role: context.roleUsed };
      const now = context.clock.now();
      await audited(context).write(
        {
          entity: "invite",
          entityId: input.id,
          action: "update",
          before: { status: "pending" },
          after: async (tx) => {
            const row = await tx.query.invite.findFirst({
              where: { id: input.id },
              columns: { status: true, email: true, roles: true },
            });
            return row ?? null;
          },
        },
        (tx) => approveInvite(tx, context.farm.id, input.id, by, now)
      );
      return { id: input.id, status: "approved" } as const;
    }),

  /** Owner sets a person's Roles outright. Kept Roles are untouched; revoked ones keep their
   *  history; the farm always keeps at least one other Owner. */
  /**
   * Which Pens' work is a person's: the Manager adds and takes away Pens, and the change is in the trail with the
   * whole list either side of it. A Staff member sees the work, animals and withdrawals of their Pens only, so a
   * newcomer with no Pens has nothing to do until this is done.
   */
  assignPens: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(
      z.object({
        userId: z.string(),
        add: z.array(z.string()).max(200),
        remove: z.array(z.string()).max(200),
      })
    )
    .handler(async ({ context, input }) => {
      const farmId = context.farm.id;
      const now = context.clock.now();
      await audited(context).write(
        {
          entity: "user",
          entityId: input.userId,
          action: "update",
          before: async (tx) => ({
            penIds: await pensOf(tx, farmId, input.userId),
          }),
          after: async (tx) => ({
            penIds: await pensOf(tx, farmId, input.userId),
          }),
        },
        (tx) => setPens(tx, farmId, input.userId, input, now)
      );
      return {
        userId: input.userId,
        penIds: await pensOf(context.db, farmId, input.userId),
      };
    }),

  assignRoles: protectedProcedure
    .use(requireRole("owner"))
    .use(requirePersonalSession())
    .input(z.object({ userId: z.string(), roles: z.array(roleSchema) }))
    .handler(async ({ context, input }) => {
      const farmId = context.farm.id;
      const now = context.clock.now();
      const wanted = [...new Set(input.roles)];
      const by = { id: context.actor.id, role: context.roleUsed };
      await audited(context).write(
        {
          entity: "user",
          entityId: input.userId,
          action: "update",
          before: async (tx) => ({
            roles: await rolesOf(tx, farmId, input.userId),
          }),
          after: { roles: wanted },
        },
        (tx) => setRoles(tx, farmId, input.userId, wanted, by, now)
      );
      return { userId: input.userId, roles: wanted };
    }),

  /** Owner removes a person's access: signed out everywhere, records and history remain. */
  disable: protectedProcedure
    .use(requireRole("owner"))
    .use(requirePersonalSession())
    .input(z.object({ userId: z.string() }))
    .handler(async ({ context, input }) => {
      const by = { id: context.actor.id, role: context.roleUsed };
      const now = context.clock.now();
      await audited(context).write(
        {
          entity: "user",
          entityId: input.userId,
          action: "update",
          before: (tx) => whoTheyAre(tx, input.userId),
          after: (tx) => whoTheyAre(tx, input.userId),
        },
        (tx) => endMembership(tx, input.userId, { by, now })
      );
      return { userId: input.userId, disabled: true };
    }),

  enable: protectedProcedure
    .use(requireRole("owner"))
    .use(requirePersonalSession())
    .input(z.object({ userId: z.string() }))
    .handler(async ({ context, input }) => {
      await audited(context).write(
        {
          entity: "user",
          entityId: input.userId,
          action: "update",
          before: (tx) => whoTheyAre(tx, input.userId),
          after: (tx) => whoTheyAre(tx, input.userId),
        },
        (tx) => restoreMembership(tx, input.userId)
      );
      return { userId: input.userId, disabled: false };
    }),

  /** A Correction: the Owner fixes a person's name with a reason; the old name stays readable. */
  correctName: protectedProcedure
    .use(requireRole(...nameCorrection.roles))
    .use(requirePersonalSession())
    .input(nameCorrectionInput)
    .handler(async ({ context, input }) => {
      await correct(context, nameCorrection, input);
      return { userId: input.id, name: input.changes.name?.to };
    }),

  /** Sets or rotates a Staff member's PIN. The PIN itself is never stored: the phone gets a
   *  salt and a derived hash so PIN Switch works with no signal (ADR 0003). */
  setPin: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(z.object({ userId: z.string(), pin: z.string().trim() }))
    .handler(async ({ context, input }) => {
      const credential = await newPin(input.pin);
      const by = { id: context.actor.id, role: context.roleUsed };
      const now = context.clock.now();
      await audited(context).write(
        {
          entity: "user",
          entityId: input.userId,
          action: "update",
          after: { pinSet: true },
        },
        (tx) => setPin(tx, context.farm.id, input.userId, credential, by, now)
      );
      return { userId: input.userId, pinSet: true };
    }),

  /**
   * A one-time code for somebody who has forgotten their password, read out to them in person.
   *
   * The farm cannot set a password for them: a password somebody else has seen is a password that signs work
   * in their name. So it hands them a code, takes it back, and lets them choose their own — the same way an
   * invitation is handed over, and for the same reason.
   */
  newPasswordCode: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(z.object({ userId: z.string() }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      const by = { id: context.actor.id, role: context.roleUsed };
      const minted = await newPasswordCode(now);
      await audited(context).write(
        {
          entity: "user",
          entityId: input.userId,
          action: "update",
          after: { passwordCodeIssued: true, expiresAt: minted.expiresAt },
        },
        (tx) =>
          writePasswordCode(tx, context.farm.id, input.userId, minted, by, now)
      );
      // Shown once, to whoever is standing with them; the farm keeps only its hash.
      return { userId: input.userId, code: minted.code };
    }),

  /**
   * Setting a password with that code, which is done signed out: somebody who has forgotten theirs cannot sign
   * in to change it.
   *
   * The code is the whole of what proves who is asking, so it is spent on the first try that works and a wrong
   * one is counted — enough of them and the farm stops answering for fifteen minutes. The password is Better
   * Auth's to take from here: it mints the token, it hashes what they chose, and it turns out whoever is still
   * signed in as them.
   */
  setPasswordWithCode: publicProcedure
    .input(
      z.object({
        email: z.email().trim().toLowerCase(),
        code: z.string().trim().min(4).max(32),
        newPassword: z.string().min(12).max(128),
      })
    )
    .handler(async ({ context, input }) => {
      const farmId = context.farm?.id;
      if (!farmId) {
        throw new ORPCError("NOT_FOUND", { message: "That code is not right" });
      }
      const now = context.clock.now();
      const guesses = `password-code:${input.email}`;
      if (lockedOut(guesses, now, CODE_ATTEMPTS)) {
        throw new ORPCError("TOO_MANY_REQUESTS", {
          message: "Too many wrong codes — wait fifteen minutes",
        });
      }
      const codeHash = await hashToken(input.code.toUpperCase());
      const them = await personByEmail(context.db, input.email);
      if (!them) {
        countFailure(guesses, now, CODE_ATTEMPTS);
        throw new ORPCError("NOT_FOUND", { message: "That code is not right" });
      }
      // The trail names them, not whoever issued the code: it is their password and they chose it.
      await audited({ ...context, actor: them }, farmId).write(
        {
          entity: "user",
          entityId: them.id,
          action: "update",
          after: { passwordSet: true },
        },
        async (tx) => {
          try {
            await spendPasswordCode(tx, farmId, them.id, codeHash, now);
          } catch (error) {
            // Counted whether or not the farm is holding a code for them: the count is of wrong guesses.
            countFailure(guesses, now, CODE_ATTEMPTS);
            throw error;
          }
        }
      );
      await setPasswordFor(auth, input.email, input.newPassword);
      return { ok: true } as const;
    }),

  /**
   * Where somebody is signed in as themselves: their own phone, a browser in the office. The Owner's and the
   * Manager's to see, because a handset left in a yard is the farm's problem and not only its owner's.
   *
   * Not Shed Phones, which the farm enrols and revokes as devices (CONTEXT: Shed Phone).
   */
  signedInOn: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(z.object({ userId: z.string() }))
    .handler(({ context, input }) =>
      signedInOn(context.db, input.userId, context.clock.now())
    ),

  /** Signs them out of one of them, and leaves the rest alone. */
  signOut: protectedProcedure
    .use(requireRole("owner", "manager"))
    .use(requirePersonalSession())
    .input(z.object({ userId: z.string(), sessionId: z.string() }))
    .handler(async ({ context, input }) => {
      const now = context.clock.now();
      await audited(context).write(
        {
          entity: "user",
          entityId: input.userId,
          action: "update",
          after: { signedOutOf: input.sessionId },
        },
        (tx) => signOutOf(tx, input.userId, input.sessionId, now)
      );
      return { userId: input.userId, sessionId: input.sessionId };
    }),

  /** The roster a Shed Phone caches: who may PIN Switch on it, and what to check against.
   *  Only reachable with a device token — that token is the gate, and it is revocable. */
  roster: publicProcedure.handler(async ({ context }) => {
    if (!context.device) {
      throw new ORPCError("FORBIDDEN", {
        message: "Only a shed phone may read the roster",
      });
    }
    const farmId = context.farm?.id;
    if (!farmId) {
      return [];
    }
    return await theRoster(context.db, farmId);
  }),
};
