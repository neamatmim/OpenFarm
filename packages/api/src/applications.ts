import { uuidv7 } from "@OpenFarm/db/ids";
import { and, eq, isNull } from "@OpenFarm/db/operators";
import type {
  ApplicationCodeChannel,
  ApplicationCodePurpose,
  ApplicationPhotoKind,
} from "@OpenFarm/db/schema/application";
import {
  applicationCode,
  applicationLink,
  investorApplication,
  investorApplicationPhoto,
} from "@OpenFarm/db/schema/application";
import type { PaperDocument } from "@OpenFarm/domain";
import {
  farmDayOf,
  knownBy,
  maskedDigits,
  mobileNumberOf,
  paperFrom,
} from "@OpenFarm/domain";
import type { Language } from "@OpenFarm/i18n";
import { LANGUAGES, translate } from "@OpenFarm/i18n";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import {
  assertApplicationsTaken,
  hashOfLinkToken,
  linkIsOpen,
} from "./application-links";
import {
  CODE_ATTEMPTS,
  SIGNING_SENDS,
  countFailure,
  forgetFailures,
  lockedOut,
} from "./attempts";
import type { Tx } from "./audit";
import { audited } from "./audit";
import type { Context } from "./context";
import { farmsOwnValues } from "./data-keepers";
import { assertRegistered } from "./export-store";
import { lockTheFarm } from "./farm-lock";
import { ONE_SEND_EVERY_MS, maskedEmail } from "./investor-email";
import { organizationInput, personInput, theRecord } from "./investor-input";
import { keepPaper } from "./kept-paper";
import { hashOfCodeAsTyped } from "./membership";
import { paperNominees } from "./nomination-store";
import { assertNamable, nomineesInput } from "./nominations";
import { tell } from "./notice";
import { madeOn, paperInvestor, paperValues } from "./paper-values";
import { photoInput } from "./photo-input";
import { refused } from "./portal-invitable";
import { theNoticeToRead } from "./portal-reads";
import { ownerNameOf } from "./portal-store";
import { pushRaised } from "./push-send";
import { currentWording } from "./template-store";

// What an Application Link opens (ADR 0034), for somebody who is not signed in and never has been: the code texted to
// the link's mobile, which opens it for a sitting; the Investor Details Form filled in; the Portal Consent laid out from
// it and agreed with a second code, which is their signature; and the Application sent, for the Owner to answer.

/** How long a code texted for a link may be entered. */
export const APPLY_CODE_LIFETIME_MS = 10 * 60_000;

/** How long a link stands open once its code is entered: a sitting, long enough to find the NID and take its photos. */
export const SITTING_MS = 3 * 60 * 60_000;

/** Digits in a code: six, as a Signing Code's. */
const CODE_DIGITS = 6;

/** Bangla digits as a Bangla keyboard types them, read as theirs, and anything not a digit left out. */
const BANGLA_DIGIT = /[০-৯]/gu;
const BANGLA_DIGITS = "০১২৩৪৫৬৭৮৯";
const NOT_A_DIGIT = /\D/gu;
const codeAsTyped = (typed: string): string =>
  typed
    .replaceAll(BANGLA_DIGIT, (one) => String(BANGLA_DIGITS.indexOf(one)))
    .replaceAll(NOT_A_DIGIT, "");

const newCode = (): string =>
  Array.from(crypto.getRandomValues(new Uint32Array(CODE_DIGITS)), (one) =>
    String(one % 10)
  ).join("");

/** A sitting's key, given once the opening code is entered: hard to guess, so a plain hash keeps it. */
const newKey = (): string =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");

/** The farm, as somebody outside it reaches it. */
type Visiting = Context & { farm: NonNullable<Context["farm"]> };

/**
 * One answer for every link that opens nothing — a wrong one, one run out, used, withdrawn, or one while the farm takes
 * no Applications — so a stranger cannot tell which, and the person it was for is told what to do either way.
 */
const opensNothing = () =>
  new ORPCError("NOT_FOUND", {
    message: "This link opens nothing now: ask the farm for another",
    data: { refusal: "link_opens_nothing" },
  });

type LinkRow = typeof applicationLink.$inferSelect;

