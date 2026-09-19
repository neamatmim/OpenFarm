import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/**
 * When the Owner hears that a Venture's Investors are due their অগ্রগতি.
 *
 * Four occasions, and none of them sends anything: producing the paper is an Export, which is somebody's
 * act and has to name who did it. This is the farm remembering on her behalf.
 *
 * Two Ventures here — one that runs through all four, and one nobody has signed, which must stay silent
 * because there is nobody to send a paper to.
 */
const suffix = `due-${Date.now()}`;

const as = (role: "owner" | "manager", instant: string) =>
  createTestClient(appRouter, { as: role, clock: new FakeClock(instant) });

type Client = Awaited<ReturnType<typeof as>>;

const plan = {
  targetCapitalBdt: 500_000,
  floorBdt: 0,
  decideBy: "2054-01-20",
  targetWindowStart: "2054-02-17",
  targetWindowEnd: "2054-02-19",
  unitPriceBdt: 50_000,
  units: 10,
  cattleBudgetBdt: 400_000,
};

let ventureId = "";
let unsignedId = "";
let penId = "";
let tagNumber = "";

/**
 * The Owner's own list, narrowed to one Venture's tellings.
 *
 * Asked by the Venture rather than read off the whole inbox: the inbox is capped, and a test that
 * filtered a capped list would start failing the day another notice crowded it out.
 */
const papersDue = async (owner: Client, which: string) => {
  const alerts = await owner.client.alerts.mine({ about: which });
  return alerts
    .filter((one) => one.kind === "investor_statement_due")
    .map((one) => (one.params as { occasion?: string }).occasion);
};

beforeAll(async () => {
  const owner = await as("owner", "2054-01-01T04:00:00.000Z");
  const shed = await owner.client.herd.createShed({ name: suffix });
  const pen = await owner.client.herd.createPen({
    shedId: shed.id,
    name: `ফ্যাটেনিং ${suffix}`,
  });
  penId = pen.id;

  const venture = await owner.client.ventures.open({
    name: `ভেঞ্চার ${suffix}`,
    ...plan,
  });
  ventureId = venture.id;
  const person = await owner.client.investors.record({
    name: `বিনিয়োগকারী ${suffix}`,
    phone: "01966000011",
  });
  const agreement = await owner.client.ventures.sign({
    ventureId,
    investorId: person.id,
    units: 10,
    investorsPercent: 60,
    arbitrator: `মাওলানা ${suffix}`,
    stampValueBdt: 300,
    stampedOn: "2054-01-02",
    stampSerial: `AA ${suffix}`,
  });
  await owner.client.ventures.keepAgreementPaper({
    agreementId: agreement.id,
    contentType: "image/jpeg",
    data: "aGVsbG8=",
  });
  await owner.client.ventures.takeCapital({
    agreementId: agreement.id,
    amountBdt: 500_000,
    movedOn: "2054-01-03",
    paymentMethod: "bank",
    reference: `TRF-${suffix}`,
  });
  await owner.client.ventures.startBuying({ id: ventureId });

  // A second Venture nobody has signed, moved on to Buying all the same — its Floor is nothing — so
  // that the silence about it is about having no Investors and not about its state.
  const nobodys = await owner.client.ventures.open({
    name: `স্বাক্ষরহীন ${suffix}`,
    ...plan,
  });
  unsignedId = nobodys.id;
  await owner.client.ventures.startBuying({ id: unsignedId });

  // One bull, so the run has something to sell.
  const buying = await as("owner", "2054-01-04T04:00:00.000Z");
  const trip = await buying.client.trips.record({
    wentTo: `হাট ${suffix}`,
    wentOn: "2054-01-04",
    brokerBdt: 0,
    transportBdt: 0,
    keepBdt: 0,
  });
  await buying.client.ventures.drawFloat({
    ventureId,
    buyingTripId: trip.id,
    amountBdt: 200_000,
    movedOn: "2054-01-04",
    paymentMethod: "bank",
    reference: `FLT-${suffix}`,
  });
  const manager = await as("manager", "2054-01-04T05:00:00.000Z");
  const her = await manager.client.intake.record({
    penId,
    sex: "male",
    seller: { name: `ব্যাপারী ${suffix}` },
    purchasePriceBdt: 100_000,
    weightKg: 200,
    estimatedAgeMonths: 20,
    buyingTripId: trip.id,
    ventureId,
    arrivedAt: new Date("2054-01-04T05:00:00.000Z"),
    targetWindowStart: plan.targetWindowStart,
    targetWindowEnd: plan.targetWindowEnd,
  });
  ({ tagNumber } = her);
  await buying.client.ventures.reconcileFloat({
    buyingTripId: trip.id,
    cashBackBdt: 100_000,
    movedOn: "2054-01-04",
    reference: `DEP-${suffix}`,
  });
});

