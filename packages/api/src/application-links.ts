import { originOf } from "@OpenFarm/auth/hosts";
import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, isNull } from "@OpenFarm/db/operators";
import { applicationLink } from "@OpenFarm/db/schema/application";
import { INVESTOR_KINDS } from "@OpenFarm/db/schema/venture";
import { maskedDigits, mobileNumberOf } from "@OpenFarm/domain";
import { resolveLanguage, translate } from "@OpenFarm/i18n";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "./audit";
import { audited } from "./audit";
import { hashToken } from "./device";
import { assertRegistered } from "./export-store";
import { lockTheFarm } from "./farm-lock";
import { ONE_SEND_EVERY_MS, maskedEmail } from "./investor-email";
import { emailInput } from "./investor-input";
import type { Owned } from "./portal-invitable";
import { refused } from "./portal-invitable";
import { portalClosed } from "./portal-store";
import { giveStandardTemplates } from "./template-store";

// An Application Link: the Owner's invitation to one person they know to fill in their own details online (ADR 0034).
// Made for a name, a mobile and an email; the link is shown once and kept only as a hash; good for a week and one
// Application. Whatever opens it is in `applications.ts`.

/** How long a link stands before the Owner has to make another. */
export const LINK_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/** The days a link stands, as a message says it. */
const LINK_DAYS = LINK_LIFETIME_MS / (24 * 60 * 60 * 1000);

/** How a link is sent: by email, the Owner's way (2026-11-08), or by text. */
export const LINK_WAYS = ["email", "sms"] as const;
export type LinkWay = (typeof LINK_WAYS)[number];

/** A link's secret: 32 random bytes, read as a URL carries it. Hard to guess, so a plain hash keeps it well. */
const newToken = (): string =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");

/** What the farm keeps of a link's secret, and how a link is found by the secret in an address. */
export const hashOfLinkToken = (token: string): Promise<string> =>
  hashToken(token.trim());

/** The address a link opens, on the Investor Portal's own address where it has one (ADR 0009). */
export const addressOfLink = (token: string): string =>
  `${originOf("portal")}/portal/apply/${token}`;

/** Who the Owner makes a link for: a name, a mobile, an email, and whether they are a person or an Organization. */
export const linkInput = z.object({
  kind: z.enum(INVESTOR_KINDS),
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(1).max(20),
  email: emailInput.optional(),
  /** Whether to email it at once, where it has an email. Left out: it is emailed. */
  send: z.boolean().optional(),
});
export type LinkInput = z.infer<typeof linkInput>;

/** Where a link stands, as the Owner's list says it. */
export type LinkStanding = "open" | "sent" | "used" | "withdrawn" | "ran_out";

type LinkRow = typeof applicationLink.$inferSelect;

export const standingOfLink = (link: LinkRow, now: Date): LinkStanding => {
  if (link.usedAt) {
    return "used";
  }
  if (link.withdrawnAt) {
    return "withdrawn";
  }
  if (link.expiresAt <= now) {
    return "ran_out";
  }
  return link.sentAt ? "sent" : "open";
};

/** A link still able to bring an Application back: not used, not withdrawn, and not run out. */
export const linkIsOpen = (link: LinkRow, now: Date): boolean => {
  const standing = standingOfLink(link, now);
  return standing === "open" || standing === "sent";
};

/**
 * Whether the farm takes Applications at all, refused by name otherwise: the Owner's switch on, the portal open, and
 * the farm able to text, since the code that opens a link and seals the consent goes by text (ADR 0034). Read as the
 * farm stands now, not as the request found it.
 */
export const assertApplicationsTaken = async (
  context: Pick<Owned, "db" | "farm" | "sms">
): Promise<void> => {
  const standing = await context.db.query.farm.findFirst({
    where: { id: context.farm.id },
    columns: { investorPortal: true, investorApplications: true },
  });
  if (!standing?.investorApplications) {
    throw refused(
      "Applications are off: turn them on under the portal's settings",
      "applications_off"
    );
  }
  if (!standing.investorPortal) {
    throw portalClosed();
  }
  if (!context.sms.sends) {
    throw refused(
      "The farm cannot send texts, and the code that opens a link goes by text",
      "farm_cannot_text"
    );
  }
};

/** A link as the trail keeps it: everything but its secret. */
const readLink = async (tx: Pick<Tx, "query">, farmId: string, id: string) => {
  const row = await tx.query.applicationLink.findFirst({
    where: { id, farmId },
    columns: { tokenHash: false },
  });
  return row ?? null;
};

/**
 * Whoever is on this mobile already, refused by name: an Investor written down on it, or a link or an Application
 * still open for it. One person, one way in.
 */