/** The link a token opens, on a farm that takes Applications; refused alike otherwise. */
const linkOf = async (
  context: Context,
  token: string
): Promise<{ link: LinkRow; farm: Visiting }> => {
  const theFarm = context.farm;
  if (!theFarm) {
    throw opensNothing();
  }
  const visiting = context as Visiting;
  try {
    await assertApplicationsTaken(visiting);
  } catch {
    throw opensNothing();
  }
  const link = await context.db.query.applicationLink.findFirst({
    where: { farmId: theFarm.id, tokenHash: await hashOfLinkToken(token) },
  });
  if (!(link && linkIsOpen(link, context.clock.now()))) {
    throw opensNothing();
  }
  return { link, farm: visiting };
};

/** The link a token opens, with the key of a sitting still running; a sitting run out is said as such. */
const sittingOf = async (context: Context, token: string, key: string) => {
  const found = await linkOf(context, token);
  const now = context.clock.now();
  const { link } = found;
  const keyHash = await hashOfLinkToken(key);
  if (
    !(link.openKeyHash && link.openKeyExpiresAt) ||
    link.openKeyHash !== keyHash ||
    link.openKeyExpiresAt <= now
  ) {
    throw refused(
      "That sitting has ended: ask for a new code to open the link again",
      "sitting_ended"
    );
  }
  return found;
};

/** A link as the trail keeps it: everything but its secret and its key. */
const readLinkForTrail = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  id: string
) =>
  (await tx.query.applicationLink.findFirst({
    where: { id, farmId },
    columns: { tokenHash: false, openKeyHash: false },
  })) ?? null;

/** Where a link's codes go, mostly hidden: by text to its mobile while the farm can text, and to its email while the
 *  farm can send email (the Owner, 2026-11-08: no text gateway yet). */
const waysOf = (context: Context, link: LinkRow) => {
  const mobile = mobileNumberOf(link.phone);
  return {
    sms: context.sms.sends && mobile ? mobile : null,
    email: context.email.sends && link.email ? link.email : null,
  };
};

/** The ways a link's codes go, as a page says them: mostly hidden, nothing for a way the farm cannot use. */
const waysSaid = (context: Context, link: LinkRow) => {
  const ways = waysOf(context, link);
  return {
    bySms: ways.sms ? maskedDigits(link.phone) : null,
    byEmail: ways.email ? maskedEmail(ways.email) : null,
  };
};

/** The farm's name and where the code goes, mostly hidden: all a link says before its code is entered, since an email
 *  typed with one wrong letter reaches a stranger. */
export const openLink = async (context: Context, token: string) => {
  const { link, farm } = await linkOf(context, token);
  return {
    farmName: farm.farm.name,
    ...waysSaid(context, link),
    expiresAt: link.expiresAt,
  };
};

/** What a code's message says it is for, in the language they chose. */
const codeText = (
  purpose: ApplicationCodePurpose,
  language: Language,
  facts: { farm: string; code: string; minutes: number }
) => translate(language, `portal.apply.code.${purpose}`, facts);

/** A code that differs from another, so the one entered says which way it came. */
const anotherCode = (than: string | null): string => {
  let code = newCode();
  while (code === than) {
    code = newCode();
  }
  return code;
};

/** One code by text and another by email, each where the farm has a way to send it; what went, and the codes. */
const sendTheCodes = async (
  context: Context,
  ways: { sms: string | null; email: string | null },
  what: {
    purpose: ApplicationCodePurpose;
    language: Language;
    minutes: number;
  },
  farmName: string
) => {
  const byText = ways.sms ? newCode() : null;
  const byEmail = ways.email ? anotherCode(byText) : null;
  const words = (code: string) =>
    codeText(what.purpose, what.language, {
      farm: farmName,
      code,
      minutes: what.minutes,
    });
  const [texted, emailed] = await Promise.all([
    ways.sms && byText
      ? context.sms.send(ways.sms, { text: words(byText), lang: what.language })
      : { delivered: false },
    ways.email && byEmail
      ? context.email.send(ways.email, {
          subject: `${farmName}: ${translate(what.language, "portal.apply.code.subject")}`,
          text: words(byEmail),
        })
      : { delivered: false },
  ]);
  return { byText, byEmail, texted, emailed };
};

