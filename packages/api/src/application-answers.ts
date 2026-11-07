import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, inArray, isNull, lte } from "@OpenFarm/db/operators";
import { alert } from "@OpenFarm/db/schema/alert";
import type { ApplicationPhotoKind } from "@OpenFarm/db/schema/application";
import {
  investorApplication,
  investorApplicationPhoto,
} from "@OpenFarm/db/schema/application";
import {
  investor,
  investorAccess,
  portalConsent,
} from "@OpenFarm/db/schema/venture";
import {
  farmDayOf,
  investorLoginOf,
  mobileNumberOf,
  startOfFarmDay,
} from "@OpenFarm/domain";
import type { Language } from "@OpenFarm/i18n";
import { isLanguage, translate } from "@OpenFarm/i18n";
import { ORPCError } from "@orpc/server";

import { assertApplicationsTaken, standingOfLink } from "./application-links";
import { readApplicationForTrail } from "./applications";
import type { Tx } from "./audit";
import { audited } from "./audit";
import type { Context } from "./context";
import { lockTheFarm } from "./farm-lock";
import { readInvestor } from "./investor-store";
import type { Owned } from "./portal-invitable";
import { accountOfAnotherAt, refused } from "./portal-invitable";
import { sendNewCode } from "./portal-store";
import { currentWording } from "./template-store";

// The Owner's answer to an Application (ADR 0034): approved, which writes them down as an Investor, records the Portal
// Consent they agreed online and texts their first code; or declined, with a line they are sent.

type ApplicationRow = typeof investorApplication.$inferSelect;

/** Takes the Notice about an Application off the Owner's list once it is answered. */
export const settleTheApplicationNotice = async (
  tx: Tx,
  farmId: string,
  applicationId: string,
  now: Date
): Promise<void> => {
  await tx
    .update(alert)
    .set({ dismissedAt: now })
    .where(
      and(
        eq(alert.farmId, farmId),
        eq(alert.kind, "application_sent"),
        eq(alert.entityId, applicationId),
        isNull(alert.dismissedAt)
      )
    );
};

/** One of the farm's Applications still waiting for an answer, refused by name otherwise. */
const waitingApplication = async (
  context: Owned,
  id: string
): Promise<ApplicationRow> => {
  const row = await context.db.query.investorApplication.findFirst({
    where: { id, farmId: context.farm.id },
  });
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "No such Application" });
  }
  if (row.state !== "waiting") {
    throw refused(
      `It has been answered already: ${row.state}`,
      "application_answered"
    );
  }
  return row;
};

/** The language they applied in, which what the farm sends them is in. */
const theirLanguage = (row: ApplicationRow): Language =>
  isLanguage(row.language) ? row.language : "bn";

/**
 * Whether the email they kept is the one their link went to, and something secret reached them there — the link
 * itself, or the code they agreed with: as a confirmation code would, that proves the inbox theirs, so approving
 * counts it confirmed and later codes reach it (ADR 0034).
 */
const emailWasTheLinks = async (context: Owned, row: ApplicationRow) => {
  if (!row.email) {
    return false;
  }
  const link = await context.db.query.applicationLink.findFirst({
    where: { id: row.linkId },
    columns: { email: true, sentByEmail: true },
  });
  const reached = link?.sentByEmail !== null || row.codeChannel === "email";
  return reached && link?.email === row.email;
};

/** Refuses approving somebody already on the farm's records by their mobile, or whose mobile signs in to another
 *  Investor's portal. */
const assertNobodyOnTheMobile = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  phone: string
) => {
  const mobile = mobileNumberOf(phone);
  const investors = await tx.query.investor.findMany({
    where: { farmId, isFarm: false },
    columns: { phone: true },
  });
  if (mobile && investors.some((one) => mobileNumberOf(one.phone) === mobile)) {
    throw refused(
      "Somebody on this mobile is already an Investor",
      "already_an_investor"
    );
  }
};

/**
 * Approves an Application: in one write, the Investor written down as they filled it in, the Portal Consent they agreed
 * recorded on the day they sent it and on the wording they read, and their way into the portal opened; then their
 * first code texted, and emailed where the email is the one their link went to. Refused when the farm takes no
 * Applications now, the consent's wording has changed since they agreed it — they agree the new one on a new link — or
 * somebody on their mobile is an Investor already. A code that does not go leaves them approved, for the Owner's "send
 * a new code" to try again.
 */
