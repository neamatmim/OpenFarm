import { scratchDb } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// The farm's lists — breeds, feeds, medicines, Categories, Investors, notifiable diseases — kept one way. Each list
// is asked the same questions here, so a list that drifts from the others goes red on its own row.

type Client = Awaited<
  ReturnType<typeof createTestClient<typeof appRouter>>
>["client"];

const suffix = `${Date.now()}`;
let owner: Client;
let manager: Client;
let vet: Client;

beforeAll(async () => {
  ({ client: owner } = await createTestClient(appRouter, { as: "owner" }));
  ({ client: manager } = await createTestClient(appRouter, { as: "manager" }));
  ({ client: vet } = await createTestClient(appRouter, { as: "vet" }));
});

/** The id of what was just added. */
const idOf = async (made: Promise<{ id: string }>) => {
  const { id } = await made;
  return id;
};

/** One list, as these questions ask it: how an entry is added, retired and brought back. */
interface AList {
  name: string;
  entity: string;
  add: (label: string) => Promise<string>;
  retire: (id: string) => Promise<unknown>;
  bringBack: (id: string) => Promise<unknown>;
}

const LISTS: AList[] = [
  {
    name: "breeds",
    entity: "breed",
    add: (label) => idOf(owner.breeds.add({ nameBn: label })),
    retire: (id) => owner.breeds.retire({ id }),
    bringBack: (id) => owner.breeds.restore({ id }),
  },
  {
    name: "feeds",
    entity: "feed_item",
    add: (label) =>
      idOf(manager.feed.addItem({ name: { bn: label }, unit: "kg" })),
    retire: (id) => manager.feed.retireItem({ id }),
    bringBack: (id) => manager.feed.bringBackItem({ id }),
  },
  {
    name: "medicines",
    entity: "drug_product",
    add: (label) => idOf(manager.drugs.add({ name: { bn: label } })),
    retire: (id) => vet.drugs.retire({ id }),
    bringBack: (id) => vet.drugs.bringBack({ id }),
  },
  {
    name: "Categories",
    entity: "money_category",
    add: (label) =>
      idOf(owner.money.addCategory({ nameBn: label, direction: "out" })),
    retire: (id) => owner.money.retireCategory({ id }),
    bringBack: (id) => owner.money.bringBackCategory({ id }),
  },
  {
    name: "Investors",
    entity: "investor",
    add: (label) =>
      idOf(
        owner.investors.record({
          name: label,
          phone: `017${suffix.slice(-8)}`,
          address: "সাভার",
          nid: "1234567890",
          bankAccount: "0123456789",
        })
      ),
    retire: (id) => owner.investors.retire({ id }),
    bringBack: (id) => owner.investors.bringBack({ id }),
  },
  {
    name: "notifiable diseases",
    entity: "notifiable_disease",
    add: (label) => idOf(manager.notifiable.add({ name: { bn: label } })),
    retire: (id) => manager.notifiable.retire({ id, reason: "অফিস বলেছে" }),
    bringBack: (id) =>
      manager.notifiable.bringBack({ id, reason: "অফিস আবার বলেছে" }),
  },
];

/** How many times the trail says an entry was changed. */
const changesTo = async (entity: string, id: string) => {
  const changes = await scratchDb().query.auditEvent.findMany({
    where: { entity, entityId: id, action: "update" },
    columns: { id: true },
  });
  return changes.length;
};

describe.each(LISTS)("the $name list", (list) => {
  it("retires an entry once: retiring it again changes nothing and writes nothing", async () => {
    const id = await list.add(`${list.name} এক ${suffix}`);

    await list.retire(id);
    await list.retire(id);

    expect(await changesTo(list.entity, id)).toBe(1);
  });

  it("brings back only what was retired: bringing back an entry in use writes nothing", async () => {
    const id = await list.add(`${list.name} দুই ${suffix}`);

    await list.bringBack(id);
    expect(await changesTo(list.entity, id)).toBe(0);

    await list.retire(id);
    await list.bringBack(id);
    expect(await changesTo(list.entity, id)).toBe(2);
  });

  it("says there is no such entry for one that is not the farm's", async () => {
    await expect(list.retire("not-an-entry")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("a name on a list", () => {
  it("is taken in either language, whatever the capitals — Categories and diseases as much as feeds", async () => {
    await owner.money.addCategory({
      nameBn: `বিদ্যুৎ ${suffix}`,
      nameEn: `Power ${suffix}`,
      direction: "out",
    });
    await manager.notifiable.add({
      name: { bn: `জ্বর ${suffix}`, en: `Fever ${suffix}` },
    });

    await expect(
      owner.money.addCategory({
        nameBn: `অন্য নাম ${suffix}`,
        nameEn: `POWER ${suffix}`,
        direction: "out",
      })
    ).rejects.toMatchObject({ data: { refusal: "category_exists" } });
    await expect(
      manager.notifiable.add({
        name: { bn: `অন্য জ্বর ${suffix}`, en: `fever ${suffix}` },
      })
    ).rejects.toMatchObject({ data: { refusal: "disease_exists" } });
  });

  it("names a retired entry as retired, so it is brought back rather than written twice", async () => {
    const { id } = await manager.notifiable.add({
      name: { bn: `তড়কা ${suffix}` },
    });
    await manager.notifiable.retire({ id, reason: "অফিস বলেছে" });

    await expect(
      manager.notifiable.add({ name: { bn: `তড়কা ${suffix}` } })
    ).rejects.toMatchObject({
      data: { refusal: "disease_exists_retired", id, retired: true },
    });
  });
});

describe("a Ration", () => {
  it("does not feed what the farm has retired", async () => {
    const { id } = await manager.feed.addItem({
      name: { bn: `পুরনো খড় ${suffix}` },
      unit: "kg",
    });
    await manager.feed.retireItem({ id });

    await expect(
      manager.feed.saveRation({
        name: { bn: `রেশন ${suffix}` },
        items: [{ feedItemId: id, kgPerAnimalPerDay: 2 }],
      })
    ).rejects.toMatchObject({ data: { refusal: "feed_retired" } });
  });
});