/**
 * Sends the codes for a link to its own mobile and email, and nowhere else: one by text while the farm can text, and
 * another by email while it can send email — to open it, or within a sitting to agree the Portal Consent. One a minute
 * for each purpose, and five an hour for a link in all; refused when neither went.
 */
export const sendApplyCode = async (
  context: Context,
  input: {
    token: string;
    purpose: ApplicationCodePurpose;
    key?: string;
    language: Language;
  }
): Promise<{
  bySms: string | null;
  byEmail: string | null;
  minutes: number;
}> => {
  const { link, farm } =
    input.purpose === "agree"
      ? await sittingOf(context, input.token, input.key ?? "")
      : await linkOf(context, input.token);
  const now = context.clock.now();
  const ways = waysOf(context, link);
  if (!(ways.sms || ways.email)) {
    throw opensNothing();
  }
  const sends = `application-send:${link.id}`;
  const last = await context.db.query.applicationCode.findFirst({
    where: { linkId: link.id, purpose: input.purpose },
    columns: { sentAt: true },
  });
  if (
    lockedOut(sends, now, SIGNING_SENDS) ||
    (last && now.getTime() - last.sentAt.getTime() < ONE_SEND_EVERY_MS)
  ) {
    throw new ORPCError("TOO_MANY_REQUESTS", {
      message: "A code was sent just now — wait a minute",
      data: { refusal: "code_sent_just_now" },
    });
  }
  countFailure(sends, now, SIGNING_SENDS);
  const minutes = APPLY_CODE_LIFETIME_MS / 60_000;
  const { byText, byEmail, texted, emailed } = await sendTheCodes(
    context,
    ways,
    { purpose: input.purpose, language: input.language, minutes },
    farm.farm.name
  );
  if (!(texted.delivered || emailed.delivered)) {
    throw refused(
      "The code did not go — try again in a minute",
      "code_not_sent"
    );
  }
  const said = waysSaid(context, link);
  const row = {
    farmId: link.farmId,
    linkId: link.id,
    purpose: input.purpose,
    codeHash:
      texted.delivered && byText ? await hashOfCodeAsTyped(byText) : null,
    sentTo: texted.delivered ? said.bySms : null,
    emailCodeHash:
      emailed.delivered && byEmail ? await hashOfCodeAsTyped(byEmail) : null,
    emailTo: emailed.delivered ? said.byEmail : null,
    sentAt: now,
    expiresAt: new Date(now.getTime() + APPLY_CODE_LIFETIME_MS),
    usedAt: null,
  };
  await context.db
    .insert(applicationCode)
    .values({ id: uuidv7(now), ...row })
    .onConflictDoUpdate({
      target: [applicationCode.linkId, applicationCode.purpose],
      set: row,
    });
  return { bySms: row.sentTo, byEmail: row.emailTo, minutes };
};

/**
 * The code entered for a link and a purpose, checked: one of the last ones sent, unexpired and unused, and which way it
 * came. Every try is counted before it is checked, ten wrong in a quarter hour stopping them; the right one forgets the
 * count. Not yet used: the caller marks it used in the write it opens (`useCode`).
 */
const checkCode = async (
  context: Context,
  link: LinkRow,
  purpose: ApplicationCodePurpose,
  typed: string
) => {
  const now = context.clock.now();
  const guesses = `application-code:${link.id}`;
  if (lockedOut(guesses, now, CODE_ATTEMPTS)) {
    throw new ORPCError("TOO_MANY_REQUESTS", {
      message: "Too many wrong codes — wait fifteen minutes",
      data: { refusal: "too_many_codes" },
    });
  }
  // Counted now, with nothing awaited since the check, as every code the farm takes is.
  countFailure(guesses, now, CODE_ATTEMPTS);
  const sent = await context.db.query.applicationCode.findFirst({
    where: { linkId: link.id, purpose },
  });
  const hash = await hashOfCodeAsTyped(codeAsTyped(typed));
  const channel: ApplicationCodeChannel | null =
    (sent?.codeHash === hash && "sms") ||
    (sent?.emailCodeHash === hash && "email") ||
    null;
  if (!(sent && channel)) {
    throw refused("That is not the code we sent", "wrong_code");
  }
  if (sent.usedAt) {
    throw refused("That code was used already", "code_used");
  }
  if (sent.expiresAt <= now) {
    throw refused("That code has run out — ask for another", "code_expired");
  }
  forgetFailures(guesses);
  return {
    id: sent.id,
    channel,
    sentTo: (channel === "sms" ? sent.sentTo : sent.emailTo) ?? "",
    sentAt: sent.sentAt,
  };
};

