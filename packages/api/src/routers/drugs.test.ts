import { FakeClock } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

describe("the Drug List", () => {
  it("lets the Manager write down what was bought, and the Vet say what it costs the milk", async () => {
    const clock = new FakeClock("2028-03-01T03:00:00.000Z");
    const manager = await createTestClient(appRouter, { as: "manager", clock });
    const vet = await createTestClient(appRouter, { as: "vet", clock });

    // Bought this morning; the Vet is not here and the box is in the store.
    const bought = await manager.client.drugs.add({
      name: { bn: `অক্সিটেট্রাসাইক্লিন ${Date.now()}`, en: "Oxytetracycline" },
    });

    const beforeTheVet = await manager.client.drugs.list();
    const waiting = beforeTheVet.find((one) => one.id === bought.id);
    expect(waiting?.milkWithdrawalDays).toBeNull();
    // Nothing may be prescribed on a guess: the days are what the label says and only the
    // Vet reads it off.
    expect(waiting?.prescribable).toBe(false);

    await vet.client.drugs.setWithdrawal({
      id: bought.id,
      milkWithdrawalDays: 4,
      meatWithdrawalDays: 21,
    });

    const afterTheVet = await manager.client.drugs.list();
    const ready = afterTheVet.find((one) => one.id === bought.id);
    expect(ready).toMatchObject({
      milkWithdrawalDays: 4,
      meatWithdrawalDays: 21,
      prescribable: true,
    });
  });

  it("will not let anybody but the Vet say what the days are", async () => {
    const manager = await createTestClient(appRouter, { as: "manager" });
    const staff = await createTestClient(appRouter, { as: "staff" });

    // A Manager may write down what was bought, but not what it costs the milk.
    await expect(
      manager.client.drugs.add({
        name: { bn: `পেনিসিলিন ${Date.now()}` },
        milkWithdrawalDays: 3,
        meatWithdrawalDays: 14,
      })
    ).rejects.toThrow(/Only the Vet writes the withdrawal days/u);

    const bought = await manager.client.drugs.add({
      name: { bn: `পেনিসিলিন ${Date.now()}` },
    });
    await expect(
      manager.client.drugs.setWithdrawal({
        id: bought.id,
        milkWithdrawalDays: 3,
        meatWithdrawalDays: 14,
      })
    ).rejects.toThrow();

    // And Staff have no business in the Drug List at all.
    await expect(staff.client.drugs.list()).rejects.toThrow();
  });

  it("keeps a retired product, because a Treatment given last March still names it", async () => {
    const vet = await createTestClient(appRouter, { as: "vet" });
    const old = await vet.client.drugs.add({
      name: { bn: `পুরনো ওষুধ ${Date.now()}` },
      milkWithdrawalDays: 2,
      meatWithdrawalDays: 7,
    });

    await vet.client.drugs.retire({ id: old.id });

    const list = await vet.client.drugs.list();
    const retired = list.find((one) => one.id === old.id);
    expect(retired?.retiredAt).not.toBeNull();
    // Still on the list, and no longer something to prescribe from.
    expect(retired?.prescribable).toBe(false);
  });

  it("refuses days that are not days", async () => {
    const vet = await createTestClient(appRouter, { as: "vet" });
    const product = await vet.client.drugs.add({
      name: { bn: `ভুল দিন ${Date.now()}` },
    });

    await expect(
      vet.client.drugs.setWithdrawal({
        id: product.id,
        milkWithdrawalDays: -1,
        meatWithdrawalDays: 7,
      })
    ).rejects.toThrow();
  });

  it("says why a product cannot be prescribed, in words", async () => {
    const manager = await createTestClient(appRouter, { as: "manager" });
    const bought = await manager.client.drugs.add({
      name: { bn: `অপেক্ষায় ${Date.now()}` },
    });

    const list = await manager.client.drugs.list();
    const waiting = list.find((one) => one.id === bought.id);
    expect(waiting?.whyNot).toMatch(/no withdrawal days written down/u);
  });
});
