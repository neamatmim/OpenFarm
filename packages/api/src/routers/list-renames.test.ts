import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A slip in a Category's, a Farm Account's or a disease's name is put right where it stands, as a breed's or a feed's
// is — not by a new entry and the old one retired, which split a year of money across two names.

const suffix = `${Date.now()}`.slice(-7);

const ownerClient = async () => {
  const { client } = await createTestClient(appRouter, { as: "owner" });
  return client;
};

describe("a Money Category's name", () => {
  it("is put right, refused for another's name, and kept for a standard Category", async () => {
    const owner = await ownerClient();
    const { id } = await owner.money.categories.create({
      nameBn: `বিদুৎ বিল ${suffix}`,
      direction: "out",
    });
    await owner.money.categories.create({
      nameBn: `পানির বিল ${suffix}`,
      direction: "out",
    });
    await owner.money.categories.rename({ id, nameBn: `বিদ্যুৎ বিল ${suffix}` });
    const listed = await owner.money.categories.list();
    expect(listed.find((one) => one.id === id)?.nameBn).toBe(
      `বিদ্যুৎ বিল ${suffix}`
    );

    await expect(
      owner.money.categories.rename({ id, nameBn: `পানির বিল ${suffix}` })
    ).rejects.toMatchObject({ data: { refusal: "category_exists" } });
    const standard = listed.find((one) => one.key !== null);
    await expect(
      owner.money.categories.rename({
        id: standard?.id ?? "",
        nameBn: `অন্য নাম ${suffix}`,
      })
    ).rejects.toMatchObject({ data: { refusal: "category_is_standard" } });
  });
});

describe("a notifiable disease's name", () => {
  it("is put right, and refused for a name another disease on the list has", async () => {
    const owner = await ownerClient();
    const { id } = await owner.notifiableDiseases.create({
      name: { bn: `গলাফুলো ${suffix}` },
    });
    const other = await owner.notifiableDiseases.create({
      name: { bn: `বাদলা ${suffix}` },
    });
    await owner.notifiableDiseases.rename({
      id,
      name: { bn: `গলা ফোলা ${suffix}` },
    });
    await expect(
      owner.notifiableDiseases.rename({
        id: other.id,
        name: { bn: `গলা ফোলা ${suffix}` },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("a Farm Account's name", () => {
  it("is put right by the Owner, its number kept, and not by the Manager", async () => {
    const owner = await ownerClient();
    const { id } = await owner.farmAccounts.create({
      kind: "mobile_money",
      name: `বিকাষ ${suffix}`,
      number: "01799000666",
    });
    await owner.farmAccounts.rename({ id, name: `বিকাশ ${suffix}` });
    const listed = await owner.farmAccounts.list();
    expect(listed.find((one) => one.id === id)?.name).toBe(`বিকাশ ${suffix}`);
    const { client: manager } = await createTestClient(appRouter, {
      as: "manager",
    });
    await expect(
      manager.farmAccounts.rename({ id, name: "অন্য" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
