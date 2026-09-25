import { waitsForTheDigest } from "@OpenFarm/domain";
import { FakeClock } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import type { PushMessage, PushTarget, PushTransport } from "../push";
import { createTestClient } from "../test/client";
import { anInvitedInvestor, signedInAs } from "../test/portal-client";
import { appRouter } from "./index";

// The Owner told of a Request to Join: one Notice per Request, carried by the evening's Digest, heard by the Owner
// alone. It follows the Request through its changes and goes when the Request is withdrawn before an answer.

const suffix = `${Date.now()}`.slice(-6);
const MORNING = "2053-01-01T04:00:00.000Z";
const LATER = "2053-01-02T04:00:00.000Z";

const as = async (role: "owner" | "manager", at = MORNING) => {
  const { client } = await createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(at),
  });
  return client;
};

let phones = 0;

const invited = (name: string) => {
  phones += 1;
  const phone = `018${String(phones).padStart(2, "0")}${suffix}`;
  return anInvitedInvestor({ name: `${name} ${suffix}`, phone }, MORNING);
};

/** A Venture shown in the portal, taking requests. */
const aShownVenture = async (name: string) => {
  const owner = await as("owner");
  const venture = await owner.ventures.open({
    name: `${name} ${suffix}`,
    targetCapitalBdt: 1_000_000,
    floorBdt: 600_000,
    decideBy: "2053-01-20",
    targetWindowStart: "2053-06-01",
    targetWindowEnd: "2053-06-10",
    unitPriceBdt: 50_000,
    units: 20,
    cattleBudgetBdt: 800_000,
  });
  await owner.ventures.showInPortal({ id: venture.id, words: "" });
  return venture.id;
};

/** What somebody's own list says about Requests on one Venture. */
const toldAbout = async (role: "owner" | "manager", ventureId: string) => {
  const client = await as(role);
  const alerts = await client.alerts.mine({ about: ventureId });
  return alerts.filter((one) => one.kind === "join_requested");
};

beforeAll(async () => {
  const owner = await as("owner");
  await owner.investors.setPortalOpen({ open: true });
  // The Manager is on the farm before anybody asks, or "the Manager was not told" would only mean there was none.
  await as("manager");
});

describe("a Request to Join, told to the Owner", () => {
  it("is one Notice for the Owner, naming the Investor, the Venture and the Units — and the Manager is not told", async () => {
    const ventureId = await aShownVenture("শোনার ভেঞ্চার");
    const karim = await invited("করিম");

    const made = await karim.client.portal.requestToJoin({
      ventureId,
      units: 4,
      note: "",
    });

    const owners = await toldAbout("owner", ventureId);
    expect(owners).toHaveLength(1);
    expect(owners[0]).toMatchObject({
      entity: "request_to_join",
      params: {
        requestId: made.id,
        ventureId,
        venture: `শোনার ভেঞ্চার ${suffix}`,
        investor: `করিম ${suffix}`,
        units: 4,
      },
    });
    expect(await toldAbout("manager", ventureId)).toEqual([]);
  });

  it("follows the Request through its changes: changed three times, it is still one Notice, saying the latest", async () => {
    const ventureId = await aShownVenture("বদলের ভেঞ্চার");
    const salma = await invited("সালমা");
    await salma.client.portal.requestToJoin({ ventureId, units: 2, note: "" });

    for (const units of [3, 5, 6]) {
      // Sequential: one change after another, as she makes them.
      // oxlint-disable-next-line no-await-in-loop
      await salma.client.portal.requestToJoin({ ventureId, units, note: "" });
    }

    const owners = await toldAbout("owner", ventureId);
    expect(
      owners.map((one) => (one.params as { units: number }).units)
    ).toEqual([6]);
  });

  it("comes back to the Owner's list when the Investor changes a Request the Owner had put away", async () => {
    const ventureId = await aShownVenture("ফেরার ভেঞ্চার");
    const jamal = await invited("জামাল");
    await jamal.client.portal.requestToJoin({ ventureId, units: 2, note: "" });
    const owner = await as("owner");
    const [first] = await toldAbout("owner", ventureId);
    await owner.alerts.dismiss({ id: first?.id ?? "" });
    expect(await toldAbout("owner", ventureId)).toEqual([]);

    const later = await signedInAs(jamal.loginEmail, LATER);
    await later.portal.requestToJoin({ ventureId, units: 8, note: "" });

    const owners = await toldAbout("owner", ventureId);
    expect(
      owners.map((one) => [one.id, (one.params as { units: number }).units])
    ).toEqual([[first?.id, 8]]);
  });

  it("goes from the Owner's list when the Investor withdraws before an answer", async () => {
    const ventureId = await aShownVenture("তুলে নেওয়ার ভেঞ্চার");
    const rina = await invited("রিনা");
    const made = await rina.client.portal.requestToJoin({
      ventureId,
      units: 3,
      note: "",
    });
    expect(await toldAbout("owner", ventureId)).toHaveLength(1);

    await rina.client.portal.withdrawRequest({ requestId: made.id });

    expect(await toldAbout("owner", ventureId)).toEqual([]);
  });

  it("is a new Notice when the Investor asks again after withdrawing: a new Request is new news", async () => {
    const ventureId = await aShownVenture("আবার চাওয়ার ভেঞ্চার");
    const babul = await invited("বাবুল");
    const first = await babul.client.portal.requestToJoin({
      ventureId,
      units: 3,
      note: "",
    });
    await babul.client.portal.withdrawRequest({ requestId: first.id });

    const second = await babul.client.portal.requestToJoin({
      ventureId,
      units: 1,
      note: "",
    });

    const owners = await toldAbout("owner", ventureId);
    expect(
      owners.map((one) => (one.params as { requestId: string }).requestId)
    ).toEqual([second.id]);
  });
});

/** Everything the farm tried to push, and to whom. */
const listeningPost = () => {
  const sent: { target: PushTarget; message: PushMessage }[] = [];
  const transport: PushTransport = {
    send: (target, message) => {
      sent.push({ target, message });
      return Promise.resolve({ delivered: true, gone: false });
    },
  };
  return { transport, sent };
};

describe("when the Owner hears of it", () => {
  it("waits for the Digest, never going on its own", () => {
    expect(waitsForTheDigest("join_requested")).toBe(true);
  });

  it("is carried in the evening's post, named for what it is", async () => {
    const ventureId = await aShownVenture("সন্ধ্যার ভেঞ্চার");
    const nila = await invited("নীলা");
    const post = listeningPost();
    const clock = new FakeClock(MORNING);
    const { client: owner } = await createTestClient(appRouter, {
      as: "owner",
      clock,
      push: post.transport,
    });
    const endpoint = `https://push.example.com/join-${suffix}`;
    await owner.push.listen({
      endpoint,
      p256dh: "test-p256dh-key",
      auth: "test-auth-key",
    });

    await nila.client.portal.requestToJoin({ ventureId, units: 2, note: "" });
    // Six in the evening, farm time.
    clock.set("2053-01-01T12:00:00.000Z");
    await owner.alerts.digest();

    const theirs = post.sent.filter((one) => one.target.endpoint === endpoint);
    expect(theirs).toHaveLength(1);
    expect(theirs[0]?.message.body).toContain("যোগ দেওয়ার অনুরোধ");
  });
});