/** Marks a code used in the write it opens, refused if another request used it meanwhile. */
const useCode = async (tx: Tx, codeId: string, now: Date) => {
  const [used] = await tx
    .update(applicationCode)
    .set({ usedAt: now })
    .where(and(eq(applicationCode.id, codeId), isNull(applicationCode.usedAt)))
    .returning({ id: applicationCode.id });
  if (!used) {
    throw refused("That code was used already", "code_used");
  }
};

/** What the form opens on: who the link was made for, as the Owner wrote them down, and the farm's privacy notice. */
const theForm = async (context: Context, link: LinkRow, farm: Visiting) => ({
  farmName: farm.farm.name,
  kind: link.kind,
  name: link.name,
  mobile: maskedDigits(link.phone),
  ...waysSaid(context, link),
  email: link.email,
  sittingEndsAt: link.openKeyExpiresAt,
  privacyNotice: await theNoticeToRead(context.db, farm.farm),
});

/**
 * The opening code entered: the link opens for a sitting, and answers the key that holds it open, with what the form
 * opens on. A code that opens it once more starts a new sitting, the old key standing no longer.
 */
export const unlockLink = async (
  context: Context,
  input: { token: string; code: string }
) => {
  const { link, farm } = await linkOf(context, input.token);
  const sent = await checkCode(context, link, "open", input.code);
  const now = context.clock.now();
  const key = newKey();
  const keyHash = await hashOfLinkToken(key);
  await audited(context).write(
    {
      entity: "application_link",
      entityId: link.id,
      action: "update",
      before: (tx) => readLinkForTrail(tx, link.farmId, link.id),
      after: (tx) => readLinkForTrail(tx, link.farmId, link.id),
    },
    async (tx) => {
      await useCode(tx, sent.id, now);
      await tx
        .update(applicationLink)
        .set({
          openKeyHash: keyHash,
          openKeyExpiresAt: new Date(now.getTime() + SITTING_MS),
          openedAt: link.openedAt ?? now,
        })
        .where(eq(applicationLink.id, link.id));
    }
  );
  const opened = await context.db.query.applicationLink.findFirst({
    where: { id: link.id },
  });
  return { key, ...(await theForm(context, opened ?? link, farm)) };
};

/** What the form opens on, again, for a sitting already open — the page read afresh. */
export const formOf = async (
  context: Context,
  input: { token: string; key: string }
) => {
  const { link, farm } = await sittingOf(context, input.token, input.key);
  return theForm(context, link, farm);
};

/** What the person fills in: the Investor Details Form's parts, their mobile left out, since it is the link's. */
export const applicationRecord = z.union([
  organizationInput.omit({ phone: true }),
  personInput.omit({ phone: true }).extend({ kind: z.literal("person") }),
]);
export type ApplicationRecord = z.infer<typeof applicationRecord>;

/** The form as it comes, before the photos: the record, the Nominees they would name, and the language they read. */
export const applicationForm = z.object({
  token: z.string().min(1).max(200),
  key: z.string().min(1).max(200),
  language: z.enum(LANGUAGES),
  record: applicationRecord,
  nominees: nomineesInput.default([]),
});
export type ApplicationForm = z.infer<typeof applicationForm>;

/** The most of one photograph an Application carries: four of them and the form go up together, under the 8 MB a
 *  request may be on the Investor address (the deploy runbook), where a Pay-in Note's one slip may be larger. */
export const APPLICATION_PHOTO_MAX_BYTES = 1_500_000;
const applicationPhoto = photoInput.extend({
  data: z.string().min(1).max(APPLICATION_PHOTO_MAX_BYTES),
});

/** The photographs an Application carries. An Organization sends all four; a person the NID's two sides. */
export const applicationPhotos = z.object({
  nid_front: applicationPhoto,
  nid_back: applicationPhoto,
  trade_license: applicationPhoto.optional(),
  authority: applicationPhoto.optional(),
});

