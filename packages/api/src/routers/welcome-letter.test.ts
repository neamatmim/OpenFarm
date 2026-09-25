import { inspect } from "node:util";

import { FakeClock, thePerson } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { invitedWithConsent } from "../test/portal-client";
import { appRouter } from "./index";

// The Welcome Letter and its Code Slip (the glossary's entries): printed from the Owner's code dialog while the code is
// on screen — the letter with a first invitation, the slip alone for every code after. The farm lays out what goes
// round the code; the code itself never leaves the Owner's screen, and each print is an Export that never holds it.

const suffix = `${Date.now()}`.slice(-6);
const JANUARY = "2059-01-01T04:00:00.000Z";
const clock = () => new FakeClock(JANUARY);

const as = async (role: "owner" | "manager") => {
  const { client } = await createTestClient(appRouter, {
    as: role,
    clock: clock(),
  });
  return client;
};

const KEEPERS = {
  dataHost: `হোস্ট ${suffix}`,
  backupStore: `ব্যাকআপ ${suffix}`,
  backupCountry: "জার্মানি",
};

/** Somebody on file, never invited. */
const recorded = async (name: string, phone: string) => {
  const owner = await as("owner");
  const them = await owner.investors.record({
    name: `${name} ${suffix}`,
    phone,
    address: "সাভার",
    nid: "1234567890",
    bankAccount: `01234${phone.slice(-5)}`,
  });
  return them.id;
};

/** Every Export on the trail about one Investor, the latest first. */
const exportsFor = async (id: string) => {
  const owner = await as("owner");
  const trail = await owner.audit.list({ entity: "investor", limit: 50 });
  return trail.filter((one) => one.entityId === id && one.action === "export");
};

