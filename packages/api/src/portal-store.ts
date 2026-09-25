import { auth, openInvestorAccount, setPasswordFor } from "@OpenFarm/auth";
import { PASSWORD_MIN_LENGTH } from "@OpenFarm/auth/password";
import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, isNull, lt, or } from "@OpenFarm/db/operators";
import { session, user } from "@OpenFarm/db/schema/auth";
import { investorAccess } from "@OpenFarm/db/schema/venture";
import { PORTAL_SIGN_IN_HOURS, investorLoginOf } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import {
  CODE_ATTEMPTS,
  countFailure,
  forgetFailures,
  lockedOut,
} from "./attempts";
import type { Tx } from "./audit";
import { audited } from "./audit";
import { refuseCommonPassword } from "./chosen-password";
import type { Context } from "./context";
import { hashOfCodeAsTyped, newInviteCode, signedInOn } from "./membership";
import { consentInForce } from "./portal-consent";
import type { Owned } from "./portal-invitable";
import { invitable, refused } from "./portal-invitable";
import { whatTheyDidToTheirRequests } from "./requests-to-join";

// An Investor's way into the portal (ADR 0007): the Owner's invitation, the Investor taking it up with their phone
// and a password of their own, and the Owner taking it away. The account it opens holds no Role on the farm.

/** How long an invitation's code stands before the Owner has to give a new one. */
const A_WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * Where an Investor stands with the portal, as the Owner's list shows it. Somebody who has taken a code up is in
 * until their access is taken away — a new code for a forgotten password does not shut them out, their old password
 * still works — and a code nobody took up before it ran out is said as such, because the Owner has to give another.
 */
export type PortalStanding =
  | "none"
  | "invited"
  | "code_ran_out"
  | "in"
  | "taken_away";

/** What the Owner's list says of one Investor's access: where they stand, the open code's last day, when last in. */
export interface PortalSaid {
  standing: PortalStanding;
  /** Until when the open code can be taken up, or null where none is open. */
  codeUntil: Date | null;
  /** When they were last in the portal, to the hour; null for somebody never seen there. */
  lastSeenAt: Date | null;
}

/** What the trail keeps of somebody's access, either side of a change: never the code. */
export const readAccess = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  investorId: string
) =>
  (await tx.query.investorAccess.findFirst({
    where: { farmId, investorId },
    columns: {
      userId: true,
      loginEmail: true,
      codeExpiresAt: true,
      invitedAt: true,
      acceptedAt: true,
      revokedAt: true,
    },
  })) ?? null;

/** Whether an access holds a code that can still be taken up: one given, and not past its week. A code given to
 *  somebody whose access was taken away is open all the same — taking it up is what gives the access back. */
export const codeIsOpen = (
  access: { codeHash: string | null; codeExpiresAt: Date | null },
  now: Date
): boolean =>
  access.codeHash !== null &&
  access.codeExpiresAt !== null &&
  access.codeExpiresAt > now;

/** Where each Investor stands with the portal, by their id. */
export const portalStandings = async (
  db: Pick<Tx, "query">,
  farmId: string,
  now: Date
): Promise<Map<string, PortalSaid>> => {
  const rows = await db.query.investorAccess.findMany({
    where: { farmId },
    columns: {
      investorId: true,
      codeHash: true,
      codeExpiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      lastSeenAt: true,
    },
  });
  return new Map(
    rows.map((row) => {
      const codeOpen = codeIsOpen(row, now);
      const standingOf = (): PortalStanding => {
        if (row.revokedAt) {
          return "taken_away";
        }
        if (row.acceptedAt) {
          return "in";
        }
        return codeOpen ? "invited" : "code_ran_out";
      };
      return [
        row.investorId,
        {
          standing: standingOf(),
          codeUntil: codeOpen ? row.codeExpiresAt : null,
          lastSeenAt: row.lastSeenAt,
        },
      ];
    })
  );
};

/** The portal is shut: nothing is taken up or read through it until the Owner opens it (ADR 0007). */
export const portalClosed = () =>
  new ORPCError("FORBIDDEN", {
    message: "The investor portal is not open",
    data: { refusal: "portal_closed" },
  });

/**
 * Invites an Investor to the portal, or gives them a new code — for somebody who never used the first, or who has
 * forgotten their password: the code is shown once, to the Owner, to hand over in person, and the farm keeps only its
 * hash. Given again to somebody whose access was taken away, it gives it back once they take it up.
 */