/** What the Owner needs from somebody they will not meet, refused by name: an address, an NID number, and the bank
 *  account they are paid into; an Organization its trade license and its Signatory's NID too. The kind is the link's. */
const assertComplete = (link: LinkRow, record: ApplicationRecord) => {
  if (record.kind !== link.kind) {
    throw refused(
      "The link was made for a person, or for an Organization: fill in that form",
      "application_kind_fixed"
    );
  }
  const missing: string[] = [];
  if (!record.address) {
    missing.push("address");
  }
  if (!record.bankAccount) {
    missing.push("bankAccount");
  }
  if (record.kind === "person" && !record.nid) {
    missing.push("nid");
  }
  if (record.kind === "organization") {
    if (!record.tradeLicense) {
      missing.push("tradeLicense");
    }
    if (!record.signatoryNid) {
      missing.push("signatoryNid");
    }
  }
  if (missing.length > 0) {
    throw new ORPCError("BAD_REQUEST", {
      message: `Still to fill in: ${missing.join(", ")}`,
      data: { refusal: "application_incomplete", missing },
    });
  }
};

/** The Nominees as a paper on `today` keeps them: none for an Organization, whose share is its own (ADR 0020). */
const theNominees = (form: ApplicationForm, today: string) => {
  if (form.record.kind === "organization") {
    if (form.nominees.length > 0) {
      throw refused(
        "An Organization names no Nominee: its share is its own",
        "organization_names_no_nominee"
      );
    }
    return [];
  }
  const nominees = form.nominees.map((one) => knownBy(one, today));
  assertNamable(nominees, today);
  return nominees;
};

/**
 * The Portal Consent laid out for them at a moment, from what they filled in: the wording in force, their name, phone,
 * address and NID in it, as the paper they would sign in front of the Owner has them. Laid out again at the same
 * moment when they send it, the same form gives the same paper — which is how the paper agreed is shown to be the paper
 * read.
 */
const consentLaidOut = async (
  context: Context,
  farm: Visiting,
  link: LinkRow,
  form: ApplicationForm,
  at: Date
) => {
  assertRegistered(farm.farm, "portal_consent");
  const wording = await currentWording(
    context.db,
    farm.farm.id,
    "portal_consent"
  );
  const ownerName = await ownerNameOf(context.db, farm.farm.id);
  const today = farmDayOf(at);
  const nominees = theNominees(form, today);
  const him = paperInvestor(
    {
      ...form.record,
      phone: link.phone,
      address: form.record.address ?? null,
      nid: form.record.kind === "person" ? (form.record.nid ?? null) : null,
    },
    paperNominees({ nominees }, today)
  );
  const values = {
    ...(await farmsOwnValues(context.db, farm.farm, ownerName)),
    ...paperValues({ farm: farm.farm, ownerName, him }),
  };
  const paper: PaperDocument = paperFrom(wording.content, {
    kind: "portal_consent",
    parties: { farm: farm.farm, ownerName, investors: [him] },
    values,
    producedBy: ownerName,
    producedAt: madeOn(at),
    version: wording.number,
  });
  return { ...keepPaper(paper), wording, nominees };
};

/**
 * The Portal Consent to read before agreeing to it, laid out from the form as it stands: the paper, its fingerprint,
 * and the moment it was laid out, which sending it gives back.
 */
export const consentToRead = async (
  context: Context,
  form: ApplicationForm
): Promise<{ paper: PaperDocument; paperHash: string; laidAt: Date }> => {
  const { link, farm } = await sittingOf(context, form.token, form.key);
  assertComplete(link, form.record);
  const laidAt = context.clock.now();
  const laid = await consentLaidOut(context, farm, link, form, laidAt);
  return { paper: laid.paper, paperHash: laid.paperHash, laidAt };
};

/** Which photographs an Application must carry, by kind. */
const PHOTOS_NEEDED: Record<LinkRow["kind"], readonly ApplicationPhotoKind[]> =
  {
    person: ["nid_front", "nid_back"],
    organization: ["nid_front", "nid_back", "trade_license", "authority"],
  };

/** An Application as the trail keeps it: who, and where it stands — never their NID, bank or Nominees, which are
 *  cleared from a declined one and must not outlive it in the trail. */
