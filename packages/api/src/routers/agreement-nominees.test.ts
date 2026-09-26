import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { nominationOnFile, theWhole } from "../test/nominations";
import { appRouter } from "./index";

// An Investment Agreement is a Nomination too: it names the Nominees the sign sheet printed, and signing records them
// as the Investor's Nomination made by that Agreement — the list in force from then on, until a later paper.

const suffix = `${Date.now()}`.slice(-7);
const JANUARY = "2064-01-10T04:00:00.000Z";

const as = async (role: "owner" | "manager") => {
  const { client } = await createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(JANUARY),
  });
  return client;
};

let ventureId = "";
let serial = 0;

/** One Investor, written down for this test. */
const someone = async (name: string) => {
  const owner = await as("owner");
  serial += 1;
  const { id } = await owner.investors.record({
    name: `${name} ${suffix}`,
    phone: `018${String(serial).padStart(2, "0")}${suffix}`,
  });
  return id;
};

/** The terms of a signing, stamped on `stampedOn`. */
const terms = (investorId: string, stampedOn = "2064-01-10") => ({
  ventureId,
  investorId,
  units: 1,
  investorsPercent: 60,
  arbitrator: `সালিস ${suffix}`,
  stampValueBdt: 300,
  stampedOn,
  stampSerial: `S-${investorId}`,
});

const WIFE = { ...theWhole(`স্ত্রী ${suffix}`), bornOn: "1980-01-01" };
const SON = { ...theWhole(`ছেলে ${suffix}`, "ছেলে"), bornOn: "2000-01-01" };

