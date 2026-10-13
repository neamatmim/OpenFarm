import { paperText } from "@OpenFarm/domain";
import { FakeClock, scratchDb, theFarm } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { invitingInvestors } from "../test/portal-client";
import { heldByEach } from "../venture-store";
import { appRouter } from "./index";

const suffix = `${Date.now()}`.slice(-6);
const AT = "2088-01-10T04:00:00.000Z";
const asOwner = async () => {
  const { client } = await createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock(AT),
  });
  return client;
};
const invited = invitingInvestors({ prefix: "018", run: suffix }, AT);
const aVenture = async (name: string) => {
  const owner = await asOwner();
  const { id } = await owner.ventures.open({
    name: `${name} ${suffix}`,
    targetCapitalMoney: 580_000,
    floorMoney: 0,
    decideBy: "2088-01-25",
    targetWindowStart: "2088-11-01",
    targetWindowEnd: "2088-11-10",
    unitPriceMoney: 58_000,
    units: 10,
    cattleBudgetMoney: 400_000,
    capitalPaid: "by_the_month",
  });
  await owner.ventures.setBankAccount({
    id,
    bank: "Test bank",
    accountName: "Venture account",
    accountNumber: `ADV-${id}`,
  });
  return id;
};
const signed = async (ventureId: string, name: string) => {
  const them = await invited(`${name} ${suffix}`);
  const owner = await asOwner();
  const agreement = await owner.ventures.agreements.sign({
    ventureId,
    investorId: them.id,
    units: 1,
    investorsPercent: 60,
    arbitrator: "Test arbitrator",
    stampValueMoney: 300,
    stampedOn: "2088-01-02",
    stampSerial: `ADV-${them.id}`,
  });
  await owner.ventures.agreements.keepPaper({
    agreementId: agreement.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  return { ...them, agreementId: agreement.id };
};
const receipt = (
  agreementId: string,
  amountMoney: number,
  reference: string,
  movedOn = "2088-01-03"
) => ({
  agreementId,
  amountMoney,
  reference,
  movedOn,
  paymentMethod: "bank" as const,
});
const listed = async (id: string) => {
  const owner = await asOwner();
  const rows = await owner.ventures.list();
  return rows.find((one) => one.id === id);
};

beforeAll(async () => {
  const owner = await asOwner();
  await owner.farm.setIdentity({
    address: "Test farm",
    phone: "+8801711000095",
    registrationNumber: `ADV-${suffix}`,
    registrationOffice: "Test office",
    registrationExpiresOn: "2090-03-31",
  });
  await owner.investors.setPortalOpen({ open: true });
  await owner.investors.setPayInNotes({ shown: true });
});

describe("Monthly Sums paid early", () => {
  it("keeps an advance note unconfirmed until the Owner records the actual bank receipt, then shows allocation and a printable acknowledgment", async () => {
    const ventureId = await aVenture("Advance note");
    const them = await signed(ventureId, "Advance investor");
    const owner = await asOwner();
    const sent = await them.client.portal.sendPayInNote({
      agreementId: them.agreementId,
      amountMoney: 45_000,
      sentOn: "2088-01-03",
      way: "bank_transfer",
      reference: "ADV-45000",
      photo: null,
    });
    const pending = await them.client.portal.venture({
      agreementId: them.agreementId,
    });
    expect(pending).toMatchObject({
      howToPay: { owedMoney: 58_000 },
      paymentAllocation: { paidMoney: 0, paidEarlyMoney: 0 },
      payIn: { roomMoney: 13_000 },
    });
    expect(await listed(ventureId)).toMatchObject({
      capitalInMoney: 0,
      cattleBudgetHeldMoney: 0,
      runningBudgetHeldMoney: 0,
    });
    await expect(
      them.client.portal.sendPayInNote({
        agreementId: them.agreementId,
        amountMoney: 13_001,
        sentOn: "2088-01-03",
        way: "bank_transfer",
        reference: "too much",
        photo: null,
      })
    ).rejects.toMatchObject({ data: { refusal: "pay_in_over_owed" } });

    const confirmed = await owner.ventures.takeCapital({
      ...receipt(them.agreementId, 45_000, "ADV-45000"),
      payInNoteId: sent.id,
    });
    expect(confirmed.allocation?.after).toMatchObject({
      cattlePaidMoney: 40_000,
      monthlyPaidMoney: 5000,
      paidEarlyMoney: 5000,
      owedMoney: 13_000,
    });
    const today = await them.client.portal.venture({
      agreementId: them.agreementId,
    });
    expect(today.howToPay).toMatchObject({
      owedMoney: 13_000,
      monthly: { dueMoney: 0, next: { dueOn: "2088-04-10", amount: 1000 } },
    });
    expect(
      today.paymentAllocation?.sums.slice(0, 3).map((one) => one.leftMoney)
    ).toEqual([0, 0, 1000]);
    expect(today.payIn.notes.find((one) => one.id === sent.id)?.state).toBe(
      "received"
    );
    expect(await listed(ventureId)).toMatchObject({
      cattleBudgetHeldMoney: 40_000,
      runningBudgetHeldMoney: 5000,
    });
    const { document } = await them.client.portal.paper({
      kind: "joining",
      agreementId: them.agreementId,
    });
    const text = paperText(document, "en");
    expect(text).toContain("ADV-45000");
    expect(text).toContain("3 January 2088");
    expect(text).toContain("Cattle Part received: 40,000 taka");
    expect(text).toContain("Monthly Sums received: 5,000 taka");
    expect(text).toContain(
      "10 April 2088 · 2,000 taka · 1,000 taka · 1,000 taka"
    );
    const audit = await scratchDb().query.auditEvent.findFirst({
      where: { farmId: theFarm().id, entityId: confirmed.id, action: "create" },
    });
    expect(audit?.after).toMatchObject({
      allocation: { before: { paidMoney: 0 }, after: { paidMoney: 45_000 } },
    });

    await owner.ventures.takeCapital(
      receipt(them.agreementId, 13_000, "ADV-rest")
    );
    const full = await them.client.portal.venture({
      agreementId: them.agreementId,
    });
    expect(full.howToPay).toBeNull();
    expect(full.paymentAllocation?.owedMoney).toBe(0);
    expect(
      full.paymentAllocation?.sums.every((one) => one.leftMoney === 0)
    ).toBe(true);
    await expect(
      owner.ventures.takeCapital(receipt(them.agreementId, 1, "ADV-over"))
    ).rejects.toMatchObject({ data: { refusal: "capital_over_units" } });
  });

  it("does not let one Investor's advance hide another's missing Cattle Part or fund a larger Buying Float", async () => {
    const ventureId = await aVenture("Independent cattle parts");
    const first = await signed(ventureId, "Paid ahead");
    const second = await signed(ventureId, "Cattle part missing");
    const owner = await asOwner();
    await owner.ventures.takeCapital(
      receipt(first.agreementId, 58_000, "all-paid")
    );
    await owner.ventures.takeCapital(
      receipt(second.agreementId, 22_000, "part-paid", "2088-01-06")
    );
    expect(await listed(ventureId)).toMatchObject({
      capitalInMoney: 80_000,
      cattleMoneyShortMoney: 18_000,
      cattleBudgetHeldMoney: 62_000,
      runningBudgetHeldMoney: 18_000,
    });
    await expect(
      owner.ventures.startBuying({ id: ventureId })
    ).rejects.toMatchObject({ data: { refusal: "cattle_money_short" } });
    const past = await heldByEach(
      scratchDb(),
      theFarm().id,
      [ventureId],
      "2088-01-04"
    );
    expect(past.get(ventureId)).toMatchObject({
      capitalInMoney: 58_000,
      cattleCapitalMoney: 40_000,
    });
    await expect(
      second.client.portal.venture({ agreementId: first.agreementId })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await owner.ventures.takeCapital(
      receipt(second.agreementId, 18_000, "cattle-completed")
    );
    await owner.ventures.startBuying({ id: ventureId });
    const trip = await owner.buyingTrips.record({
      wentTo: "Test market",
      wentOn: "2088-01-10",
      brokerMoney: 0,
      transportMoney: 0,
      keepMoney: 0,
    });
    await expect(
      owner.ventures.floats.draw({
        ventureId,
        buyingTripId: trip.id,
        amountMoney: 80_001,
        movedOn: "2088-01-10",
        paymentMethod: "bank",
        reference: "float-over",
      })
    ).rejects.toMatchObject({ data: { refusal: "cattle_budget_short" } });
    await owner.ventures.floats.draw({
      ventureId,
      buyingTripId: trip.id,
      amountMoney: 80_000,
      movedOn: "2088-01-10",
      paymentMethod: "bank",
      reference: "float-cattle-only",
    });
    expect(await listed(ventureId)).toMatchObject({
      cattleBudgetHeldMoney: 0,
      runningBudgetHeldMoney: 18_000,
    });
  });

  it("serializes competing advances at the whole Agreement cap and rejects a repeated bank reference", async () => {
    const ventureId = await aVenture("Concurrent advances");
    const them = await signed(ventureId, "Concurrent investor");
    const owner = await asOwner();
    await owner.ventures.takeCapital(
      receipt(them.agreementId, 40_000, "initial-cattle")
    );
    const results = await Promise.allSettled([
      owner.ventures.takeCapital(receipt(them.agreementId, 10_000, "race-a")),
      owner.ventures.takeCapital(receipt(them.agreementId, 10_000, "race-b")),
    ]);
    expect(results.filter((one) => one.status === "fulfilled")).toHaveLength(1);
    expect(results.find((one) => one.status === "rejected")).toMatchObject({
      reason: { data: { refusal: "capital_over_units" } },
    });
    const repeated = await Promise.allSettled([
      owner.ventures.takeCapital(
        receipt(them.agreementId, 1000, " SAME-reference ")
      ),
      owner.ventures.takeCapital(
        receipt(them.agreementId, 1000, "same-REFERENCE")
      ),
    ]);
    expect(repeated.filter((one) => one.status === "fulfilled")).toHaveLength(
      1
    );
    expect(repeated.find((one) => one.status === "rejected")).toMatchObject({
      reason: { data: { refusal: "capital_reference_taken" } },
    });
    const movements = await owner.ventures.movements.list({ ventureId });
    expect(movements).toHaveLength(3);
    expect(movements.reduce((sum, one) => sum + one.amountMoney, 0)).toBe(
      51_000
    );
    const audit = await scratchDb().query.auditEvent.findMany({
      where: {
        farmId: theFarm().id,
        entity: "venture_movement",
        entityId: { in: movements.map((one) => one.id) },
        action: "create",
      },
    });
    expect(audit).toHaveLength(3);
  });

  it("recomputes allocation after a correction and returns cattle and early sums together on cancellation", async () => {
    const ventureId = await aVenture("Corrected and returned advance");
    const them = await signed(ventureId, "Corrected investor");
    const owner = await asOwner();
    const { id } = await owner.ventures.takeCapital(
      receipt(them.agreementId, 45_000, "corrected-transfer")
    );
    await owner.ventures.movements.correct({
      id,
      reason: "Bank statement shows the actual amount",
      changes: { amountMoney: { from: 45_000, to: 42_000 } },
    });
    const today = await them.client.portal.venture({
      agreementId: them.agreementId,
    });
    expect(today.paymentAllocation).toMatchObject({
      cattlePaidMoney: 40_000,
      monthlyPaidMoney: 2000,
      paidEarlyMoney: 2000,
      owedMoney: 16_000,
    });
    expect(today.howToPay?.monthly?.next).toEqual({
      dueOn: "2088-03-10",
      amount: 2000,
    });
    expect(await listed(ventureId)).toMatchObject({
      cattleBudgetHeldMoney: 40_000,
      runningBudgetHeldMoney: 2000,
    });
    await owner.ventures.cancel({
      id: ventureId,
      reason: "Canceled before buying",
      refunds: [
        {
          movementId: id,
          movedOn: "2088-01-10",
          reference: "returned-advance",
        },
      ],
    });
    const held = await heldByEach(scratchDb(), theFarm().id, [ventureId]);
    expect(held.get(ventureId)).toMatchObject({
      capitalInMoney: 42_000,
      refundedMoney: 42_000,
      cattleCapitalMoney: 0,
    });
    const returned = await them.client.portal.venture({
      agreementId: them.agreementId,
    });
    expect(returned.paymentAllocation?.paidMoney).toBe(0);
    expect(returned.howToPay).toBeNull();
  });

  it("accepts exact paisa amounts up to the cap and refuses fractions the bank cannot hold", async () => {
    const ventureId = await aVenture("Paisa-safe advance");
    const them = await signed(ventureId, "Paisa investor");
    const owner = await asOwner();
    await expect(
      owner.ventures.takeCapital(
        receipt(them.agreementId, 40_000.001, "fractional-paisa")
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      them.client.portal.sendPayInNote({
        agreementId: them.agreementId,
        amountMoney: 0.001,
        sentOn: "2088-01-03",
        way: "bank_transfer",
        reference: "fractional-note",
        photo: null,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await owner.ventures.takeCapital(
      receipt(them.agreementId, 57_999.9, "paisa-part")
    );
    const almost = await them.client.portal.venture({
      agreementId: them.agreementId,
    });
    expect(almost.paymentAllocation?.owedMoney).toBe(0.1);
    expect(almost.paymentAllocation?.sums.at(-1)?.leftMoney).toBe(0.1);
    expect(almost.howToPay?.owedMoney).toBe(0.1);
    const lastNote = await them.client.portal.sendPayInNote({
      agreementId: them.agreementId,
      amountMoney: 0.1,
      sentOn: "2088-01-03",
      way: "bank_transfer",
      reference: "last-paisa",
      photo: null,
    });
    await owner.ventures.takeCapital({
      ...receipt(them.agreementId, 0.1, "last-paisa"),
      payInNoteId: lastNote.id,
    });
    const full = await them.client.portal.venture({
      agreementId: them.agreementId,
    });
    expect(full.paymentAllocation?.owedMoney).toBe(0);
    expect(full.howToPay).toBeNull();
  });
});