export const inviteToPortal = async (
  context: Owned,
  investorId: string
): Promise<{ code: string; expiresAt: Date }> => {
  const farmId = context.farm.id;
  const now = context.clock.now();
  const { loginEmail } = await invitable(context, investorId);
  // No code before consent: the Investor signs the Portal Consent in front of the Owner first (the glossary's entry).
  if (!(await consentInForce(context.db, farmId, investorId))) {
    throw refused(
      "They sign the Portal Consent in front of you before any code is given",
      "no_consent"
    );
  }
  const { code, codeHash } = await newInviteCode();
  const expiresAt = new Date(now.getTime() + A_WEEK);
  await audited(context).write(
    {
      entity: "investor_access",
      entityId: investorId,
      action: "update",
      before: (tx) => readAccess(tx, farmId, investorId),
      after: (tx) => readAccess(tx, farmId, investorId),
    },
    async (tx) => {
      await tx
        .insert(investorAccess)
        .values({
          id: uuidv7(now),
          farmId,
          investorId,
          loginEmail,
          codeHash,
          codeExpiresAt: expiresAt,
          invitedBy: context.actor.id,
          invitedAt: now,
        })
        .onConflictDoUpdate({
          target: investorAccess.investorId,
          // The phone may have changed since the first invitation: the account signs in as what it is now.
          set: {
            loginEmail,
            codeHash,
            codeExpiresAt: expiresAt,
            invitedBy: context.actor.id,
            invitedAt: now,
          },
        });
    }
  );
  return { code, expiresAt };
};

/**
 * Takes an Investor's access away: the account is disabled, every session it has ends, and an open code dies. What
 * they read stays in the trail. Invited again, it comes back.
 */
export const takePortalAway = async (
  context: Owned,
  investorId: string
): Promise<void> => {
  const farmId = context.farm.id;
  const now = context.clock.now();
  const access = await context.db.query.investorAccess.findFirst({
    where: { farmId, investorId },
    columns: { id: true, userId: true, revokedAt: true },
  });
  if (!access || access.revokedAt) {
    return;
  }
  await audited(context).write(
    {
      entity: "investor_access",
      entityId: investorId,
      action: "update",
      before: (tx) => readAccess(tx, farmId, investorId),
      after: (tx) => readAccess(tx, farmId, investorId),
    },
    async (tx) => {
      await tx
        .update(investorAccess)
        .set({ revokedAt: now, codeHash: null, codeExpiresAt: null })
        .where(eq(investorAccess.id, access.id));
      if (access.userId) {
        await tx
          .update(user)
          .set({ disabledAt: now })
          .where(eq(user.id, access.userId));
        await tx.delete(session).where(eq(session.userId, access.userId));
      }
    }
  );
};

/** A phone and code that open no invitation: said the same whichever of the two is wrong. */
const notAnInvitation = () =>
  refused("That phone and code do not match an invitation", "wrong_code");

/**
 * An Investor taking up the Owner's invitation: the phone they were written down with, the code handed to them, and
 * a password of their own. Opens their account the first time; afterwards — a new code for a forgotten password, or
 * access given back — sets the password they chose on the account they already have. Wrong codes are counted against
 * the phone and against whoever is calling, as every other code the farm hands out is. Answers with what the account
 * signs in as.
 */
