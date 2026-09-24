import { STANDARD_BREED_KEYS } from "@OpenFarm/domain";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

const asOwner = () => createTestClient(appRouter, { as: "owner" });
let owner: Awaited<ReturnType<typeof asOwner>>["client"];
let penId: string;

beforeAll(async () => {
  ({ client: owner } = await asOwner());
  const shed = await owner.herd.createShed({ name: "জাতের শেড" });
  ({ id: penId } = await owner.herd.createPen({
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
    const { id: written } = await owner.breeds.add({ nameBn: "sahiwal" });

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

  it("refuses a second breed by a name the list already has, in either language and any capitals", async () => {
    const refused = await owner.breeds
      .add({ nameBn: "নতুন জাত", nameEn: "red chittagong" })
      .catch((error: unknown) => error);

    expect(refusal(refused)).toBe("breed_exists");
  });

  it("renames a breed on every animal of it", async () => {
    const { id } = await owner.breeds.add({ nameBn: "মিরকাদিম" });
    const { tagNumber } = await registerCalf(id);

    await owner.breeds.rename({
      id,
      nameBn: "মীরকাদিম",
      nameEn: "Mirkadim",
    });

    const her = await owner.animals.byTag({ tagNumber });
    expect(her.breed).toEqual({ nameBn: "মীরকাদিম", nameEn: "Mirkadim" });
  });

  it("writes nothing new under a retired breed, and the animals of it keep it", async () => {
    const { id } = await owner.breeds.add({ nameBn: "অবসরের জাত" });
    const { tagNumber } = await registerCalf(id);
    await owner.breeds.retire({ id });

    const refused = await registerCalf(id).catch((error: unknown) => error);
    const her = await owner.animals.byTag({ tagNumber });

    expect(refusal(refused)).toBe("breed_retired");
    expect(her.breed?.nameBn).toBe("অবসরের জাত");

    await owner.breeds.restore({ id });
    await expect(registerCalf(id)).resolves.toMatchObject({
      tagNumber: expect.any(String),
    });
  });

  it("counts the animals on the farm of each breed", async () => {
    const { id } = await owner.breeds.add({ nameBn: "গোনার জাত" });
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
      staff.breeds.add({ nameBn: "কর্মীর জাত" })
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
        owner.animals.byTag({ tagNumber: row.tagNumber })
      )
    );
    expect(jersey?.breed?.nameBn).toBe("জার্সি ক্রস");
    expect(chittagong?.breed?.nameEn).toBe("Red Chittagong");
  });
});
