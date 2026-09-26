import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { nominationOnFile, theWhole } from "../test/nominations";
import { appRouter } from "./index";

// An Investor's Nominees, kept as each Nomination on file and never on their record: the latest is the list in force
// for all their Agreements, a list carried over from before Nominations says it was never signed for, and the history
// of who was named, and when, is kept whole.

const suffix = `${Date.now()}`.slice(-7);
const JANUARY = "2063-01-01T04:00:00.000Z";
const at = (seconds: number) => new Date(Date.parse(JANUARY) + seconds * 1000);

const as = async (role: "owner" | "manager") => {
  const { client } = await createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(JANUARY),
  });
  return client;
};

let karimId = "";
let nobodysId = "";

beforeAll(async () => {
  const owner = await as("owner");
  // A paper handed out carries the farm's Registration number.
  await owner.farm.setIdentity({
    address: `সাভার, ঢাকা ${suffix}`,
    phone: "+8801711000095",
    registrationNumber: `DLS/SAV/2063/${suffix}`,
    registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
    registrationExpiresOn: "2065-03-31",
  });
  const karim = await owner.investors.record({
    name: `করিম ${suffix}`,
    phone: `0171${suffix}`,
  });
  karimId = karim.id;
  const nobody = await owner.investors.record({
    name: `রহিম ${suffix}`,
    phone: `0172${suffix}`,
  });
  nobodysId = nobody.id;
});