export const readApplicationForTrail = async (
  tx: Pick<Tx, "query">,
  farmId: string,
  id: string
) =>
  (await tx.query.investorApplication.findFirst({
    where: { id, farmId },
    columns: {
      id: true,
      linkId: true,
      kind: true,
      name: true,
      phone: true,
      state: true,
      sentAt: true,
      consentVersionId: true,
      consentPaperHash: true,
      answeredAt: true,
      answeredBy: true,
      answerLine: true,
      investorId: true,
      clearedAt: true,
    },
  })) ?? null;

/**
 * The Application sent: the form, the photographs, and the code that agrees the Portal Consent laid out at `laidAt` —
 * which must be the paper they read, laid out within this sitting, and the wording still in force. In one write: the
 * Application kept with its proof, the code and the link used up, and the Owner told at once.
 */
export const sendApplication = async (
  context: Context,
  input: ApplicationForm & {
    photos: z.infer<typeof applicationPhotos>;
    laidAt: Date;
    paperHash: string;
    code: string;
  }
): Promise<{ sent: true }> => {
  const { link, farm } = await sittingOf(context, input.token, input.key);
  assertComplete(link, input.record);
  const missingPhotos = PHOTOS_NEEDED[link.kind].filter(
    (what) => !input.photos[what]
  );
  if (missingPhotos.length > 0) {
    throw new ORPCError("BAD_REQUEST", {
      message: `Still to photograph: ${missingPhotos.join(", ")}`,
      data: { refusal: "photos_missing", missing: missingPhotos },
    });
  }
  const now = context.clock.now();
  const read = input.laidAt.getTime();
  if (read > now.getTime() || now.getTime() - read > SITTING_MS) {
    throw refused(
      "The consent you read is from another sitting: read it again",
      "consent_changed"
    );
  }
  const laid = await consentLaidOut(context, farm, link, input, input.laidAt);
  if (laid.paperHash !== input.paperHash) {
    throw refused(
      "The consent changed since you read it: read it again before agreeing",
      "consent_changed"
    );
  }
  const sent = await checkCode(context, link, "agree", input.code);
  const id = uuidv7(now);
  const { record } = input;
  let raised: Awaited<ReturnType<typeof tell>> = [];
  await audited(context).write(
    {
      entity: "investor_application",
      entityId: id,
      action: "create",
      after: (tx) => readApplicationForTrail(tx, link.farmId, id),
    },
    async (tx) => {
      await lockTheFarm(tx, link.farmId);
      const [usedUp] = await tx
        .update(applicationLink)
        .set({ usedAt: now, openKeyHash: null, openKeyExpiresAt: null })
        .where(
          and(
            eq(applicationLink.id, link.id),
            isNull(applicationLink.usedAt),
            isNull(applicationLink.withdrawnAt)
          )
        )
        .returning({ id: applicationLink.id });
      if (!usedUp) {
        throw opensNothing();
      }
      await useCode(tx, sent.id, now);
      await tx.insert(investorApplication).values({
        id,
        farmId: link.farmId,
        linkId: link.id,
        // Written down as the Owner would write them, the mobile the link's.
        ...theRecord({ ...input.record, phone: link.phone }),
        nominees: laid.nominees,
        language: input.language,
        consentVersionId: laid.wording.versionId,
        consentPaper: laid.paper,
        consentPaperHash: laid.paperHash,
        codeChannel: sent.channel,
        codeSentTo: sent.sentTo,
        codeSentAt: sent.sentAt,
        callerAddress: context.callerAddress,
        callerAgent: context.callerAgent,
        sentAt: now,
        state: "waiting",
      });
      await tx.insert(investorApplicationPhoto).values(
        PHOTOS_NEEDED[link.kind].flatMap((what) => {
          const photo = input.photos[what];
          return photo
            ? [
                {
                  id: uuidv7(now),
                  farmId: link.farmId,
                  applicationId: id,
                  what,
                  contentType: photo.contentType,
                  data: photo.data,
                  createdAt: now,
                },
              ]
            : [];
        })
      );
      raised = await tell(
        tx,
        link.farmId,
        {
          kind: "application_sent",
          about: { id },
          facts: { applicationId: id, name: record.name, kind: record.kind },
        },
        now
      );
    }
  );
  await pushRaised(context as Visiting, raised, now);
  return { sent: true };
};
