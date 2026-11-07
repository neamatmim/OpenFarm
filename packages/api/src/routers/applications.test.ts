import { auditEvent } from "@OpenFarm/db/schema/audit";
import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { EmailMessage, EmailTransport } from "../email";
import { silentSms } from "../sms";
import { createTestClient } from "../test/client";
import { codeTextedTo, textsKept, textsTo } from "../test/portal-client";
import { appRouter } from "./index";

// Applying by an Application Link (ADR 0034): the code texted to the link's mobile opens it for a sitting, the person
// fills in their own details and photographs their NID, reads the Portal Consent laid out from them, and agrees it with
// a second code. The Owner is told at once.

const suffix = `${Date.now()}`.slice(-6);
const JANUARY = "2099-01-01T04:00:00.000Z";
const A_MINUTE_LATER = "2099-01-01T04:01:00.000Z";
const FOUR_HOURS_LATER = "2099-01-01T08:00:00.000Z";

let phones = 0;
const aMobile = () => {
  phones += 1;
  return `017${String(phones).padStart(2, "0")}${suffix}`;
};

/** A mail account that keeps what it was given, shared by the file: the farm's own. */
const mailed: { to: string; message: EmailMessage }[] = [];
const mailKept: EmailTransport = {
  sends: true,
  send: (to, message) => {
    mailed.push({ to, message });
    return Promise.resolve({ delivered: true });
  },
};

const as = async (role: "owner" | "manager" | null, at = JANUARY) => {
  const { client } = await createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(at),
    sms: textsKept,
    email: mailKept,
  });
  return client;
};

/** The same, on a farm with no text gateway yet: every code goes by email (the Owner, 2026-11-08). */
const byEmailOnly = async (role: "owner" | null, at = JANUARY) => {
  const { client } = await createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(at),
    sms: silentSms,
    email: mailKept,
  });
  return client;
};

/** The latest email to an address. */
const mailTo = (address: string) =>
  mailed.findLast((one) => one.to === address)?.message.text ?? "";

/** The six-digit code in the latest email to an address. */
const codeMailedTo = (address: string) => {
  const code = mailTo(address).match(/\b\d{6}\b/u)?.[0];
  if (!code) {
    throw new Error(`expected a code emailed to ${address}`);
  }
  return code;
};

const refusalOf = async (act: Promise<unknown>) => {
  try {
    await act;
  } catch (error) {
    return (error as { data?: { refusal?: string } }).data?.refusal;
  }
  throw new Error("expected a refusal");
};

const PHOTO = { contentType: "image/jpeg" as const, data: "aGVsbG8=" };
const NID = `19${suffix}4455`;

/** A link the Owner made for somebody, not sent: its secret, and who it is for. */
const aLink = async (
  kind: "person" | "organization" = "person",
  send = false
) => {
  const owner = await as("owner");
  const phone = aMobile();
  const name = `${kind === "person" ? "করিম" : "মেঘনা ডেইরি"} ${suffix} ${phones}`;
  const made = await owner.investors.applications.makeLink({
    kind,
    name,
    phone,
    email: `apply.${suffix}.${phones}@example.com`,
    send,
  });
  return {
    id: made.id,
    token: made.address.split("/portal/apply/")[1] ?? "",
    phone,
    name,
    email: `apply.${suffix}.${phones}@example.com`,
  };
};

/** The link opened with the code texted to its mobile: the sitting's key. */
const opened = async (link: { token: string; phone: string }) => {
  const nobody = await as(null);
  await nobody.portal.applying.sendCode({
    token: link.token,
    purpose: "open",
    language: "bn",
  });
  const unlocked = await nobody.portal.applying.unlock({
    token: link.token,
    code: codeTextedTo(link.phone),
  });
  return unlocked.key;
};

/** The form a person fills in. */
const aPersonsForm = (
  link: { token: string; name: string },
  key: string,
  nid = NID
) => ({
  token: link.token,
  key,
  language: "bn" as const,
  record: {
    kind: "person" as const,
    name: link.name,
    address: "সাভার, ঢাকা",
    nid,
    bankAccount: "করিম মিয়া, ০১২৩৪৫৬৭৮৯, সোনালী ব্যাংক, সাভার",
  },
  nominees: [],
});

