import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { invitedWithConsent, signedInAs } from "../test/portal-client";
import { appRouter } from "./index";

/**
 * An Organisation's Signatory (ADR 0020): the person who signs in to the portal for it, and who is changed for another
 * by the Owner — taking the old one's sign-in and consent away with them, so the new one consents and is invited
 * afresh.
 */
const run = `${Date.now()}`.slice(-6);
const AT = "2046-09-01T04:00:00.000Z";
const LATER = "2046-09-02T04:00:00.000Z";
const PASSWORD = "gorur-khamar-2026";

/** A mobile of this file's own for this run: eleven digits, so the portal can make a login of it. */
const mobileOf = (n: number) => `019${String(n).padStart(2, "0")}${run}`;

const as = async (role: "owner" | null, at = AT) => {
  const { client } = await createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(at),
  });
  return client;
};

const organisation = (n: number) => ({
  kind: "organisation" as const,
  name: `পদ্মা এগ্রো লিমিটেড ${n} ${run}`,
  phone: mobileOf(n),
  address: "রাজশাহী",
  tradeLicence: `TRAD/RCC/${n}${run}`,
  tin: `66${run}${n}`,
  authority: "পরিচালনা পর্ষদের সিদ্ধান্ত",
  authorityOn: "2046-08-20",
  signatoryName: `মো. হাবিবুর রহমান ${n}`,
  signatoryNid: `19851234${String(n).padStart(5, "0")}`,
  signatoryRole: "ব্যবস্থাপনা পরিচালক",
});

/** An Organisation written down, its Signatory invited and joined: its id and the Signatory's login. */
const anOrganisationInThePortal = async (n: number) => {
  const owner = await as("owner");
  const { id } = await owner.investors.record(organisation(n));
  const { code } = await invitedWithConsent(owner, id);
  const nobody = await as(null);
  const { loginEmail } = await nobody.portal.join({
    phone: mobileOf(n),
    code,
    password: PASSWORD,
  });
  return { id, loginEmail };
};

beforeAll(async () => {
  const owner = await as("owner");
  await owner.investors.setPortalOpen({ open: true });
});

describe("an Organisation's Signatory in the portal", () => {
  it("signs in for it, in their own name, and reads the Organisation's record with no Nominees", async () => {
    const { loginEmail } = await anOrganisationInThePortal(1);
    const account = await scratchDb().query.user.findFirst({
      where: { email: loginEmail },
      columns: { name: true },
    });
    expect(account?.name).toBe(organisation(1).signatoryName);
    const signatory = await signedInAs(loginEmail, AT);
    const me = await signatory.portal.me();
    expect(me.name).toBe(organisation(1).name);
    expect(me.record.nominees).toEqual([]);
    expect(me.record.organisation).toMatchObject({
      tin: organisation(1).tin,
      signatory: { name: organisation(1).signatoryName },
    });
    // Their NID is hidden as a person's is: only its last digits.
    expect(me.record.organisation?.signatory.nid).not.toBe(
      organisation(1).signatoryNid
    );
  });
});

describe("changing an Organisation's Signatory", () => {
  it("takes the old Signatory's sign-in and consent away, and the new one consents before a code", async () => {
    const { id, loginEmail } = await anOrganisationInThePortal(2);
    const owner = await as("owner", LATER);
    await owner.investors.changeSignatory({
      id,
      phone: mobileOf(12),
      authority: "পরিচালনা পর্ষদের নতুন সিদ্ধান্ত",
      authorityOn: "2046-09-01",
      signatoryName: `মোছা. শাহানা পারভীন ${run}`,
      signatoryRole: "পরিচালক",
    });

    // The old Signatory is out: their sessions are gone, and their account is shut.
    const old = await scratchDb().query.user.findFirst({
      where: { email: loginEmail },
      columns: { disabledAt: true },
    });
    expect(old?.disabledAt).not.toBeNull();
    const { people } = await owner.investors.list();
    const them = people.find((one) => one.id === id);
    expect(them).toMatchObject({
      phone: mobileOf(12),
      portal: "taken_away",
      portalConsent: null,
      portalTakenAway: { why: "signatory_changed" },
      organisation: {
        signatory: { name: `মোছা. শাহানা পারভীন ${run}` },
      },
    });

    // No code for the new Signatory until they sign a consent of their own; then they join on their own mobile, in
    // their own name, with an account of their own.
    await expect(owner.investors.inviteToPortal({ id })).rejects.toMatchObject({
      data: { refusal: "no_consent" },
    });
    const { code } = await invitedWithConsent(owner, id);
    const nobody = await as(null, LATER);
    const joined = await nobody.portal.join({
      phone: mobileOf(12),
      code,
      password: PASSWORD,
    });
    expect(joined.loginEmail).not.toBe(loginEmail);
    const account = await scratchDb().query.user.findFirst({
      where: { email: joined.loginEmail },
      columns: { name: true },
    });
    expect(account?.name).toBe(`মোছা. শাহানা পারভীন ${run}`);
  });

  it("keeps the Agreements the Organisation signed before", async () => {
    const owner = await as("owner");
    const venture = await owner.ventures.open({
      name: `ঈদ ২০৪৭ ${run}`,
      targetCapitalMoney: 2_000_000,
      floorMoney: 0,
      decideBy: "2046-09-15",
      targetWindowStart: "2047-05-17",
      targetWindowEnd: "2047-05-19",
      unitPriceMoney: 50_000,
      units: 40,
      cattleBudgetMoney: 1_500_000,
    });
    const { id } = await owner.investors.record(organisation(3));
    await owner.ventures.agreements.sign({
      ventureId: venture.id,
      investorId: id,
      units: 2,
      investorsPercent: 60,
      arbitrator: `মাওলানা আব্দুল হক ${run}`,
      stampValueMoney: 300,
      stampedOn: "2046-09-01",
      stampSerial: `AA ${run}`,
    });
    await owner.investors.changeSignatory({
      id,
      phone: mobileOf(13),
      authority: "পরিচালনা পর্ষদের নতুন সিদ্ধান্ত",
      signatoryName: `নতুন স্বাক্ষরকারী ${run}`,
    });
    const { people } = await owner.investors.list();
    expect(people.find((one) => one.id === id)?.unitsHeld).toBe(2);
  });

  it("is refused for a person, who has no Signatory", async () => {
    const owner = await as("owner");
    const { id } = await owner.investors.record({
      name: `একজন ব্যক্তি ${run}`,
      phone: mobileOf(4),
    });
    await expect(
      owner.investors.changeSignatory({
        id,
        phone: mobileOf(14),
        authority: "চিঠি",
        signatoryName: "কেউ একজন",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "investor_is_a_person" },
    });
  });

  it("is the Owner's alone", async () => {
    const owner = await as("owner");
    const { id } = await owner.investors.record(organisation(5));
    const { client: manager } = await createTestClient(appRouter, {
      as: "manager",
      clock: new FakeClock(AT),
    });
    await expect(
      manager.investors.changeSignatory({
        id,
        phone: mobileOf(15),
        authority: "চিঠি",
        signatoryName: "কেউ একজন",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