beforeAll(async () => {
  const owner = await as("owner");
  await owner.farm.setIdentity({
    address: `সাভার ${suffix}`,
    phone: "+8801711000094",
    registrationNumber: `DLS/SAV/2064/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2066-03-31",
  });
  const venture = await owner.ventures.open({
    name: `ভেঞ্চার ${suffix}`,
    targetCapitalBdt: 1_000_000,
    floorBdt: 0,
    decideBy: "2064-01-20",
    targetWindowStart: "2064-03-17",
    targetWindowEnd: "2064-03-19",
    unitPriceBdt: 50_000,
    units: 20,
    cattleBudgetBdt: 800_000,
  });
  ventureId = venture.id;
});

describe("an Agreement's Nominees", () => {
  it("are recorded as the Investor's Nomination when it is signed, the list printed, and are then in force", async () => {
    const owner = await as("owner");
    const investorId = await someone("করিম");

    const { id } = await owner.ventures.sign({
      ...terms(investorId),
      nominees: [
        { ...WIFE, sharePercent: 70 },
        { ...SON, sharePercent: 30 },
      ],
    });

    const [inForce] = await owner.investors.nominations({ id: investorId });
    expect(inForce).toMatchObject({
      how: "agreement",
      agreementId: id,
      signedOn: "2064-01-10",
      ventureName: `ভেঞ্চার ${suffix}`,
      nominees: [
        { name: `স্ত্রী ${suffix}`, sharePercent: 70 },
        { name: `ছেলে ${suffix}`, sharePercent: 30 },
      ],
    });
    const trail = await owner.audit.list({
      entity: "nomination",
      entityId: investorId,
    });
    expect(trail[0]?.after).toMatchObject({ nominationHow: "agreement" });
  });

  it("change the list in force when the sign sheet changed them, and a later মনোনয়নপত্র leaves the Agreement's own as it was", async () => {
    const owner = await as("owner");
    const investorId = await someone("রহিম");
    await nominationOnFile({
      investorId,
      nominees: [theWhole(`আগের ${suffix}`)],
      signedOn: "2064-01-01",
      recordedAt: new Date("2064-01-01T04:00:00.000Z"),
    });

    const { id } = await owner.ventures.sign({
      ...terms(investorId),
      nominees: [{ ...WIFE, sharePercent: 100 }],
    });
    await owner.investors.recordNomination({
      id: investorId,
      nominees: [{ ...SON, sharePercent: 100 }],
      signedOn: "2064-01-10",
      contentType: "image/jpeg",
      data: "aGVsbG8=",
    });

    const history = await owner.investors.nominations({ id: investorId });
    expect(
      history.map((one) => [one.how, one.nominees.map((n) => n.name)])
    ).toEqual([
      ["nomination", [`ছেলে ${suffix}`]],
      ["agreement", [`স্ত্রী ${suffix}`]],
      ["carried_over", [`আগের ${suffix}`]],
    ]);
    // The Agreement's own, row for row, untouched by the paper after it.
    expect(history.find((one) => one.agreementId === id)?.nominees).toEqual([
      expect.objectContaining({
        name: `স্ত্রী ${suffix}`,
        relation: "স্ত্রী",
        bornOn: "1980-01-01",
        sharePercent: 100,
        receiver: null,
      }),
    ]);
  });

  it("are the list in force when the sign sheet sends none, and one carried over without a date of birth is refused", async () => {
    const owner = await as("owner");
    const investorId = await someone("সালাম");
    await nominationOnFile({
      investorId,
      nominees: [theWhole(`পুরোনো ${suffix}`)],
      signedOn: "2064-01-01",
      recordedAt: new Date("2064-01-01T04:00:00.000Z"),
    });

    await expect(owner.ventures.sign(terms(investorId))).rejects.toMatchObject({
      data: { refusal: "nominees_born_missing", at: 1 },
    });
    // Refused before anything was written: no Agreement, and the list as it was.
    expect(await owner.ventures.agreements({ ventureId })).not.toContainEqual(
      expect.objectContaining({ investorId })
    );
  });

  it("may be none, and signing still records that he named nobody", async () => {
    const owner = await as("owner");
    const investorId = await someone("একা");

    await owner.ventures.sign({ ...terms(investorId), nominees: [] });

    const { people } = await owner.investors.list();
    expect(
      people.find((one) => one.id === investorId)?.nomination
    ).toMatchObject({
      how: "agreement",
      nominees: [],
    });
  });

  it("are judged minors on the day the paper is stamped: a Receiver for a minor, none for one who turns eighteen that day", async () => {
    const owner = await as("owner");
    const investorId = await someone("বাবা");
    const turning = {
      ...theWhole(`মেয়ে ${suffix}`, "মেয়ে"),
      bornOn: "2046-01-10",
    };

    await expect(
      owner.ventures.sign({
        ...terms(investorId, "2064-01-09"),
        nominees: [turning],
      })
    ).rejects.toMatchObject({ data: { refusal: "nominees_receiver_missing" } });

    await owner.ventures.sign({
      ...terms(investorId, "2064-01-10"),
      nominees: [turning],
    });
    const [inForce] = await owner.investors.nominations({ id: investorId });
    expect(inForce?.nominees[0]).toMatchObject({
      minor: false,
      receiver: null,
    });
  });

  it("are printed on the Agreement to sign as the sign sheet wrote them", async () => {
    const owner = await as("owner");
    const investorId = await someone("ছাপা");

    const { document } = await owner.investorStatements.agreementToSign({
      ventureId,
      investorId,
      units: 1,
      investorsPercent: 60,
      arbitrator: `সালিস ${suffix}`,
      nominees: [
        { ...WIFE, sharePercent: 60 },
        { ...SON, sharePercent: 40 },
      ],
    });

    const parties = document.sections.find((one) => one.kind === "parties");
    if (parties?.kind !== "parties") {
      throw new Error("expected the parties");
    }
    const [, him] = parties.parties;
    expect(him?.nominees.map((one) => [one.name, one.share])).toEqual([
      [`স্ত্রী ${suffix}`, "৬০%"],
      [`ছেলে ${suffix}`, "৪০%"],
    ]);
  });
});