describe("an Investor's Nominees", () => {
  it("are none for somebody who has never had any on file", async () => {
    const owner = await as("owner");

    const { people } = await owner.investors.list();

    expect(people.find((one) => one.id === nobodysId)?.nomination).toBeNull();
    expect(await owner.investors.nominations({ id: nobodysId })).toEqual([]);
  });

  it("are the latest Nomination on file, even two signed the same day and recorded at the same moment", async () => {
    const owner = await as("owner");
    await nominationOnFile({
      investorId: karimId,
      nominees: [theWhole(`আগের নমিনি ${suffix}`)],
      signedOn: "2062-12-01",
      recordedAt: at(0),
    });
    // Two recorded in one moment: the one recorded second is in force, by the order the farm made them.
    await nominationOnFile({
      investorId: karimId,
      how: "nomination",
      nominees: [{ ...theWhole(`প্রথম ${suffix}`), bornOn: "1980-01-01" }],
      signedOn: "2063-01-01",
      recordedAt: at(1),
    });
    await nominationOnFile({
      investorId: karimId,
      how: "nomination",
      nominees: [
        {
          ...theWhole(`দ্বিতীয় ${suffix}`),
          bornOn: "1980-01-01",
          sharePercent: 50,
        },
        {
          ...theWhole(`নাতি ${suffix}`, "নাতি"),
          bornOn: "2055-01-01",
          sharePercent: 50,
          receiver: { name: `দ্বিতীয় ${suffix}`, relation: "মা", phone: null },
        },
      ],
      signedOn: "2063-01-01",
      recordedAt: at(1),
    });

    const { people } = await owner.investors.list();
    const history = await owner.investors.nominations({ id: karimId });

    expect(people.find((one) => one.id === karimId)?.nomination).toMatchObject({
      how: "nomination",
      signedOn: "2063-01-01",
      nominees: [
        { name: `দ্বিতীয় ${suffix}`, sharePercent: 50, minor: false },
        { name: `নাতি ${suffix}`, minor: true, receiver: { relation: "মা" } },
      ],
    });
    // Every one kept, newest first; the one carried over says it was never signed for.
    expect(history.map((one) => [one.how, one.nominees[0]?.name])).toEqual([
      ["nomination", `দ্বিতীয় ${suffix}`],
      ["nomination", `প্রথম ${suffix}`],
      ["carried_over", `আগের নমিনি ${suffix}`],
    ]);
  });

  it("are not written on the Investor's record, whatever a correction sends", async () => {
    const owner = await as("owner");
    const before = await owner.investors.nominations({ id: karimId });

    await owner.investors.update({
      id: karimId,
      name: `করিম ${suffix}`,
      phone: `0171${suffix}`,
      // Not a field of the record any more: a correction that carries one changes nobody's Nominees.
      ...({ nominee: { name: "অন্য কেউ" } } as object),
    });

    expect(await owner.investors.nominations({ id: karimId })).toEqual(before);
  });

  it("are the Owner's alone to read", async () => {
    const manager = await as("manager");

    await expect(
      manager.investors.nominations({ id: karimId })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

const PHOTO = { contentType: "image/jpeg" as const, data: "aGVsbG8=" };

/** Three Nominees, the last a minor on the first of January 2063 with her mother to collect for her. */
const THREE = [
  { ...theWhole(`রহিমা ${suffix}`), bornOn: "1982-03-14", sharePercent: 50 },
  {
    ...theWhole(`তানভীর ${suffix}`, "ছেলে"),
    bornOn: "2004-08-02",
    sharePercent: 30,
  },
  {
    ...theWhole(`সাদিয়া ${suffix}`, "মেয়ে"),
    bornOn: "2052-11-20",
    sharePercent: 20,
    receiver: { name: `রহিমা ${suffix}`, relation: "মা", phone: null },
  },
];

describe("a মনোনয়নপত্র", () => {
  let hasanId = "";

  beforeAll(async () => {
    const owner = await as("owner");
    const hasan = await owner.investors.record({
      name: `হাসান ${suffix}`,
      phone: `0173${suffix}`,
    });
    hasanId = hasan.id;
  });

  it("prints for the Nominees written down, a Receiver's line only for the minor, and is an Export", async () => {
    const owner = await as("owner");

    const { document } = await owner.investors.nominationToSign({
      id: hasanId,
      nominees: THREE,
    });

    expect(document.title.bn).toBe("মনোনয়নপত্র");
    const parties = document.sections.find((one) => one.kind === "parties");
    if (parties?.kind !== "parties") {
      throw new Error("expected the parties");
    }
    const [, him] = parties.parties;
    expect(him?.nominees.map((one) => [one.share, one.minor])).toEqual([
      ["৫০%", false],
      ["৩০%", false],
      ["২০%", true],
    ]);
    expect(him?.lines.map((line) => line.bn)).toEqual([
      expect.stringContaining("প্রত্যেক নমিনি জানেন"),
      expect.stringContaining(`নমিনি সাদিয়া ${suffix}-এর বয়স আঠারো বছরের কম`),
    ]);
    const trail = await owner.audit.list({
      entity: "investor",
      entityId: hasanId,
    });
    expect(trail.find((one) => one.action === "export")?.after).toMatchObject({
      paper: "nomination",
    });
  });

  it("is refused for Nominees no paper may name, saying which", async () => {
    const owner = await as("owner");
    const [first, second] = THREE;
    if (!(first && second)) {
      throw new Error("expected Nominees");
    }

    await expect(
      owner.investors.nominationToSign({
        id: hasanId,
        nominees: [first, second],
      })
    ).rejects.toMatchObject({
      data: { refusal: "nominees_shares_not_hundred" },
    });
    await expect(
      owner.investors.recordNomination({
        id: hasanId,
        nominees: [{ ...first, sharePercent: 100, bornOn: null }],
        signedOn: "2063-01-01",
        ...PHOTO,
      })
    ).rejects.toMatchObject({
      data: { refusal: "nominees_born_missing", at: 1 },
    });
  });

  it("recorded with its day and photo, is the list in force, and the trail keeps what it replaced", async () => {
    const owner = await as("owner");
    await owner.investors.recordNomination({
      id: hasanId,
      nominees: [{ ...theWhole(`আগে ${suffix}`), bornOn: "1970-01-01" }],
      signedOn: "2062-12-31",
      ...PHOTO,
    });

    await owner.investors.recordNomination({
      id: hasanId,
      nominees: THREE,
      signedOn: "2063-01-01",
      ...PHOTO,
    });

    const [inForce, earlier] = await owner.investors.nominations({
      id: hasanId,
    });
    expect(inForce).toMatchObject({
      how: "nomination",
      signedOn: "2063-01-01",
      hasPhoto: true,
      nominees: [
        { name: `রহিমা ${suffix}` },
        { name: `তানভীর ${suffix}` },
        { name: `সাদিয়া ${suffix}`, minor: true, receiver: { relation: "মা" } },
      ],
    });
    expect(earlier?.nominees).toMatchObject([{ name: `আগে ${suffix}` }]);
    const trail = await owner.audit.list({
      entity: "nomination",
      entityId: hasanId,
    });
    const latest = trail.find((one) =>
      JSON.stringify(one.after).includes(`সাদিয়া ${suffix}`)
    );
    expect(latest?.before).toMatchObject({
      nominees: expect.stringContaining(`আগে ${suffix}`),
    });
    expect(latest?.after).toMatchObject({
      signedOn: "2063-01-01",
      nominationHow: "nomination",
      nominees: expect.stringContaining(
        `সাদিয়া ${suffix} ২০% গ্রহণকারী রহিমা ${suffix}`
      ),
    });
  });

  it("may name nobody, and then says so", async () => {
    const owner = await as("owner");
    const { id } = await owner.investors.record({
      name: `কেউ নেই ${suffix}`,
      phone: `0174${suffix}`,
    });

    await owner.investors.recordNomination({
      id,
      nominees: [],
      signedOn: "2063-01-01",
      ...PHOTO,
    });

    const { people } = await owner.investors.list();
    expect(people.find((one) => one.id === id)?.nomination).toMatchObject({
      how: "nomination",
      nominees: [],
    });
  });

  it("is refused on a day still to come, or before the one in force was signed", async () => {
    const owner = await as("owner");
    const [first] = THREE;
    if (!first) {
      throw new Error("expected a Nominee");
    }
    const one = [{ ...first, sharePercent: 100 }];

    await expect(
      owner.investors.recordNomination({
        id: hasanId,
        nominees: one,
        signedOn: "2063-01-02",
        ...PHOTO,
      })
    ).rejects.toMatchObject({ data: { refusal: "signed_in_future" } });
    await expect(
      owner.investors.recordNomination({
        id: hasanId,
        nominees: one,
        signedOn: "2062-06-01",
        ...PHOTO,
      })
    ).rejects.toMatchObject({ data: { refusal: "signed_before_in_force" } });
  });

  it("is refused for a retired Investor", async () => {
    const owner = await as("owner");
    const { id } = await owner.investors.record({
      name: `অবসর ${suffix}`,
      phone: `0175${suffix}`,
    });
    await owner.investors.retire({ id });

    await expect(
      owner.investors.nominationToSign({ id, nominees: [] })
    ).rejects.toMatchObject({ data: { refusal: "investor_retired" } });
    await expect(
      owner.investors.recordNomination({
        id,
        nominees: [],
        signedOn: "2063-01-01",
        ...PHOTO,
      })
    ).rejects.toMatchObject({ data: { refusal: "investor_retired" } });
  });

  it("is the Owner's alone to print and to record", async () => {
    const manager = await as("manager");

    await expect(
      manager.investors.nominationToSign({ id: hasanId, nominees: [] })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      manager.investors.recordNomination({
        id: hasanId,
        nominees: [],
        signedOn: "2063-01-01",
        ...PHOTO,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