beforeAll(async () => {
  const owner = await as("owner");
  await owner.farm.setIdentity({
    address: `সাভার, ঢাকা ${suffix}`,
    phone: "+8801711000097",
    registrationNumber: `DLS/SAV/2059/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2061-03-31",
  });
  await owner.farm.setDataKeepers(KEEPERS);
  await owner.investors.setPortalOpen({ open: true });
});

describe("a code handed over", () => {
  it("goes out with the Welcome Letter until they have been handed one, and with the Code Slip alone after", async () => {
    const owner = await as("owner");
    const id = await recorded("রহিম", `0179${suffix}1`);

    const first = await invitedWithConsent(owner, id);
    await owner.investors.handOver({ id, paper: "welcome_letter" });
    const second = await invitedWithConsent(owner, id);

    expect(first.paper).toBe("welcome_letter");
    expect(second.paper).toBe("code_slip");
  });

  it("goes out with the letter for somebody invited before, who was never handed one", async () => {
    const owner = await as("owner");
    const id = await recorded("মোমেনা", `0179${suffix}9`);
    // Invited, and the dialog closed with nothing printed — as for everybody invited before the letter existed.
    await invitedWithConsent(owner, id);

    const next = await invitedWithConsent(owner, id);

    expect(next.paper).toBe("welcome_letter");
  });

  it("goes out with the slip for somebody whose access was taken away and who is invited again", async () => {
    const owner = await as("owner");
    const id = await recorded("বাদল", `0178${suffix}0`);
    await invitedWithConsent(owner, id);
    await owner.investors.handOver({ id, paper: "welcome_letter" });
    await owner.investors.takePortalAway({ id, why: { reason: "owner" } });
    const again = await invitedWithConsent(owner, id);

    const slip = await owner.investors.handOver({ id, paper: "code_slip" });

    expect(again.paper).toBe("code_slip");
    expect(slip.investor.name).toBe(`বাদল ${suffix}`);
  });
});

describe("the Welcome Letter", () => {
  it("is laid out for the Investor by name, with their phone, whom to call and the notice on its back", async () => {
    const owner = await as("owner");
    const id = await recorded("সালমা", `0179${suffix}2`);
    await invitedWithConsent(owner, id);

    const letter = await owner.investors.handOver({
      id,
      paper: "welcome_letter",
    });

    expect(letter.investor).toEqual({
      name: `সালমা ${suffix}`,
      phone: `0179${suffix}2`,
    });
    expect(letter.letterhead.details.join(" ")).toContain(
      `DLS/SAV/2059/${suffix}`
    );
    expect(letter.issuedOn).toBe("2059-01-01");
    expect(letter.notice?.title).toBe("আপনার তথ্য খামার কীভাবে রাখে");
    expect(JSON.stringify(letter.notice)).toContain(KEEPERS.dataHost);
    // Whom to call: the farm as the portal's own account page shows it, read from the one place.
    const shown = await owner.portalPreview.me({ investorId: id });
    expect(letter.farm).toEqual(shown.farm);
  });

  it("is an Export naming the letter, for whom and by whom — and never the code", async () => {
    const owner = await as("owner");
    const id = await recorded("করিম", `0179${suffix}3`);
    const { code } = await invitedWithConsent(owner, id);

    await owner.investors.handOver({ id, paper: "welcome_letter" });

    const [made] = await exportsFor(id);
    expect(made).toMatchObject({
      actorId: thePerson("owner").id,
      after: expect.objectContaining({
        paper: "welcome_letter",
        investorId: id,
        registrationNumber: `DLS/SAV/2059/${suffix}`,
      }),
    });
    // Read as the console shows it, the code whole and as printed in two fours.
    const said = inspect(made, { depth: null });
    expect(said).not.toContain(code);
    expect(said).not.toContain(`${code.slice(0, 4)} ${code.slice(4)}`);
  });

  it("is handed over once: never printed a second time for the same Investor", async () => {
    const owner = await as("owner");
    const id = await recorded("রুবিনা", `0178${suffix}1`);
    await invitedWithConsent(owner, id);
    await owner.investors.handOver({ id, paper: "welcome_letter" });
    await invitedWithConsent(owner, id);

    await expect(
      owner.investors.handOver({ id, paper: "welcome_letter" })
    ).rejects.toMatchObject({ data: { refusal: "letter_handed_over" } });
    expect(await exportsFor(id)).toHaveLength(1);
  });

  it("is not printed while the notice on its back still has a fact unwritten", async () => {
    const owner = await as("owner");
    const id = await recorded("জামাল", `0179${suffix}4`);
    await invitedWithConsent(owner, id);
    await owner.farm.setDataKeepers({ ...KEEPERS, backupCountry: null });

    try {
      await expect(
        owner.investors.handOver({ id, paper: "welcome_letter" })
      ).rejects.toMatchObject({ data: { refusal: "notice_unwritten" } });
      expect(await exportsFor(id)).toEqual([]);
    } finally {
      await owner.farm.setDataKeepers(KEEPERS);
    }
  });
});

describe("the Code Slip", () => {
  it("is laid out alone, with no notice, and is an Export naming the slip and never the code", async () => {
    const owner = await as("owner");
    const id = await recorded("কামাল", `0179${suffix}5`);
    await invitedWithConsent(owner, id);
    const { code } = await invitedWithConsent(owner, id);

    const slip = await owner.investors.handOver({ id, paper: "code_slip" });

    expect(slip.notice).toBeNull();
    expect(slip.investor.name).toBe(`কামাল ${suffix}`);
    const [made] = await exportsFor(id);
    expect(made).toMatchObject({
      actorId: thePerson("owner").id,
      after: expect.objectContaining({ paper: "code_slip", investorId: id }),
    });
    const said = inspect(made, { depth: null });
    expect(said).not.toContain(code);
    expect(said).not.toContain(`${code.slice(0, 4)} ${code.slice(4)}`);
  });

  it("the slip only is printed while the notice has a fact unwritten: it carries none", async () => {
    const owner = await as("owner");
    const id = await recorded("নাসির", `0179${suffix}6`);
    await invitedWithConsent(owner, id);
    await owner.farm.setDataKeepers({ ...KEEPERS, backupCountry: null });

    try {
      const slip = await owner.investors.handOver({ id, paper: "code_slip" });
      expect(slip.notice).toBeNull();
    } finally {
      await owner.farm.setDataKeepers(KEEPERS);
    }
  });
});

describe("a paper handed over with a code", () => {
  it("is printed only while there is a code to hand over", async () => {
    const owner = await as("owner");
    const id = await recorded("হাসান", `0179${suffix}7`);
    await owner.investors.recordConsent({ id });

    await expect(
      owner.investors.handOver({ id, paper: "code_slip" })
    ).rejects.toMatchObject({ data: { refusal: "no_code_to_hand_over" } });
    expect(await exportsFor(id)).toEqual([]);
  });

  it("is the Owner's alone", async () => {
    const owner = await as("owner");
    const manager = await as("manager");
    const id = await recorded("ফারুক", `0179${suffix}8`);
    await invitedWithConsent(owner, id);

    await expect(
      manager.investors.handOver({ id, paper: "welcome_letter" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
