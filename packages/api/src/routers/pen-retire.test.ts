import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// A torn-down Pen is retired once it stands empty: out of every picker, and nothing put into it — and brought back as
// it was.

const suffix = `${Date.now()}`.slice(-7);

const managerClient = async () => {
  const { client } = await createTestClient(appRouter, { as: "manager" });
  return client;
};

describe("retiring a Pen", () => {
  it("is refused while it holds an animal, a Ration, or is the quarantine pen", async () => {
    const manager = await managerClient();
    const shed = await manager.sheds.create({ name: `ভাঙা শেড ${suffix}` });
    const held = await manager.sheds.pens.create({
      shedId: shed.id,
      name: `ভরা ${suffix}`,
    });
    await manager.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: held.id,
      source: "bought",
      aliases: [],
    });
    await expect(
      manager.sheds.pens.retire({ penId: held.id })
    ).rejects.toMatchObject({ data: { refusal: "pen_holds_animals" } });

    const fed = await manager.sheds.pens.create({
      shedId: shed.id,
      name: `রেশনে ${suffix}`,
    });
    const hay = await manager.feed.items.create({
      name: { bn: `খড় ${suffix}` },
    });
    const ration = await manager.feed.rations.save({
      name: { bn: `খড়ের রেশন ${suffix}` },
      items: [{ feedItemId: hay.id, kgPerAnimalPerDay: 2 }],
    });
    await manager.feed.rations.assign({
      penId: fed.id,
      rationId: ration.rationId,
    });
    await expect(
      manager.sheds.pens.retire({ penId: fed.id })
    ).rejects.toMatchObject({ data: { refusal: "pen_on_a_ration" } });

    const apart = await manager.sheds.pens.create({
      shedId: shed.id,
      name: `আলাদা ${suffix}`,
      quarantine: true,
    });
    await expect(
      manager.sheds.pens.retire({ penId: apart.id })
    ).rejects.toMatchObject({ data: { refusal: "pen_is_quarantine" } });
  });

  it("takes an empty one out of the pickers and puts nothing into it, until it is brought back", async () => {
    const manager = await managerClient();
    const shed = await manager.sheds.create({ name: `পুরনো শেড ${suffix}` });
    const empty = await manager.sheds.pens.create({
      shedId: shed.id,
      name: `খালি ${suffix}`,
    });
    await manager.sheds.pens.retire({ penId: empty.id });
    // A second tap changes nothing.
    await manager.sheds.pens.retire({ penId: empty.id });

    const listed = await manager.sheds.list();
    const pens = listed.flatMap((one) => one.pens.map((each) => each.id));
    expect(pens).not.toContain(empty.id);
    const everything = await manager.sheds.list({ withRetired: true });
    expect(
      everything.flatMap((one) => one.pens.map((each) => each.id))
    ).toContain(empty.id);
    await expect(
      manager.animals.register({
        sex: "female",
        side: "dairy",
        state: "heifer",
        penId: empty.id,
        source: "bought",
        aliases: [],
      })
    ).rejects.toMatchObject({ data: { refusal: "pen_retired" } });

    await manager.sheds.pens.restore({ penId: empty.id });
    await manager.animals.register({
      sex: "female",
      side: "dairy",
      state: "heifer",
      penId: empty.id,
      source: "bought",
      aliases: [],
    });
  });
});

describe("retiring a Shed", () => {
  it("waits until every Pen in it is retired, then leaves the lists and takes no new Pen until brought back", async () => {
    const manager = await managerClient();
    const shed = await manager.sheds.create({ name: `ভাঙা শেড ২ ${suffix}` });
    const pen = await manager.sheds.pens.create({
      shedId: shed.id,
      name: `শেষ পেন ${suffix}`,
    });
    await expect(
      manager.sheds.retire({ shedId: shed.id })
    ).rejects.toMatchObject({ data: { refusal: "shed_has_pens" } });

    await manager.sheds.pens.retire({ penId: pen.id });
    await manager.sheds.retire({ shedId: shed.id });
    const listed = await manager.sheds.list();
    expect(listed.some((one) => one.id === shed.id)).toBe(false);
    const everything = await manager.sheds.list({ withRetired: true });
    expect(everything.some((one) => one.id === shed.id)).toBe(true);
    await expect(
      manager.sheds.pens.create({ shedId: shed.id, name: `নতুন ${suffix}` })
    ).rejects.toMatchObject({ data: { refusal: "shed_retired" } });
    await expect(
      manager.sheds.pens.restore({ penId: pen.id })
    ).rejects.toMatchObject({ data: { refusal: "shed_retired" } });

    await manager.sheds.restore({ shedId: shed.id });
    await manager.sheds.pens.create({ shedId: shed.id, name: `নতুন ${suffix}` });
  });
});