export const approveApplication = async (
  context: Owned,
  id: string
): Promise<{
  investorId: string;
  code: { bySms: string | null; byEmail: string | null } | null;
}> => {
  await assertApplicationsTaken(context);
  const row = await waitingApplication(context, id);
  const farmId = context.farm.id;
  const wording = await currentWording(context.db, farmId, "portal_consent");
  if (wording.versionId !== row.consentVersionId) {
    throw refused(
      "The consent's wording changed since they agreed it: decline, and send them a new link to agree the new one",
      "consent_wording_changed"
    );
  }
  const loginEmail = investorLoginOf(row.phone);
  if (!loginEmail) {
    throw refused(
      "Their phone is not a mobile number, which is what they sign in with",
      "phone_not_mobile"
    );
  }
  const now = context.clock.now();
  const investorId = uuidv7(now);
  const consentId = uuidv7(now);
  const emailConfirmed = await emailWasTheLinks(context, row);
  // Their first code has a way to reach them, or they would be approved into a portal they could never enter: by text
  // while the farm texts, or to the email approving confirms.
  if (!(context.sms.sends || (emailConfirmed && context.email.sends))) {
    throw refused(
      "The farm cannot text yet, and their email is not one the farm has reached: their first code would go nowhere",
      "no_way_to_send_first_code"
    );
  }
  await audited(context).write(
    {
      entity: "investor",
      entityId: investorId,
      action: "create",
      after: (tx) => readInvestor(tx, farmId, investorId),
    },
    async (tx) => {
      await lockTheFarm(tx, farmId);
      await assertNobodyOnTheMobile(tx, farmId, row.phone);
      const sharing = await tx.query.investorAccess.findFirst({
        where: { loginEmail },
        columns: { id: true },
      });
      if (sharing || (await accountOfAnotherAt(tx, loginEmail, investorId))) {
        throw refused(
          "Another Investor on the same phone already has the portal",
          "phone_has_portal"
        );
      }
      await tx.insert(investor).values({
        id: investorId,
        farmId,
        kind: row.kind,
        name: row.name,
        phone: row.phone,
        email: row.email,
        emailConfirmedAt: emailConfirmed ? now : null,
        address: row.address,
        nid: row.nid,
        bankAccount: row.bankAccount,
        tradeLicense: row.tradeLicense,
        rjscNumber: row.rjscNumber,
        tin: row.tin,
        authority: row.authority,
        authorityOn: row.authorityOn,
        signatoryName: row.signatoryName,
        signatoryNid: row.signatoryNid,
        signatoryRole: row.signatoryRole,
        recordedBy: context.actor.id,
        createdAt: now,
      });
      await tx.insert(portalConsent).values({
        id: consentId,
        farmId,
        investorId,
        versionId: row.consentVersionId,
        // Agreed on the day they sent it, with the code: that is when they gave it.
        signedOn: startOfFarmDay(farmDayOf(row.sentAt)),
        recordedBy: context.actor.id,
        recordedAt: now,
      });
      // Their way in, with no code yet: the first is texted below, by the same act as a new one.
      await tx.insert(investorAccess).values({
        id: uuidv7(now),
        farmId,
        investorId,
        loginEmail,
        codeHash: null,
        codeExpiresAt: null,
        invitedBy: context.actor.id,
        invitedAt: now,
      });
      const before = await readApplicationForTrail(tx, farmId, id);
      const [answered] = await tx
        .update(investorApplication)
        .set({
          state: "approved",
          answeredAt: now,
          answeredBy: context.actor.id,
          investorId,
          consentId,
        })
        .where(
          and(
            eq(investorApplication.id, id),
            eq(investorApplication.state, "waiting")
          )
        )
        .returning({ id: investorApplication.id });
      if (!answered) {
        throw refused("It has been answered already", "application_answered");
      }
      await audited(context).recordEvent(
        tx,
        {
          entity: "investor_application",
          entityId: id,
          action: "update",
        },
        {
          before,
          after: await readApplicationForTrail(tx, farmId, id),
        }
      );
      await settleTheApplicationNotice(tx, farmId, id, now);
    }
  );
  const code = await sendNewCode(context, investorId, {
    language: theirLanguage(row),
  }).catch(() => null);
  return {
    investorId,
    code: code ? { bySms: code.bySms, byEmail: code.byEmail } : null,
  };
};

/**
 * Declines an Application, with a line they are sent by text and to the email their link went to. What it holds about
 * them is cleared a month later. A message that does not go leaves it declined.
 */