export const takeUpInvitation = async (
  context: Context,
  input: { phone: string; code: string; password: string }
): Promise<{ loginEmail: string }> => {
  const theFarm = context.farm;
  if (!theFarm?.investorPortal) {
    throw portalClosed();
  }
  if (
    input.password.length < PASSWORD_MIN_LENGTH ||
    input.password.length > 128
  ) {
    throw refused(
      `A password is at least ${PASSWORD_MIN_LENGTH} characters`,
      "password_too_short"
    );
  }
  refuseCommonPassword(input.password);
  const now = context.clock.now();
  const loginEmail = investorLoginOf(input.phone);
  // A string that is not a mobile number can match no invitation: refused before anything is looked up, and not
  // remembered, so it costs the farm nothing however many a script sends.
  if (!loginEmail) {
    throw notAnInvitation();
  }
  // Counted twice: against whoever is calling, so a script naming a new phone every time is stopped, and against the
  // phone, so guesses at one Investor's code spread over many callers are stopped too.
  const byCaller = `portal-join:${context.callerAddress ?? "unknown"}`;
  const atPhone = `portal-code:${loginEmail}`;
  const counted = [byCaller, atPhone];
  if (counted.some((key) => lockedOut(key, now, CODE_ATTEMPTS))) {
    throw new ORPCError("TOO_MANY_REQUESTS", {
      message: "Too many wrong codes — wait fifteen minutes",
    });
  }
  const wrong = () => {
    for (const key of counted) {
      countFailure(key, now, CODE_ATTEMPTS);
    }
    return notAnInvitation();
  };
  // Worked out once: the invitation is found by it and used up by it, and the two must never disagree.
  const codeHash = await hashOfCodeAsTyped(input.code);
  const access = await context.db.query.investorAccess.findFirst({
    where: {
      farmId: theFarm.id,
      loginEmail,
      codeHash,
    },
    columns: {
      id: true,
      investorId: true,
      userId: true,
      codeExpiresAt: true,
    },
  });
  if (!access || !access.codeExpiresAt || access.codeExpiresAt <= now) {
    throw wrong();
  }
  const who = await context.db.query.investor.findFirst({
    where: { id: access.investorId, farmId: theFarm.id },
    columns: { name: true },
  });
  if (!who) {
    throw wrong();
  }
  const userId =
    access.userId ??
    (await openInvestorAccount(auth, {
      email: loginEmail,
      name: who.name,
      password: input.password,
    }));
  if (access.userId) {
    await setPasswordFor(auth, loginEmail, input.password);
  }
  // The trail names them: it is their account and their password.
  await audited(
    { ...context, actor: { id: userId, name: who.name } },
    theFarm.id
  ).write(
    {
      entity: "investor_access",
      entityId: access.investorId,
      action: "update",
      before: (tx) => readAccess(tx, theFarm.id, access.investorId),
      after: (tx) => readAccess(tx, theFarm.id, access.investorId),
    },
    async (tx) => {
      const [taken] = await tx
        .update(investorAccess)
        .set({
          userId,
          acceptedAt: now,
          revokedAt: null,
          codeHash: null,
          codeExpiresAt: null,
        })
        .where(
          and(
            eq(investorAccess.id, access.id),
            eq(investorAccess.codeHash, codeHash)
          )
        )
        .returning({ id: investorAccess.id });
      if (!taken) {
        throw wrong();
      }
      await tx
        .update(user)
        .set({ disabledAt: null })
        .where(and(eq(user.id, userId), eq(user.email, loginEmail)));
    }
  );
  // The phone's count is theirs and is forgotten; the caller's stays, since one caller may be a script's.
  forgetFailures(atPhone);
  return { loginEmail };
};

/** How finely the farm keeps when an Investor was last in: an hour, so reading the portal is not a write per page. */
const SEEN_TO_THE_HOUR = 60 * 60 * 1000;

/**
 * Notes that an Investor is in the portal now, at most once an hour. Telemetry, not a farm record: outside the
 * trail, as a Shed Phone's last-seen is — an Audit Event per page read would drown it.
 */
export const markSeen = async (
  db: Context["db"],
  farmId: string,
  userId: string,
  now: Date
): Promise<void> => {
  await db
    .update(investorAccess)
    .set({ lastSeenAt: now })
    .where(
      and(
        eq(investorAccess.farmId, farmId),
        eq(investorAccess.userId, userId),
        or(
          isNull(investorAccess.lastSeenAt),
          lt(
            investorAccess.lastSeenAt,
            new Date(now.getTime() - SEEN_TO_THE_HOUR)
          )
        )
      )
    );
};

/** How long one sign-in to the portal lasts (`PORTAL_SIGN_IN_HOURS`). */
const PORTAL_SIGN_IN_MS = PORTAL_SIGN_IN_HOURS * 60 * 60 * 1000;

/** Whether a portal sign-in has lasted its day. */
export const signInHasRunItsDay = (startedAt: Date, now: Date): boolean =>
  now.getTime() - startedAt.getTime() > PORTAL_SIGN_IN_MS;

/** Ends one sign-in that has lasted its day. Expired rather than deleted, as signing somebody out anywhere else is:
 *  the record that they were signed in there stays. Not an Audit Event — the farm did not decide anything. */
