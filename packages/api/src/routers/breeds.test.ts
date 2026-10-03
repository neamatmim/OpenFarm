import { breed } from "@OpenFarm/db/schema/herd";
import { STANDARD_BREED_KEYS } from "@OpenFarm/domain";
import { scratchDb, theFarm } from "@OpenFarm/test-harness";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

const asOwner = () => createTestClient(appRouter, { as: "owner" });
let owner: Awaited<ReturnType<typeof asOwner>>["client"];
let penId: string;

beforeAll(async () => {
  ({ client: owner } = await asOwner());
  const shed = await owner.sheds.create({ name: "জাতের শেড" });
  ({ id: penId } = await owner.sheds.pens.create({
    shedId: shed.id,
    name: "জাতের পেন",
  }));
});

const registerCalf = (breedId?: string) =>
  owner.animals.register({
    sex: "female",
    side: "dairy",
    state: "calf",
    penId,
    source: "born",
    aliases: [],
    breedId,
  });

const refusal = (error: unknown) =>
  (error as { data?: { refusal?: string } }).data?.refusal;

describe("the farm's list of breeds", () => {
  // First, because the farm must not have opened its list yet.
  it("gives the standard breeds once, taking a name the farm already wrote as the standard one it is", async () => {
    const { id: written } = await owner.breeds.create({ nameBn: "sahiwal" });

    const first = await owner.breeds.list();
    const second = await owner.breeds.list();

    expect(
      first
        .map((one) => one.key)
        .filter(Boolean)
        .toSorted()
    ).toEqual(STANDARD_BREED_KEYS.toSorted());
    // The farm's own spelling stays, and it is the standard Sahiwal now: one row, not two.
    expect(first.find((one) => one.key === "sahiwal")).toMatchObject({
      id: written,
      nameBn: "sahiwal",
      nameEn: "Sahiwal",
    });
    expect(second).toHaveLength(first.length);
  });

  // After the first: a farm whose list was given before Brahman was on the standard has none under its key.
  it("gives a farm the pure Brahman beside the Brahman cross when it next opens its list, taking a ব্রাহমা it wrote", async () => {
    await scratchDb()
      .delete(breed)
      .where(and(eq(breed.farmId, theFarm().id), eq(breed.key, "brahman")));
    const { id: written } = await owner.breeds.create({ nameBn: "ব্রাহমা" });

    const listed = await owner.breeds.list();

    expect(listed.find((one) => one.key === "brahman")).toMatchObject({
      id: written,
      nameBn: "ব্রাহমা",
      nameEn: "Brahman",
      deshi: false,
    });
    expect(listed.find((one) => one.key === "brahmanCross")?.nameBn).toBe(
      "ব্রাহমা ক্রস"
    );
  });

  it("refuses a second breed by a name the list already has, in either language and any capitals", async () => {
    const refused = await owner.breeds
      .create({ nameBn: "নতুন জাত", nameEn: "red chittagong" })
      .catch((error: unknown) => error);

    expect(refusal(refused)).toBe("breed_exists");
  });

  it("renames a breed on every animal of it", async () => {
    const { id } = await owner.breeds.create({ nameBn: "মিরকাদিম" });
    const { tagNumber } = await registerCalf(id);

    await owner.breeds.rename({
      id,
      nameBn: "মীরকাদিম",
      nameEn: "Mirkadim",
    });

    const her = await owner.animals.get({ tagNumber });
    expect(her.breed).toEqual({ nameBn: "মীরকাদিম", nameEn: "Mirkadim" });
  });

  it("writes nothing new under a retired breed, and the animals of it keep it", async () => {
    const { id } = await owner.breeds.create({ nameBn: "অবসরের জাত" });
    const { tagNumber } = await registerCalf(id);
    await owner.breeds.retire({ id });

    const refused = await registerCalf(id).catch((error: unknown) => error);
    const her = await owner.animals.get({ tagNumber });

    expect(refusal(refused)).toBe("breed_retired");
    expect(her.breed?.nameBn).toBe("অবসরের জাত");

    await owner.breeds.restore({ id });
    await expect(registerCalf(id)).resolves.toMatchObject({
      tagNumber: expect.any(String),
    });
  });

  it("counts the animals on the farm of each breed", async () => {
    const { id } = await owner.breeds.create({ nameBn: "গোনার জাত" });
    await registerCalf(id);
    await registerCalf(id);

    const listed = await owner.breeds.list();

    expect(listed.find((one) => one.id === id)?.animals).toBe(2);
  });

  it("is the Owner's and the Manager's to keep", async () => {
    const { client: staff } = await createTestClient(appRouter, {
      as: "staff",
    });

    await expect(
      staff.breeds.create({ nameBn: "কর্মীর জাত" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("the opening register names a breed", () => {
  it("by either of its names, and refuses one the list does not have", async () => {
    const csv = [
      "sex,side,state,pen,source,breed",
      "female,dairy,calf,জাতের পেন,born,Jersey cross",
      "female,dairy,calf,জাতের পেন,born,রেড চিটাগাং",
      "female,dairy,calf,জাতের পেন,born,Unicorn",
    ].join("\n");

    const result = await owner.animals.importRegister({ csv });

    expect(result.failed.map((row) => row.line)).toEqual([4]);
    expect(result.failed[0]?.reason).toContain("Unicorn");
    const [jersey, chittagong] = await Promise.all(
      result.imported.map((row) =>
        owner.animals.get({ tagNumber: row.tagNumber })
      )
    );
    expect(jersey?.breed?.nameBn).toBe("জার্সি ক্রস");
    expect(chittagong?.breed?.nameEn).toBe("Red Chittagong");
  });
});