describe("hearing that a paper is due", () => {
  it("tells the Owner when buying closes", async () => {
    const owner = await as("owner", "2054-01-10T04:00:00.000Z");
    await owner.client.ventures.startFattening({ id: ventureId });
    // Said in words a person reads, not as the word the code keeps.
    expect(await papersDue(owner, ventureId)).toContain(
      "পশু কেনা শেষ / buying closed"
    );
    // And it names the Venture and how many are waiting, so she knows the size of the evening's post.
    const inbox = await owner.client.alerts.mine({ about: ventureId });
    const told = inbox.find(
      (one) => one.entityId === `${ventureId}:buying_closed`
    );
    expect(told?.params).toMatchObject({
      venture: `ভেঞ্চার ${suffix}`,
      investors: 1,
    });
  });

  it("tells her at the first Sale", async () => {
    const selling = await as("manager", "2054-02-18T05:00:00.000Z");
    await selling.client.sale.record({
      tagNumber,
      buyer: { name: `ক্রেতা ${suffix}` },
      priceBdt: 150_000,
      weightKg: 320,
      destination: `ঢাকা ${suffix}`,
      vehicle: `ঢাকা মেট্রো ${suffix}`,
      driver: `চালক ${suffix}`,
      paymentMethod: "bank",
    });
    const owner = await as("owner", "2054-02-18T06:00:00.000Z");
    const due = await papersDue(owner, ventureId);
    expect(due.filter((one) => one === "প্রথম বিক্রি / first sale")).toHaveLength(
      1
    );
  });

  it("raises the month once, however often the day is turned", async () => {
    const owner = await as("owner", "2054-02-20T04:00:00.000Z");
    await owner.client.alerts.sweep();
    await owner.client.alerts.sweep();
    const due = await papersDue(owner, ventureId);
    // February raised once, whatever opened the app and however many times.
    expect(due.filter((one) => one === "2054-02")).toHaveLength(1);
  });

  it("raises the next month as its own telling", async () => {
    const owner = await as("owner", "2054-03-05T04:00:00.000Z");
    await owner.client.alerts.sweep();
    const due = await papersDue(owner, ventureId);
    const months = due.filter((one) => one?.startsWith("2054-"));
    expect(months).toContain("2054-02");
    expect(months).toContain("2054-03");
  });

  it("tells her once the Wind-up Period has begun", async () => {
    // The Target Window closed on the 19th of February; the wind-up runs thirty days past it.
    const owner = await as("owner", "2054-03-05T04:00:00.000Z");
    await owner.client.alerts.sweep();
    expect(await papersDue(owner, ventureId)).toContain(
      "গুটিয়ে আনার সময় / wind-up"
    );
  });

  it("says nothing about a Venture nobody has signed", async () => {
    const owner = await as("owner", "2054-03-05T04:00:00.000Z");
    await owner.client.alerts.sweep();
    // It is Buying like the other one, so the silence is about there being nobody to send a paper to.
    const list = await owner.client.ventures.list();
    expect(list.find((one) => one.id === unsignedId)?.state).toBe("buying");
    expect(await papersDue(owner, unsignedId)).toEqual([]);
  });

  it("writes nothing to the trail once everybody has been told", async () => {
    const owner = await as("owner", "2054-03-06T04:00:00.000Z");
    await owner.client.alerts.sweep();
    const before = await owner.client.audit.list({
      entity: "venture",
      entityId: ventureId,
    });
    // A second turn of the same day: everything March has to say has been said, so the sweep must
    // not open a transaction to record having said nothing.
    await owner.client.alerts.sweep();
    const after = await owner.client.audit.list({
      entity: "venture",
      entityId: ventureId,
    });
    expect(after).toHaveLength(before.length);
  });

  it("says nothing about a run that has been called off", async () => {
    // A third Venture, signed and paid into, then called off before it ever bought anything — which is
    // the only state a Venture may be called off in. Its money goes back, and it owes nobody a paper.
    const owner = await as("owner", "2054-03-08T04:00:00.000Z");
    const doomed = await owner.client.ventures.open({
      name: `বাতিল ${suffix}`,
      ...plan,
      decideBy: "2054-03-09",
    });
    const person = await owner.client.investors.record({
      name: `ফেরতপ্রাপ্ত ${suffix}`,
      phone: "01966000021",
    });
    const agreement = await owner.client.ventures.sign({
      ventureId: doomed.id,
      investorId: person.id,
      units: 10,
      investorsPercent: 60,
      arbitrator: `মাওলানা ${suffix}`,
      stampValueBdt: 300,
      stampedOn: "2054-03-08",
      stampSerial: `AA বাতিল ${suffix}`,
    });
    await owner.client.ventures.keepAgreementPaper({
      agreementId: agreement.id,
      contentType: "image/jpeg",
      data: "aGVsbG8=",
    });
    await owner.client.ventures.takeCapital({
      agreementId: agreement.id,
      amountBdt: 500_000,
      movedOn: "2054-03-08",
      paymentMethod: "bank",
      reference: `TRF-বাতিল-${suffix}`,
    });
    const calling = await as("owner", "2054-03-10T04:00:00.000Z");
    const taken = await calling.client.ventures.movements({
      ventureId: doomed.id,
    });
    await calling.client.ventures.cancel({
      id: doomed.id,
      reason: `মূলধন জোগাড় হয়নি ${suffix}`,
      refunds: taken
        .filter((one) => one.kind === "capital_in")
        .map((one) => ({
          movementId: one.id,
          movedOn: "2054-03-10",
          reference: `REF-${suffix}`,
        })),
    });

    const april = await as("owner", "2054-04-02T04:00:00.000Z");
    await april.client.alerts.sweep();
    // April comes round and brings it nothing: a Venture that is over owes nobody anything.
    expect(await papersDue(april, doomed.id)).toEqual([]);
    // And the one still running is still told, so the silence is about the cancelled run and not
    // about the sweep having stopped.
    expect(await papersDue(april, ventureId)).toContain("2054-04");
  });
});