export const declineApplication = async (
  context: Owned,
  id: string,
  line: string | null
): Promise<{ id: string }> => {
  const row = await waitingApplication(context, id);
  const farmId = context.farm.id;
  const now = context.clock.now();
  await audited(context).write(
    {
      entity: "investor_application",
      entityId: id,
      action: "update",
      before: (tx) => readApplicationForTrail(tx, farmId, id),
      after: (tx) => readApplicationForTrail(tx, farmId, id),
    },
    async (tx) => {
      const [answered] = await tx
        .update(investorApplication)
        .set({
          state: "declined",
          answeredAt: now,
          answeredBy: context.actor.id,
          answerLine: line,
        })
        .where(
          and(
            eq(investorApplication.id, id),
            eq(investorApplication.state, "waiting")
          )
        )
        .returning({ id: investorApplication.id });
      if (!answered) {
        throw refused("It has been answered already", "application_answered");
      }
      await settleTheApplicationNotice(tx, farmId, id, now);
    }
  );
  const language = theirLanguage(row);
  const facts = { farm: context.farm.name, line: line ?? "" };
  const link = await context.db.query.applicationLink.findFirst({
    where: { id: row.linkId },
    columns: { email: true },
  });
  const mobile = mobileNumberOf(row.phone);
  await Promise.all([
    mobile && context.sms.sends
      ? context.sms
          .send(mobile, {
            text: translate(
              language,
              "portal.apply.declined.sms",
              facts
            ).trim(),
            lang: language,
          })
          .catch(() => null)
      : null,
    link?.email && context.email.sends
      ? context.email
          .send(link.email, {
            subject: `${context.farm.name}: ${translate(language, "portal.apply.declined.subject")}`,
            text: translate(language, "portal.apply.declined.email", facts),
          })
          .catch(() => null)
      : null,
  ]);
  return { id };
};

/** What the Owner's list shows of an Application: who, and where it stands — never the photographs. */
const listed = (row: ApplicationRow) => ({
  id: row.id,
  linkId: row.linkId,
  kind: row.kind,
  name: row.name,
  phone: row.phone,
  state: row.state,
  sentAt: row.sentAt,
  answeredAt: row.answeredAt,
  answerLine: row.answerLine,
  investorId: row.investorId,
  clearedAt: row.clearedAt,
});

/** The farm's Applications, newest first, with where each stands. */
export const applicationsOf = async (context: Owned) => {
  const rows = await context.db.query.investorApplication.findMany({
    where: { farmId: context.farm.id },
    orderBy: { sentAt: "desc", id: "desc" },
  });
  return rows.map(listed);
};

/**
 * One Application as the Owner reads it to answer it: everything they filled in, the Nominees they would name, which
 * photographs it carries, and the proof of their agreeing the consent. The photographs come one at a time
 * (`applicationPhoto`).
 */
export const applicationToRead = async (context: Owned, id: string) => {
  const row = await context.db.query.investorApplication.findFirst({
    where: { id, farmId: context.farm.id },
  });
  if (!row) {
    throw new ORPCError("NOT_FOUND", { message: "No such Application" });
  }
  const [photos, link, version] = await Promise.all([
    context.db.query.investorApplicationPhoto.findMany({
      where: { applicationId: id, farmId: context.farm.id },
      columns: { what: true },
    }),
    context.db.query.applicationLink.findFirst({
      where: { id: row.linkId },
      columns: { tokenHash: false, openKeyHash: false },
    }),
    context.db.query.paperTemplateVersion.findFirst({
      where: { id: row.consentVersionId },
      columns: { number: true },
    }),
  ]);
  const wording = await currentWording(
    context.db,
    context.farm.id,
    "portal_consent"
  );
  return {
    ...listed(row),
    email: row.email,
    address: row.address,
    nid: row.nid,
    bankAccount: row.bankAccount,
    tradeLicense: row.tradeLicense,
    rjscNumber: row.rjscNumber,
    tin: row.tin,
    authority: row.authority,
    authorityOn: row.authorityOn,
    signatoryName: row.signatoryName,
    signatoryNid: row.signatoryNid,
    signatoryRole: row.signatoryRole,
    nominees: row.nominees ?? [],
    language: row.language,
    photos: photos.map((one) => one.what),
    consent: {
      version: version?.number ?? null,
      /** Whether the wording in force now is the one they agreed: a changed one cannot be approved. */
      stillInForce: wording.versionId === row.consentVersionId,
      paperHash: row.consentPaperHash,
      codeChannel: row.codeChannel,
      codeSentTo: row.codeSentTo,
      codeSentAt: row.codeSentAt,
      callerAddress: row.callerAddress,
      callerAgent: row.callerAgent,
    },
    link: link
      ? {
          email: link.email,
          madeAt: link.madeAt,
          sentByEmail: link.sentByEmail,
          standing: standingOfLink(
            { ...link, tokenHash: "", openKeyHash: null },
            context.clock.now()
          ),
        }
      : null,
  };
};