/** The consent read and agreed with the code texted for it, and the Application sent. */
const applied = async (
  link: Awaited<ReturnType<typeof aLink>>,
  email: string | undefined = link.email
) => {
  const key = await opened(link);
  const nobody = await as(null);
  const filled = aPersonsForm(link, key);
  const form = { ...filled, record: { ...filled.record, email } };
  const read = await nobody.portal.applying.consent(form);
  await nobody.portal.applying.sendCode({
    token: link.token,
    purpose: "agree",
    key,
    language: "bn",
  });
  return nobody.portal.applying.send({
    ...form,
    photos: { nid_front: PHOTO, nid_back: PHOTO },
    laidAt: read.laidAt,
    paperHash: read.paperHash,
    code: codeTextedTo(link.phone),
  });
};

beforeAll(async () => {
  const owner = await as("owner");
  await owner.farm.setIdentity({
    address: `সাভার, ঢাকা ${suffix}`,
    phone: "+8801711000098",
    registrationNumber: `DLS/SAV/2099/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2100-03-31",
  });
  await owner.farm.setDataKeepers({
    dataHost: `হোস্ট ${suffix}`,
    backupStore: `ভাণ্ডার ${suffix}`,
    backupCountry: "সিঙ্গাপুর",
  });
  await owner.investors.setPortalOpen({ open: true });
  const again = await as("owner");
  await again.investors.setApplicationsOpen({ shown: true });
});

describe("a link opened", () => {
  it("names nobody before its code: only the farm and the mobile, mostly hidden", async () => {
    const link = await aLink();
    const nobody = await as(null);
    const said = await nobody.portal.applying.open({ token: link.token });
    expect(Object.keys(said).toSorted()).toEqual([
      "byEmail",
      "bySms",
      "expiresAt",
      "farmName",
    ]);
    expect(JSON.stringify(said)).not.toContain(link.name);
    expect(said.bySms).not.toContain(link.phone.slice(0, 7));
    expect(said.byEmail).not.toContain(link.email);
  });

  it("texts its code to the link's mobile, and opens the form on who the Owner made it for", async () => {
    const link = await aLink();
    const key = await opened(link);
    expect(textsTo(link.phone)).toHaveLength(1);
    const nobody = await as(null);
    const form = await nobody.portal.applying.form({ token: link.token, key });
    expect(form).toMatchObject({ name: link.name, kind: "person" });
  });

  it("answers alike for a wrong secret, a withdrawn link and a used one", async () => {
    const nobody = await as(null);
    expect(
      await refusalOf(
        nobody.portal.applying.open({ token: "not-a-link-at-all" })
      )
    ).toBe("link_opens_nothing");
    const withdrawn = await aLink();
    const owner = await as("owner");
    await owner.investors.applications.withdrawLink({ id: withdrawn.id });
    expect(
      await refusalOf(nobody.portal.applying.open({ token: withdrawn.token }))
    ).toBe("link_opens_nothing");
    const used = await aLink();
    await applied(used);
    expect(
      await refusalOf(nobody.portal.applying.open({ token: used.token }))
    ).toBe("link_opens_nothing");
  });

  it("stops somebody guessing at its code", async () => {
    const link = await aLink();
    const nobody = await as(null);
    await nobody.portal.applying.sendCode({
      token: link.token,
      purpose: "open",
      language: "bn",
    });
    const right = codeTextedTo(link.phone);
    const wrong = right === "000000" ? "111111" : "000000";
    for (let tries = 0; tries < 10; tries += 1) {
      // One guess at a time, as somebody typing them sends them.
      // oxlint-disable-next-line no-await-in-loop
      const said = await refusalOf(
        nobody.portal.applying.unlock({ token: link.token, code: wrong })
      );
      expect(said).toBe("wrong_code");
    }
    expect(
      await refusalOf(
        nobody.portal.applying.unlock({ token: link.token, code: right })
      )
    ).toBe("too_many_codes");
  });

  it("holds a sitting for three hours, and no longer", async () => {
    const link = await aLink();
    const key = await opened(link);
    const later = await as(null, FOUR_HOURS_LATER);
    expect(
      await refusalOf(later.portal.applying.form({ token: link.token, key }))
    ).toBe("sitting_ended");
  });
});

describe("an Application sent", () => {
  it("waits for the Owner, who is told at once, and the Manager is not", async () => {
    const link = await aLink();
    await applied(link);
    const application = await scratchDb().query.investorApplication.findFirst({
      where: { linkId: link.id },
    });
    expect(application).toMatchObject({
      state: "waiting",
      name: link.name,
      phone: link.phone,
      nid: NID,
      codeSentTo: expect.any(String),
    });
    const owner = await as("owner");
    const told = await owner.alerts.mine({});
    expect(
      told.some(
        (one) =>
          one.kind === "application_sent" &&
          (one.params as { applicationId?: string }).applicationId ===
            application?.id
      )
    ).toBe(true);
    const manager = await as("manager");
    const notTold = await manager.alerts.mine({});
    expect(notTold.some((one) => one.kind === "application_sent")).toBe(false);
  });

  it("uses the link up: a second one is not taken", async () => {
    const link = await aLink();
    await applied(link);
    expect(await refusalOf(applied(link))).toBe("link_opens_nothing");
  });

  it("keeps their NID, bank and Nominees out of the trail", async () => {
    const link = await aLink();
    await applied(link);
    const application = await scratchDb().query.investorApplication.findFirst({
      where: { linkId: link.id },
      columns: { id: true },
    });
    const events = await scratchDb()
      .select()
      .from(auditEvent)
      .where(eq(auditEvent.entityId, application?.id ?? ""));
    expect(events.length).toBeGreaterThan(0);
    const said = JSON.stringify(events);
    expect(said).not.toContain(NID);
    expect(said).not.toContain("সোনালী");
  });

  it("is refused with the opening code: agreeing needs its own", async () => {
    const link = await aLink();
    const key = await opened(link);
    const opening = codeTextedTo(link.phone);
    const nobody = await as(null);
    const form = aPersonsForm(link, key);
    const read = await nobody.portal.applying.consent(form);
    expect(
      await refusalOf(
        nobody.portal.applying.send({
          ...form,
          photos: { nid_front: PHOTO, nid_back: PHOTO },
          laidAt: read.laidAt,
          paperHash: read.paperHash,
          code: opening,
        })
      )
    ).toBe("wrong_code");
  });

  it("is refused for a name changed after the consent naming them was read", async () => {
    const link = await aLink();
    const key = await opened(link);
    const nobody = await as(null);
    const read = await nobody.portal.applying.consent(aPersonsForm(link, key));
    await nobody.portal.applying.sendCode({
      token: link.token,
      purpose: "agree",
      key,
      language: "bn",
    });
    expect(
      await refusalOf(
        nobody.portal.applying.send({
          ...aPersonsForm({ ...link, name: `${link.name} খান` }, key),
          photos: { nid_front: PHOTO, nid_back: PHOTO },
          laidAt: read.laidAt,
          paperHash: read.paperHash,
          code: codeTextedTo(link.phone),
        })
      )
    ).toBe("consent_changed");
  });

  it("needs both sides of the NID photographed, and an address, NID and bank account", async () => {
    const link = await aLink();
    const key = await opened(link);
    const nobody = await as(null);
    const form = aPersonsForm(link, key);
    expect(
      await refusalOf(
        nobody.portal.applying.consent({
          ...form,
          record: { ...form.record, nid: undefined },
        })
      )
    ).toBe("application_incomplete");
    const read = await nobody.portal.applying.consent(form);
    await nobody.portal.applying.sendCode({
      token: link.token,
      purpose: "agree",
      key,
      language: "bn",
    });
    const sending = nobody.portal.applying.send({
      ...form,
      photos: { nid_front: PHOTO } as never,
      laidAt: read.laidAt,
      paperHash: read.paperHash,
      code: codeTextedTo(link.phone),
    });
    await expect(sending).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("is for the kind the link was made for", async () => {
    const link = await aLink("organization");
    const key = await opened(link);
    const nobody = await as(null);
    expect(
      await refusalOf(nobody.portal.applying.consent(aPersonsForm(link, key)))
    ).toBe("application_kind_fixed");
  });

  it("texts no code to agree before the link is open", async () => {
    const link = await aLink();
    const nobody = await as(null, A_MINUTE_LATER);
    expect(
      await refusalOf(
        nobody.portal.applying.sendCode({
          token: link.token,
          purpose: "agree",
          key: "no-such-key",
          language: "bn",
        })
      )
    ).toBe("sitting_ended");
  });
});

/** The Application a link brought back. */
const applicationFrom = async (linkId: string) => {
  const row = await scratchDb().query.investorApplication.findFirst({
    where: { linkId },
    columns: { id: true },
  });
  if (!row) {
    throw new Error("expected an Application");
  }
  return row.id;
};

/** The portal code in a text: eight of the code's own letters and digits. */
const portalCodeIn = (text: string) =>
  text.match(/\b[A-HJ-NP-Z2-9]{8}\b/u)?.[0] ?? "";

describe("the Owner's answer", () => {
  it("approved, writes them down, records the consent they agreed on its day, and texts their first code", async () => {
    const link = await aLink();
    await applied(link);
    const id = await applicationFrom(link.id);
    const owner = await as("owner", A_MINUTE_LATER);
    const approved = await owner.investors.applications.approve({ id });
    expect(approved.code?.bySms).not.toBeNull();

    const them = await scratchDb().query.investor.findFirst({
      where: { id: approved.investorId },
    });
    expect(them).toMatchObject({
      name: link.name,
      phone: link.phone,
      nid: NID,
      kind: "person",
    });
    const consent = await scratchDb().query.portalConsent.findFirst({
      where: { investorId: approved.investorId },
    });
    expect(consent?.withdrawnOn).toBeNull();
    const application = await scratchDb().query.investorApplication.findFirst({
      where: { id },
    });
    expect(application).toMatchObject({
      state: "approved",
      investorId: approved.investorId,
      consentId: consent?.id,
    });

    // The first code, said as one, takes them in as any code does.
    const texted = textsTo(link.phone).at(-1)?.text ?? "";
    const code = portalCodeIn(texted);
    expect(code).not.toBe("");
    const nobody = await as(null, A_MINUTE_LATER);
    const joined = await nobody.portal.join({
      phone: link.phone,
      code,
      password: `notun-pasword-${suffix}`,
    });
    expect(joined.loginEmail).toContain("@");
  });

  it("counts the email confirmed only where it is the one the link was emailed to", async () => {
    const kept = await aLink("person", true);
    await applied(kept);
    const changed = await aLink("person", true);
    await applied(changed, `another.${suffix}@example.com`);
    const owner = await as("owner", A_MINUTE_LATER);
    const one = await owner.investors.applications.approve({
      id: await applicationFrom(kept.id),
    });
    const other = await owner.investors.applications.approve({
      id: await applicationFrom(changed.id),
    });
    expect(one.code?.byEmail).not.toBeNull();
    expect(other.code?.byEmail).toBeNull();
    const confirmed = await scratchDb().query.investor.findFirst({
      where: { id: other.investorId },
      columns: { emailConfirmedAt: true, email: true },
    });
    expect(confirmed).toEqual({
      email: `another.${suffix}@example.com`,
      emailConfirmedAt: null,
    });
  });

  it("is said on their Data Copy: when they applied, where the consent's code went, and the photographs kept", async () => {
    const link = await aLink();
    await applied(link);
    const owner = await as("owner", A_MINUTE_LATER);
    const { investorId } = await owner.investors.applications.approve({
      id: await applicationFrom(link.id),
    });
    const { document } = await owner.investors.dataCopy({ id: investorId });
    const rows = document.sections.flatMap((one) =>
      one.kind === "facts" ? one.rows : []
    );
    const said = rows.find((one) => one.label.en === "Applied online");
    expect(JSON.stringify(said?.value)).toContain("NID, front");
    expect(JSON.stringify(said?.value)).toContain("texted to");
  });

  it("leaves the first code in person for everybody the Owner met", async () => {
    const owner = await as("owner");
    const phone = aMobile();
    const met = await owner.investors.record({
      name: `জসিম ${suffix}`,
      phone,
      address: "সাভার",
      nid: "1234567890",
    });
    await owner.investors.recordConsent({ id: met.id });
    expect(await refusalOf(owner.investors.sendNewCode({ id: met.id }))).toBe(
      "first_code_in_person"
    );
  });

  it("settles the Owner's notice once answered", async () => {
    const link = await aLink();
    await applied(link);
    const id = await applicationFrom(link.id);
    const owner = await as("owner", A_MINUTE_LATER);
    await owner.investors.applications.decline({ id });
    const told = await owner.alerts.mine({});
    expect(
      told.some(
        (one) =>
          one.kind === "application_sent" &&
          one.dismissedAt === null &&
          (one.params as { applicationId?: string }).applicationId === id
      )
    ).toBe(false);
  });

  it("declined, sends them the Owner's line, and is not approved after", async () => {
    const link = await aLink();
    await applied(link);
    const id = await applicationFrom(link.id);
    const owner = await as("owner", A_MINUTE_LATER);
    await owner.investors.applications.decline({
      id,
      line: `আগামী বছর আবার কথা হবে ${suffix}`,
    });
    expect(textsTo(link.phone).at(-1)?.text).toContain(
      `আগামী বছর আবার কথা হবে ${suffix}`
    );
    expect(
      mailed.some(
        (one) =>
          one.to === link.email &&
          one.message.text.includes(`আগামী বছর আবার কথা হবে ${suffix}`)
      )
    ).toBe(true);
    expect(await refusalOf(owner.investors.applications.approve({ id }))).toBe(
      "application_answered"
    );
  });

  it("is refused once somebody on that mobile has become an Investor meanwhile", async () => {
    const link = await aLink();
    await applied(link);
    const owner = await as("owner", A_MINUTE_LATER);
    await owner.investors.record({
      name: `আরেকজন ${suffix}`,
      phone: link.phone,
    });
    expect(
      await refusalOf(
        owner.investors.applications.approve({
          id: await applicationFrom(link.id),
        })
      )
    ).toBe("already_an_investor");
  });

  it("is refused once the consent's wording has changed since they agreed it", async () => {
    const link = await aLink();
    await applied(link);
    const owner = await as("owner", A_MINUTE_LATER);
    const listed = await owner.templates.list();
    const consent = listed.find((one) => one.kind === "portal_consent");
    if (!consent) {
      throw new Error("expected the consent's wording");
    }
    await owner.templates.publish({
      kind: "portal_consent",
      content: consent.current.content,
      note: `a new Version ${suffix}`,
    });
    expect(
      await refusalOf(
        owner.investors.applications.approve({
          id: await applicationFrom(link.id),
        })
      )
    ).toBe("consent_wording_changed");
  });

  it("is the Owner's alone", async () => {
    const link = await aLink();
    await applied(link);
    const manager = await as("manager", A_MINUTE_LATER);
    await expect(
      manager.investors.applications.approve({
        id: await applicationFrom(link.id),
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

/** The day's sweep, run at a moment. */
const sweepAt = async (at: string) => {
  const owner = await as("owner", at);
  await owner.alerts.sweep();
};

const rowOf = (id: string) =>
  scratchDb().query.investorApplication.findFirst({ where: { id } });

/** One field of an Application as it stands. */
const fieldOf = async <Field extends "state" | "nid">(
  id: string,
  field: Field
) => {
  const row = await rowOf(id);
  return row?.[field];
};

const photosOf = (id: string) =>
  scratchDb().query.investorApplicationPhoto.findMany({
    where: { applicationId: id },
    columns: { what: true },
  });

describe("what is not approved", () => {
  const DAY_29 = "2099-01-30T04:00:00.000Z";
  const DAY_30 = "2099-01-31T04:00:00.000Z";
  const DAY_30_AND_A_MINUTE = "2099-01-31T04:01:00.000Z";
  const DAY_90 = "2099-04-01T04:00:00.000Z";

  it("lapses after a month undecided, and leaves the Owner's list", async () => {
    const link = await aLink();
    await applied(link);
    const id = await applicationFrom(link.id);
    await sweepAt(DAY_29);
    expect(await fieldOf(id, "state")).toBe("waiting");
    await sweepAt(DAY_30);
    expect(await fieldOf(id, "state")).toBe("lapsed");
    const owner = await as("owner", DAY_30);
    const told = await owner.alerts.mine({});
    expect(
      told.some(
        (one) =>
          one.kind === "application_sent" &&
          one.dismissedAt === null &&
          (one.params as { applicationId?: string }).applicationId === id
      )
    ).toBe(false);
  });

  it("declined, is cleared a month later: photographs and details gone, the name, mobile and answer kept", async () => {
    const link = await aLink();
    await applied(link);
    const id = await applicationFrom(link.id);
    const owner = await as("owner", A_MINUTE_LATER);
    await owner.investors.applications.decline({ id, line: "এবার নয়" });
    await sweepAt(DAY_30);
    expect(await fieldOf(id, "nid")).toBe(NID);
    expect(await photosOf(id)).toHaveLength(2);
    await sweepAt(DAY_30_AND_A_MINUTE);
    const cleared = await rowOf(id);
    expect(cleared).toMatchObject({
      state: "declined",
      name: link.name,
      phone: link.phone,
      answerLine: "এবার নয়",
      nid: null,
      bankAccount: null,
      address: null,
      email: null,
      nominees: null,
      consentPaper: null,
    });
    expect(cleared?.clearedAt).not.toBeNull();
    expect(await photosOf(id)).toEqual([]);
  });

  it("approved, is never cleared: its photographs are the proof of the Owner's check", async () => {
    const link = await aLink();
    await applied(link);
    const id = await applicationFrom(link.id);
    const owner = await as("owner", A_MINUTE_LATER);
    await owner.investors.applications.approve({ id });
    await sweepAt(DAY_90);
    expect(await fieldOf(id, "nid")).toBe(NID);
    expect(await photosOf(id)).toHaveLength(2);
  });
});

describe("with no text gateway yet", () => {
  /** A link the Owner made and emailed, on a farm that cannot text. */
  const anEmailedLink = async () => {
    const owner = await byEmailOnly("owner");
    const phone = aMobile();
    const email = `by.mail.${suffix}.${phones}@example.com`;
    const name = `সেলিনা ${suffix} ${phones}`;
    const made = await owner.investors.applications.makeLink({
      kind: "person",
      name,
      phone,
      email,
    });
    expect(mailTo(email)).toContain(made.address);
    return {
      id: made.id,
      token: made.address.split("/portal/apply/")[1] ?? "",
      phone,
      email,
      name,
    };
  };

  /** Applying from the codes emailed to them. */
  const appliedByEmail = async (
    link: Awaited<ReturnType<typeof anEmailedLink>>,
    email: string = link.email
  ) => {
    const nobody = await byEmailOnly(null);
    const said = await nobody.portal.applying.open({ token: link.token });
    expect(said.bySms).toBeNull();
    expect(said.byEmail).not.toBeNull();
    await nobody.portal.applying.sendCode({
      token: link.token,
      purpose: "open",
      language: "bn",
    });
    const { key } = await nobody.portal.applying.unlock({
      token: link.token,
      code: codeMailedTo(link.email),
    });
    const filled = aPersonsForm(link, key);
    const form = { ...filled, record: { ...filled.record, email } };
    const read = await nobody.portal.applying.consent(form);
    await nobody.portal.applying.sendCode({
      token: link.token,
      purpose: "agree",
      key,
      language: "bn",
    });
    await nobody.portal.applying.send({
      ...form,
      photos: { nid_front: PHOTO, nid_back: PHOTO },
      laidAt: read.laidAt,
      paperHash: read.paperHash,
      code: codeMailedTo(link.email),
    });
  };

  it("opens, agrees and is approved by email alone, the first code emailed and the email confirmed", async () => {
    const link = await anEmailedLink();
    await appliedByEmail(link);
    expect(textsTo(link.phone)).toEqual([]);
    const application = await scratchDb().query.investorApplication.findFirst({
      where: { linkId: link.id },
    });
    expect(application?.codeChannel).toBe("email");
    const owner = await byEmailOnly("owner", A_MINUTE_LATER);
    const approved = await owner.investors.applications.approve({
      id: application?.id ?? "",
    });
    expect(approved.code).toMatchObject({ bySms: null });
    expect(approved.code?.byEmail).not.toBeNull();
    const them = await scratchDb().query.investor.findFirst({
      where: { id: approved.investorId },
      columns: { emailConfirmedAt: true },
    });
    expect(them?.emailConfirmedAt).not.toBeNull();
    // The emailed first code takes them in with their mobile, as a texted one would.
    const code = mailTo(link.email).match(/\b[A-HJ-NP-Z2-9]{8}\b/u)?.[0] ?? "";
    const nobody = await byEmailOnly(null, A_MINUTE_LATER);
    const joined = await nobody.portal.join({
      phone: link.phone,
      code,
      password: `notun-pasword-${suffix}`,
    });
    expect(joined.loginEmail).toContain("@");
  });

  it("is not approved when their email changed and the farm cannot text: the first code would go nowhere", async () => {
    const link = await anEmailedLink();
    await appliedByEmail(link, `changed.${suffix}@example.com`);
    const owner = await byEmailOnly("owner", A_MINUTE_LATER);
    expect(
      await refusalOf(
        owner.investors.applications.approve({
          id: await applicationFrom(link.id),
        })
      )
    ).toBe("no_way_to_send_first_code");
  });
});
