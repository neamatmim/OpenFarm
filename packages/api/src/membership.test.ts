import {
  FakeClock,
  createTestPrincipal,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import type { Tx } from "./audit";
import {
  newPin,
  planInvite,
  rolesOf,
  setPin,
  setRoles,
  setStanding,
} from "./membership";

const farmId = theFarm().id;
const now = new FakeClock("2046-04-01T04:00:00.000Z").now();
const owner = () => ({ id: thePerson("owner").id, role: "owner" as const });
const manager = () => ({
  id: thePerson("manager").id,
  role: "manager" as const,
});

/** Runs a rule against the farm's records and puts them back, so what one of these tests does is not the world
 *  the next one finds. */
const ROLLED_BACK = new Error("rolled back");
const tried = async (run: (tx: Tx) => Promise<unknown>): Promise<void> => {
  try {
    await scratchDb().transaction(async (tx) => {
      await run(tx);
      throw ROLLED_BACK;
    });
  } catch (error) {
    if (error !== ROLLED_BACK) {
      throw error;
    }
  }
};

describe("the farm keeps an Owner", () => {
  it("does not let an Owner take the Role off themselves, another Owner or none", async () => {
    await createTestPrincipal("owner", now);

    await expect(
      tried((tx) =>
        setRoles(tx, farmId, thePerson("owner").id, ["manager"], owner(), now)
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("lets one Owner take the Role off another, once there is another", async () => {
    await createTestPrincipal("owner", now);
    const second = await createTestPrincipal("manager", now);

    // Two Owners stand, so the second may be made a Manager again by the first.
    await tried(async (tx) => {
      await setRoles(tx, farmId, second.user.id, ["owner"], owner(), now);
      await setRoles(tx, farmId, second.user.id, ["manager"], owner(), now);
      expect(await rolesOf(tx, farmId, second.user.id)).toEqual(["manager"]);
    });
  });

  it("does not let somebody end their own Membership", async () => {
    await createTestPrincipal("owner", now);

    await expect(
      tried((tx) =>
        setStanding(tx, thePerson("owner").id, {
          disabled: true,
          by: owner(),
          now,
        })
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("what a Manager may do", () => {
  it("gives a PIN to Barn Staff and to nobody above them", async () => {
    await createTestPrincipal("staff", now);
    await createTestPrincipal("owner", now);
    const credential = await newPin("4821");

    await tried((tx) =>
      setPin(tx, farmId, thePerson("staff").id, credential, manager(), now)
    );
    await expect(
      tried((tx) =>
        setPin(tx, farmId, thePerson("owner").id, credential, manager(), now)
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("invites Barn Staff and calls in a visiting Vet, and writes no other invitation", async () => {
    const asked = { email: "new@test.openfarm", name: "নতুন" };

    expect(
      await planInvite({ ...asked, roles: ["staff"] }, manager(), now)
    ).toMatchObject({ status: "pending", accessUntil: null });
    expect(
      await planInvite(
        { ...asked, roles: ["vet"], visitUntil: "2046-04-03" },
        manager(),
        now
      )
    ).toMatchObject({ status: "pending", visitUntil: "2046-04-03" });
    // The Owner's own invitation stands approved as they make it.
    expect(
      await planInvite({ ...asked, roles: ["manager"] }, owner(), now)
    ).toMatchObject({ status: "approved" });

    await expect(
      planInvite({ ...asked, roles: ["manager"] }, manager(), now)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      planInvite(
        { ...asked, roles: ["staff"], visitUntil: "2046-04-03" },
        owner(),
        now
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // A visit that ended before today is no visit.
    await expect(
      planInvite(
        { ...asked, roles: ["vet"], visitUntil: "2046-03-01" },
        owner(),
        now
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

/** A PIN is never stored: what the farm keeps is a salt and a hash worked out from it. */
describe("a PIN", () => {
  it("is four digits, and what the farm keeps of it is not the PIN", async () => {
    const credential = await newPin("4821");

    expect(credential.hash).not.toContain("4821");
    expect(credential.salt).not.toContain("4821");
    await expect(newPin("48")).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(newPin("abcd")).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});