/** One photograph an Application carries, or nothing; opening it is in the trail, as an Investor's paper is. */
export const applicationPhoto = async (
  context: Owned,
  id: string,
  what: ApplicationPhotoKind
) => {
  const photo = await context.db.query.investorApplicationPhoto.findFirst({
    where: { applicationId: id, farmId: context.farm.id, what },
    columns: { contentType: true, data: true },
  });
  if (!photo) {
    return null;
  }
  await audited(context).write(
    {
      entity: "investor_application",
      entityId: id,
      action: "export",
      after: { photo: what },
    },
    () => Promise.resolve()
  );
  return photo;
};

/** The consent paper an Application agreed, as it was laid out for them: the proof the Owner may print. */
export const applicationConsentPaper = async (context: Owned, id: string) => {
  const row = await context.db.query.investorApplication.findFirst({
    where: { id, farmId: context.farm.id },
    columns: { consentPaper: true },
  });
  return row?.consentPaper ?? null;
};

/** How long an Application waits for an answer before it lapses: a month, as a Request to Join waits for a Venture. */
export const APPLICATION_LAPSES_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

/** How long a declined or lapsed Application keeps what it holds about them before it is cleared. */
export const APPLICATION_CLEARED_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

/** What clearing an Application empties: everything about them but the name, the mobile, the dates and the answer. */
const CLEARED = {
  email: null,
  address: null,
  nid: null,
  bankAccount: null,
  tradeLicense: null,
  rjscNumber: null,
  tin: null,
  authority: null,
  authorityOn: null,
  signatoryName: null,
  signatoryNid: null,
  signatoryRole: null,
  nominees: null,
  consentPaper: null,
  callerAddress: null,
  callerAgent: null,
} as const;

/**
 * The day's round for Applications (ADR 0034): one undecided for a month lapses and leaves the Owner's list; one
 * declined or lapsed a month ago is cleared — its photographs deleted and everything about them emptied but the name,
 * the mobile, the dates and the answer. An approved one is never cleared: its photographs are the Owner's proof of the
 * check, held as the Investor's record is. Each its own write, the trail saying who and where it stands and nothing
 * more; a round with nothing to do writes nothing.
 */
export const lapseAndClearApplications = async (
  context: Context & { farm: NonNullable<Context["farm"]> },
  now: Date
): Promise<{ lapsed: number; cleared: number }> => {
  const farmId = context.farm.id;
  const lapseBefore = new Date(now.getTime() - APPLICATION_LAPSES_AFTER_MS);
  const clearBefore = new Date(now.getTime() - APPLICATION_CLEARED_AFTER_MS);
  const toLapse = await context.db.query.investorApplication.findMany({
    where: { farmId, state: "waiting", sentAt: { lte: lapseBefore } },
    columns: { id: true },
  });
  for (const { id } of toLapse) {
    // oxlint-disable-next-line no-await-in-loop -- one write each, so the trail names each one
    await audited(context).write(
      {
        entity: "investor_application",
        entityId: id,
        action: "update",
        before: (tx) => readApplicationForTrail(tx, farmId, id),
        after: (tx) => readApplicationForTrail(tx, farmId, id),
      },
      async (tx) => {
        await tx
          .update(investorApplication)
          .set({ state: "lapsed", answeredAt: now })
          .where(
            and(
              eq(investorApplication.id, id),
              eq(investorApplication.state, "waiting")
            )
          );
        await settleTheApplicationNotice(tx, farmId, id, now);
      }
    );
  }
  const toClear = await context.db.query.investorApplication.findMany({
    where: {
      farmId,
      state: { in: ["declined", "lapsed"] },
      answeredAt: { lte: clearBefore },
      clearedAt: { isNull: true },
    },
    columns: { id: true },
  });
  for (const { id } of toClear) {
    // oxlint-disable-next-line no-await-in-loop -- as above
    await audited(context).write(
      {
        entity: "investor_application",
        entityId: id,
        action: "update",
        before: (tx) => readApplicationForTrail(tx, farmId, id),
        after: (tx) => readApplicationForTrail(tx, farmId, id),
      },
      async (tx) => {
        await tx
          .delete(investorApplicationPhoto)
          .where(eq(investorApplicationPhoto.applicationId, id));
        await tx
          .update(investorApplication)
          .set({ ...CLEARED, clearedAt: now })
          .where(
            and(
              eq(investorApplication.id, id),
              inArray(investorApplication.state, ["declined", "lapsed"]),
              lte(investorApplication.answeredAt, clearBefore)
            )
          );
      }
    );
  }
  return { lapsed: toLapse.length, cleared: toClear.length };
};