export const endSignIn = async (
  db: Context["db"],
  sessionId: string,
  now: Date
): Promise<void> => {
  await db
    .update(session)
    .set({ expiresAt: now, updatedAt: now })
    .where(eq(session.id, sessionId));
};

/** The Investor an account belongs to, while the portal is open and their access stands; null for anybody else. */
export const investorOf = async (
  db: Pick<Tx, "query">,
  farmId: string,
  userId: string
) => {
  const access = await db.query.investorAccess.findFirst({
    where: { farmId, userId, revokedAt: { isNull: true } },
    columns: { investorId: true, acceptedAt: true },
    with: { investor: { columns: { id: true, name: true, phone: true } } },
  });
  return access?.acceptedAt ? (access.investor ?? null) : null;
};

/** Who signs for the Farm: the Owner's name, whoever is reading the paper. */
export const ownerNameOf = async (
  db: Pick<Tx, "query">,
  farmId: string
): Promise<string> => {
  const owner = await db.query.roleAssignment.findFirst({
    where: { farmId, role: "owner", revokedAt: { isNull: true } },
    columns: { userId: true },
    orderBy: { createdAt: "asc" },
  });
  const person = owner
    ? await db.query.user.findFirst({
        where: { id: owner.userId },
        columns: { name: true },
      })
    : null;
  return person?.name ?? "";
};

/**
 * One of this Investor's own Agreements, or a refusal that says nothing about anybody else's: the portal reads an
 * Agreement only after this has said it is theirs.
 */
export const requireTheirs = async (
  db: Pick<Tx, "query">,
  farmId: string,
  investorId: string,
  agreementId: string
) => {
  const agreement = await db.query.investmentAgreement.findFirst({
    where: { id: agreementId, farmId, investorId },
    columns: { id: true, ventureId: true },
  });
  if (!agreement) {
    throw new ORPCError("NOT_FOUND", {
      message: "No such agreement",
      data: { refusal: "no_such_agreement" },
    });
  }
  return agreement;
};

/** The three papers an Investor reads in the portal, as the trail names them. */
const PORTAL_PAPERS = [
  "joining_letter",
  "progress_statement",
  "settlement_statement",
] as const;
type PortalPaper = (typeof PORTAL_PAPERS)[number];

const isPortalPaper = (paper: unknown): paper is PortalPaper =>
  PORTAL_PAPERS.includes(paper as PortalPaper);

/** How many of the papers they read the Owner is shown: the latest, which is what anybody asks about. */
const PAPERS_SHOWN = 20;

/**
 * What an Investor has done in the portal, for the Owner's page of them: when they took the invitation up, when they
 * were last in, where they are signed in now, the papers they read — each already an Export in the trail under their
 * name — and what they did to their Requests to Join, each the latest first. Nothing for somebody who never took an
 * invitation up.
 */
export const portalActivity = async (
  db: Pick<Tx, "query">,
  farmId: string,
  investorId: string,
  now: Date
) => {
  const access = await db.query.investorAccess.findFirst({
    where: { farmId, investorId },
    columns: { userId: true, acceptedAt: true, lastSeenAt: true },
  });
  if (!access?.userId) {
    return null;
  }
  const [places, exported, requestChanges] = await Promise.all([
    signedInOn(db, access.userId, now),
    db.query.auditEvent.findMany({
      where: {
        farmId,
        actorId: access.userId,
        entity: "investment_agreement",
        action: "export",
      },
      columns: { id: true, entityId: true, after: true, receivedAt: true },
      orderBy: { receivedAt: "desc", id: "desc" },
      limit: PAPERS_SHOWN,
    }),
    whatTheyDidToTheirRequests(db, farmId, investorId, PAPERS_SHOWN),
  ]);
  const read: { at: Date; agreementId: string; paper: PortalPaper }[] = [];
  for (const one of exported) {
    const paper = (one.after as { paper?: unknown } | null)?.paper;
    if (isPortalPaper(paper)) {
      read.push({ at: one.receivedAt, agreementId: one.entityId, paper });
    }
  }
  return {
    acceptedAt: access.acceptedAt,
    lastSeenAt: access.lastSeenAt,
    signedInOn: places,
    read,
    /** What they did to their Requests to Join, the latest first. */
    requestChanges,
  };
};
