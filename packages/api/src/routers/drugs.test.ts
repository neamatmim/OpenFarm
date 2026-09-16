import { FakeClock, scratchDb, thePerson } from "@OpenFarm/test-harness";
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
    expect(waiting?.whyNot).toBe("no_withdrawal_days");

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
    ).rejects.toThrow(/Only the Vet keeps the Drug List/u);

    // Nor half of it: one day on its own is half a Withdrawal.
    await expect(
      manager.client.drugs.add({
        name: { bn: `অর্ধেক ${Date.now()}` },
        milkWithdrawalDays: 3,
      })
    ).rejects.toThrow();

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
    const bnName = `পুরনো ওষুধ ${Date.now()}`;
    const old = await vet.client.drugs.add({
      name: { bn: bnName },
      milkWithdrawalDays: 2,
      meatWithdrawalDays: 7,
    });

    await vet.client.drugs.retire({ id: old.id });

    const list = await vet.client.drugs.list();
    const retired = list.find((one) => one.id === old.id);
    expect(retired?.retiredAt).not.toBeNull();
    // Still on the list, and no longer something to prescribe from — and the reason says
    // retired rather than claiming nobody has written its days.
    expect(retired?.prescribable).toBe(false);
    expect(retired?.whyNot).toBe("retired");

    // Bought again under its own name: brought back rather than added twice, so the farm
    // does not end up with two rows for one product.
    await expect(
      vet.client.drugs.add({ name: { bn: bnName } })
    ).rejects.toThrow(/already on the list, retired/u);
    await vet.client.drugs.bringBack({ id: old.id });
    const back = await vet.client.drugs.list();
    expect(back.find((one) => one.id === old.id)?.prescribable).toBe(true);
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
    expect(waiting?.whyNot).toBe("no_withdrawal_days");
  });

  it("writes down who said what the days are, and records the saying of it", async () => {
    const vet = await createTestClient(appRouter, { as: "vet" });
    const product = await vet.client.drugs.add({
      name: { bn: `প্রমাণ ${Date.now()}` },
    });

    await vet.client.drugs.setWithdrawal({
      id: product.id,
      milkWithdrawalDays: 5,
      meatWithdrawalDays: 28,
    });

    const list = await vet.client.drugs.list();
    const written = list.find((one) => one.id === product.id);
    // The days are what the farm shows a slaughter vet, so who wrote them is evidence too.
    expect(written?.daysSetBy).toBe(thePerson("vet").id);
    expect(written?.daysSetAt).toBeInstanceOf(Date);

    const events = await scratchDb().query.auditEvent.findMany({
      where: { entity: "drug_product", entityId: product.id },
      orderBy: { receivedAt: "asc", id: "asc" },
    });
    expect(events.map((event) => event.action)).toEqual(["create", "update"]);
    expect(events[1]?.after).toMatchObject({ milkWithdrawalDays: 5 });
  });

  it("will not take the days from a Shed Phone, whoever is PIN-switched in", async () => {
    const phone = await createTestClient(appRouter, {
      as: "vet",
      onShedPhone: true,
      phone: { id: "test-phone-drugs", name: "ওষুধের শেড ফোন" },
    });
    const vet = await createTestClient(appRouter, { as: "vet" });
    const product = await vet.client.drugs.add({
      name: { bn: `ফোন থেকে ${Date.now()}` },
    });

    // The days are the prescriber's own statement, not something a handset says for them.
    await expect(
      phone.client.drugs.setWithdrawal({
        id: product.id,
        milkWithdrawalDays: 2,
        meatWithdrawalDays: 10,
      })
    ).rejects.toThrow();
  });
});
