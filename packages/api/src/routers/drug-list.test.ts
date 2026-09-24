import { STANDARD_DRUGS } from "@OpenFarm/domain";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

const asManager = () => createTestClient(appRouter, { as: "manager" });
let manager: Awaited<ReturnType<typeof asManager>>["client"];
let vet: Awaited<ReturnType<typeof asManager>>["client"];

beforeAll(async () => {
  ({ client: manager } = await asManager());
  ({ client: vet } = await createTestClient(appRouter, { as: "vet" }));
});

const productNamed = async (nameBn: string) => {
  const products = await manager.drugs.list();
  return products.find((one) => one.nameBn === nameBn);
};

describe("the farm's list of medicines", () => {
  // First, because the farm must not have the standard medicines yet.
  it("adds the standard medicines the farm does not have, names only, and leaves the ones it has", async () => {
    const { meloxicam } = STANDARD_DRUGS;
    await manager.drugs.add({ name: { bn: "মেলোক্সিক্যাম", en: meloxicam.en } });
    const missing = await manager.drugs.standardMissing();

    const first = await manager.drugs.addStandard();
    const second = await manager.drugs.addStandard();

    const standard = Object.values(STANDARD_DRUGS).map((one) => one.bn);
    expect(first.added.toSorted()).toEqual(
      standard.filter((name) => name !== meloxicam.bn).toSorted()
    );
    expect(missing.map((one) => one.bn).toSorted()).toEqual(
      first.added.toSorted()
    );
    expect(second.added).toEqual([]);
    // The Vet's days are the Vet's: a standard medicine comes with none, and may not be prescribed until they are said.
    const given = await productNamed(STANDARD_DRUGS.oxytet.bn);
    expect(given?.milkWithdrawalDays).toBeNull();
    expect(given?.prescribable).toBe(false);
  });

  it("refuses a second medicine by a name the list has in either language, and says whether it is retired", async () => {
    const byEnglish = await manager.drugs
      .add({ name: { bn: "নতুন নাম", en: "albendazole DRENCH" } })
      .catch((error: unknown) => error);

    expect(byEnglish).toMatchObject({
      code: "CONFLICT",
      data: { retired: false },
    });
  });

  it("is renamed by the Vet, and every record of it says the new name", async () => {
    const { id } = await manager.drugs.add({ name: { bn: "আইভারমেকটিন ১" } });

    await vet.drugs.rename({
      id,
      name: { bn: "আইভারমেকটিন ১%", en: "Ivermectin 1%" },
    });

    expect(await productNamed("আইভারমেকটিন ১%")).toMatchObject({
      id,
      nameEn: "Ivermectin 1%",
    });
  });

  it("refuses a rename to a name another medicine has", async () => {
    const { id } = await manager.drugs.add({ name: { bn: "টেট্রা পাউডার" } });

    await expect(
      vet.drugs.rename({ id, name: { bn: STANDARD_DRUGS.calcium.bn } })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("is renamed by the Vet alone, as it is retired", async () => {
    const { id } = await manager.drugs.add({ name: { bn: "ভিটামিন এডি৩ই" } });

    await expect(
      manager.drugs.rename({ id, name: { bn: "ভিটামিন" } })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
