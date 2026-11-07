import { auditEvent } from "@OpenFarm/db/schema/audit";
import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

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

const as = async (role: "owner" | "manager" | null, at = JANUARY) => {
  const { client } = await createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(at),
    sms: textsKept,
  });
  return client;
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
const aLink = async (kind: "person" | "organization" = "person") => {
  const owner = await as("owner");
  const phone = aMobile();
  const name = `${kind === "person" ? "করিম" : "মেঘনা ডেইরি"} ${suffix} ${phones}`;
  const made = await owner.investors.applications.makeLink({
    kind,
    name,
    phone,
    email: `apply.${suffix}.${phones}@example.com`,
    send: false,
  });
  return {
    id: made.id,
    token: made.address.split("/portal/apply/")[1] ?? "",
    phone,
    name,
  };
};

/** The link opened with the code texted to its mobile: the sitting's key. */
const opened = async (link: { token: string; phone: string }) => {
  const nobody = await as(null);
  await nobody.portal.apply.sendCode({
    token: link.token,
    purpose: "open",
    language: "bn",
  });
  const unlocked = await nobody.portal.apply.unlock({
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
const applied = async (link: Awaited<ReturnType<typeof aLink>>) => {
  const key = await opened(link);
  const nobody = await as(null);
  const form = aPersonsForm(link, key);
  const read = await nobody.portal.apply.consent(form);
  await nobody.portal.apply.sendCode({
    token: link.token,
    purpose: "agree",
    key,
    language: "bn",
  });
  return nobody.portal.apply.send({
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
  await owner.investors.setPortalOpen({ open: true });
  const again = await as("owner");
  await again.investors.setApplicationsOpen({ shown: true });
});

describe("a link opened", () => {
  it("names nobody before its code: only the farm and the mobile, mostly hidden", async () => {
    const link = await aLink();
    const nobody = await as(null);
    const said = await nobody.portal.apply.open({ token: link.token });
    expect(Object.keys(said).toSorted()).toEqual([
      "expiresAt",
      "farmName",
      "mobile",
    ]);
    expect(JSON.stringify(said)).not.toContain(link.name);
    expect(said.mobile).not.toContain(link.phone.slice(0, 7));
  });

  it("texts its code to the link's mobile, and opens the form on who the Owner made it for", async () => {
    const link = await aLink();
    const key = await opened(link);
    expect(textsTo(link.phone)).toHaveLength(1);
    const nobody = await as(null);
    const form = await nobody.portal.apply.form({ token: link.token, key });
    expect(form).toMatchObject({ name: link.name, kind: "person" });
  });

  it("answers alike for a wrong secret, a withdrawn link and a used one", async () => {
    const nobody = await as(null);
    expect(
      await refusalOf(nobody.portal.apply.open({ token: "not-a-link-at-all" }))
    ).toBe("link_opens_nothing");
    const withdrawn = await aLink();
    const owner = await as("owner");
    await owner.investors.applications.withdrawLink({ id: withdrawn.id });
    expect(
      await refusalOf(nobody.portal.apply.open({ token: withdrawn.token }))
    ).toBe("link_opens_nothing");
    const used = await aLink();
    await applied(used);
    expect(
      await refusalOf(nobody.portal.apply.open({ token: used.token }))
    ).toBe("link_opens_nothing");
  });

  it("stops somebody guessing at its code", async () => {
    const link = await aLink();
    const nobody = await as(null);
    await nobody.portal.apply.sendCode({
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
        nobody.portal.apply.unlock({ token: link.token, code: wrong })
      );
      expect(said).toBe("wrong_code");
    }
    expect(
      await refusalOf(
        nobody.portal.apply.unlock({ token: link.token, code: right })
      )
    ).toBe("too_many_codes");
  });

  it("holds a sitting for three hours, and no longer", async () => {
    const link = await aLink();
    const key = await opened(link);
    const later = await as(null, FOUR_HOURS_LATER);
    expect(
      await refusalOf(later.portal.apply.form({ token: link.token, key }))
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
    const read = await nobody.portal.apply.consent(form);
    expect(
      await refusalOf(
        nobody.portal.apply.send({
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
    const read = await nobody.portal.apply.consent(aPersonsForm(link, key));
    await nobody.portal.apply.sendCode({
      token: link.token,
      purpose: "agree",
      key,
      language: "bn",
    });
    expect(
      await refusalOf(
        nobody.portal.apply.send({
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
        nobody.portal.apply.consent({
          ...form,
          record: { ...form.record, nid: undefined },
        })
      )
    ).toBe("application_incomplete");
    const read = await nobody.portal.apply.consent(form);
    await nobody.portal.apply.sendCode({
      token: link.token,
      purpose: "agree",
      key,
      language: "bn",
    });
    const sending = nobody.portal.apply.send({
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
      await refusalOf(nobody.portal.apply.consent(aPersonsForm(link, key)))
    ).toBe("application_kind_fixed");
  });

  it("texts no code to agree before the link is open", async () => {
    const link = await aLink();
    const nobody = await as(null, A_MINUTE_LATER);
    expect(
      await refusalOf(
        nobody.portal.apply.sendCode({
          token: link.token,
          purpose: "agree",
          key: "no-such-key",
          language: "bn",
        })
      )
    ).toBe("sitting_ended");
  });
});