const assertNobodyOnTheMobile = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  mobile: string,
  now: Date
) => {
  const investors = await tx.query.investor.findMany({
    where: { farmId, isFarm: false },
    columns: { phone: true },
  });
  if (investors.some((one) => mobileNumberOf(one.phone) === mobile)) {
    throw refused(
      "Somebody on this mobile is already an Investor",
      "already_an_investor"
    );
  }
  const links = await tx.query.applicationLink.findMany({
    where: { farmId, withdrawnAt: { isNull: true } },
  });
  const open = links.find(
    (one) => mobileNumberOf(one.phone) === mobile && linkIsOpen(one, now)
  );
  if (open) {
    throw refused(
      "A link for this mobile is still open: withdraw it first",
      "link_open_for_mobile"
    );
  }
};

/** The link's words: an email in Bangla and then English, since nobody has chosen a language yet, and a text in the
 *  farm's own, which is short enough for one. */
const linkMessage = (
  farmName: string,
  name: string,
  address: string
): { subject: string; email: string; sms: string } => {
  const params = { farm: farmName, name, at: address, days: LINK_DAYS };
  return {
    subject: `${farmName}: ${translate("bn", "portal.apply.link.subject")} · ${translate("en", "portal.apply.link.subject")}`,
    email: (["bn", "en"] as const)
      .map((one) => translate(one, "portal.apply.link.email", params))
      .join("\n\n—\n\n"),
    sms: translate(resolveLanguage(null), "portal.apply.link.sms", params),
  };
};

/**
 * Sends a link by email to the address on it, or by text to its mobile, saying where it went, mostly hidden. Refused
 * when the farm cannot send that way, when the link has no email, and more than once a minute. The address is made
 * again from the secret it is sent with, which only the Owner's making or a new secret holds.
 */
const sendTheLink = async (
  context: Owned,
  link: LinkRow,
  token: string,
  by: LinkWay
): Promise<{ byEmail: string | null; bySms: string | null }> => {
  const now = context.clock.now();
  const message = linkMessage(
    context.farm.name,
    link.name,
    addressOfLink(token)
  );
  if (by === "email") {
    if (!link.email) {
      throw refused("The link has no email to go to", "link_has_no_email");
    }
    if (!context.email.sends) {
      throw refused("The farm cannot send email yet", "farm_cannot_email");
    }
    const sent = await context.email.send(link.email, {
      subject: message.subject,
      text: message.email,
    });
    if (!sent.delivered) {
      throw refused(
        "The email did not go — try again in a minute",
        "link_not_sent"
      );
    }
  } else {
    const mobile = mobileNumberOf(link.phone);
    if (!(mobile && context.sms.sends)) {
      throw refused(
        "The farm cannot send texts, and the code that opens a link goes by text",
        "farm_cannot_text"
      );
    }
    const sent = await context.sms.send(mobile, {
      text: message.sms,
      lang: resolveLanguage(null),
    });
    if (!sent.delivered) {
      throw refused(
        "The text did not go — try again in a minute",
        "link_not_sent"
      );
    }
  }
  const sent = {
    byEmail: by === "email" && link.email ? maskedEmail(link.email) : null,
    bySms: by === "sms" ? maskedDigits(link.phone) : null,
  };
  await audited(context).write(
    {
      entity: "application_link",
      entityId: link.id,
      action: "update",
      before: (tx) => readLink(tx, context.farm.id, link.id),
      after: (tx) => readLink(tx, context.farm.id, link.id),
    },
    (tx) =>
      tx
        .update(applicationLink)
        .set({ sentAt: now, sentByEmail: sent.byEmail, sentBySms: sent.bySms })
        .where(eq(applicationLink.id, link.id))
  );
  return sent;
};

/**
 * The Owner makes a link for somebody they know: name, mobile, email, person or Organization. Answers the address
 * once — it is kept only as a hash — and emails it at once where it has an email, unless the Owner says not to. A
 * link made but not sent stands: the Owner may copy the address, or send it again (which makes a new secret).
 */
export const makeApplicationLink = async (
  context: Owned,
  input: LinkInput
): Promise<{
  id: string;
  address: string;
  expiresAt: Date;
  sent: { byEmail: string | null; bySms: string | null } | null;
}> => {
  await assertApplicationsTaken(context);
  // The consent they will agree is laid out on the farm's identity and its wording: both there before anybody is asked.
  assertRegistered(context.farm, "portal_consent");
  await giveStandardTemplates(context);
  const mobile = mobileNumberOf(input.phone);
  if (!mobile) {
    throw refused(
      "Their phone is not a mobile number, which the code goes to and they sign in with",
      "phone_not_mobile"
    );
  }
  const now = context.clock.now();
  const token = newToken();
  const tokenHash = await hashOfLinkToken(token);
  const id = uuidv7(now);
  const expiresAt = new Date(now.getTime() + LINK_LIFETIME_MS);
  await audited(context).write(
    {
      entity: "application_link",
      entityId: id,
      action: "create",
      after: (tx) => readLink(tx, context.farm.id, id),
    },
    async (tx) => {
      // Two links for one mobile made at once must meet each other.
      await lockTheFarm(tx, context.farm.id);
      await assertNobodyOnTheMobile(tx, context.farm.id, mobile, now);
      await tx.insert(applicationLink).values({
        id,
        farmId: context.farm.id,
        kind: input.kind,
        name: input.name,
        phone: input.phone,
        email: input.email ?? null,
        tokenHash,
        expiresAt,
        madeBy: context.actor.id,
        madeAt: now,
      });
    }
  );
  const link = await context.db.query.applicationLink.findFirst({
    where: { id },
  });
  const emailIt = input.send !== false && input.email !== undefined;
  // Made, the link stands whether or not the email goes: the Owner is told, and sends it again.
  const sent =
    link && emailIt
      ? await sendTheLink(context, link, token, "email").catch(() => null)
      : null;
  return { id, address: addressOfLink(token), expiresAt, sent };
};

/** One of the farm's links, refused by name when it is no longer open. */
const openLink = async (context: Owned, id: string): Promise<LinkRow> => {
  const link = await context.db.query.applicationLink.findFirst({
    where: { id, farmId: context.farm.id },
  });
  if (!link) {
    throw new ORPCError("NOT_FOUND", { message: "No such link" });
  }
  const standing = standingOfLink(link, context.clock.now());
  if (standing === "used") {
    throw refused("Their Application is in already", "link_used");
  }
  if (standing === "withdrawn") {
    throw refused("The link was withdrawn", "link_withdrawn");
  }
  if (standing === "ran_out") {
    throw refused("The link ran out: make another", "link_ran_out");
  }
  return link;
};

/**
 * Sends a link again, by email or by text: a new secret, so the address sent before opens nothing from now on and
 * only the newest one does. Its week is not lengthened. One a minute.
 */
export const sendApplicationLink = async (
  context: Owned,
  id: string,
  by: LinkWay
): Promise<{ byEmail: string | null; bySms: string | null }> => {
  await assertApplicationsTaken(context);
  const link = await openLink(context, id);
  const now = context.clock.now();
  if (
    link.sentAt !== null &&
    now.getTime() - link.sentAt.getTime() < ONE_SEND_EVERY_MS
  ) {
    throw new ORPCError("TOO_MANY_REQUESTS", {
      message: "It was sent just now — wait a minute",
      data: { refusal: "link_sent_just_now" },
    });
  }
  const token = newToken();
  await context.db
    .update(applicationLink)
    .set({ tokenHash: await hashOfLinkToken(token) })
    .where(and(eq(applicationLink.id, id), isNull(applicationLink.usedAt)));
  return sendTheLink(context, link, token, by);
};

/** The Owner withdraws a link not yet used: it opens nothing from then on. */
export const withdrawApplicationLink = async (
  context: Owned,
  id: string
): Promise<{ id: string }> => {
  await openLink(context, id);
  const now = context.clock.now();
  await audited(context).write(
    {
      entity: "application_link",
      entityId: id,
      action: "update",
      before: (tx) => readLink(tx, context.farm.id, id),
      after: (tx) => readLink(tx, context.farm.id, id),
    },
    async (tx) => {
      const [done] = await tx
        .update(applicationLink)
        .set({ withdrawnAt: now, withdrawnBy: context.actor.id })
        .where(
          and(
            eq(applicationLink.id, id),
            eq(applicationLink.farmId, context.farm.id),
            isNull(applicationLink.usedAt),
            isNull(applicationLink.withdrawnAt)
          )
        )
        .returning({ id: applicationLink.id });
      if (!done) {
        throw refused("Their Application is in already", "link_used");
      }
    }
  );
  return { id };
};

/** The farm's links, newest first, each with where it stands: everything but the secret. */
export const applicationLinks = async (context: Owned) => {
  const now = context.clock.now();
  const rows = await context.db.query.applicationLink.findMany({
    where: { farmId: context.farm.id },
    columns: { tokenHash: false },
    orderBy: { madeAt: "desc", id: "desc" },
  });
  return rows.map((one) => ({
    ...one,
    standing: standingOfLink({ ...one, tokenHash: "" }, now),
  }));
};
