import { session } from "@OpenFarm/db/schema/auth";
import { pen, shed } from "@OpenFarm/db/schema/herd";
import { verifyPin } from "@OpenFarm/domain";
import {
  DAY,
  FakeClock,
  createTestPrincipal,
  scratchDb,
  theFarm,
  thePerson,
} from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import type { Tx } from "./audit";
import {
  acceptInvite,
  endMembership,
  newPin,
  pensOf,
  planInvite,
  rolesOf,
  setPens,
  setPin,
  setRoles,
  signOutOf,
  signedInOn,
  writeInvite,
} from "./membership";
import { appRouter } from "./routers/index";
import { createTestClient } from "./test/client";

const farmId = theFarm().id;
const now = new FakeClock("2046-04-01T04:00:00.000Z").now();
const owner = () => ({ id: thePerson("owner").id, role: "owner" as const });
const manager = () => ({
  id: thePerson("manager").id,
  role: "manager" as const,
});

/** A Pen of this file's own, to hand out and take back. */
let pens = 0;
const aPen = async (): Promise<string> => {
  pens += 1;
  const shedId = `shed-membership-${pens}`;
  const penId = `pen-membership-${pens}`;
  await scratchDb()
    .insert(shed)
    .values({ id: shedId, farmId, name: `মেম্বারশিপ ${pens}`, createdAt: now })
    .onConflictDoNothing();
  await scratchDb()
    .insert(pen)
    .values({ id: penId, farmId, shedId, name: "ক", createdAt: now })
    .onConflictDoNothing();
  return penId;
};

/** Runs a rule against the farm's records and puts them back, so what one of these tests does is not the world
 *  the next one finds. */
const ROLLED_BACK = new Error("rolled back");
const tried = async <T>(run: (tx: Tx) => Promise<T>): Promise<T> => {
  let answer: T | undefined;
  try {
    await scratchDb().transaction(async (tx) => {
      answer = await run(tx);
      throw ROLLED_BACK;
    });
  } catch (error) {
    if (error !== ROLLED_BACK) {
      throw error;
    }
  }
  return answer as T;
};

describe("the farm keeps an Owner", () => {
  it("does not let an Owner take the Role off themselves", async () => {
    await createTestPrincipal("owner", now);

    await expect(
      tried((tx) =>
        setRoles(tx, farmId, thePerson("owner").id, ["manager"], owner(), now)
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("does not let the last Owner's Role be taken off by somebody else", async () => {
    await createTestPrincipal("owner", now);
    // Asked by somebody who is not the Owner being changed — and who holds no Owner Role of their own, so
    // taking this one away would leave the farm with none.
    const asker = { id: thePerson("manager").id, role: "owner" as const };

    await expect(
      tried((tx) =>
        setRoles(tx, farmId, thePerson("owner").id, ["manager"], asker, now)
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
        endMembership(tx, thePerson("owner").id, { by: owner(), now })
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

  it("sees where Barn Staff are signed in and signs them out, and nobody above them", async () => {
    const theOwner = await createTestPrincipal("owner", now);
    const staff = await createTestPrincipal("staff", now);
    const asManager = await createTestClient(appRouter, { as: "manager" });

    // Where the Owner is signed in names her phone and the address it was on; ending it turns her out mid-task.
    await expect(
      asManager.client.people.signedInOn({ userId: theOwner.user.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      asManager.client.people.signOut({
        userId: theOwner.user.id,
        sessionId: theOwner.session.id,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const where = await asManager.client.people.signedInOn({
      userId: staff.user.id,
    });
    expect(where.map((one) => one.id)).toContain(staff.session.id);
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
  it("is four digits, and what the farm keeps of it answers to that PIN and no other", async () => {
    const credential = await newPin("4821");

    expect(await verifyPin("4821", credential.salt, credential.hash)).toBe(
      true
    );
    expect(await verifyPin("1234", credential.salt, credential.hash)).toBe(
      false
    );
    // Two people who choose the same PIN do not share a hash: each gets a salt of their own.
    const another = await newPin("4821");
    expect(another.hash).not.toBe(credential.hash);

    await expect(newPin("48")).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(newPin("abcd")).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

describe("where somebody is signed in", () => {
  it("lists the places they are, and signs them out of one without touching the rest", async () => {
    const them = await createTestPrincipal("vet", now);
    const another = `${them.session.id}-yard`;
    await scratchDb()
      .insert(session)
      .values({
        ...them.session,
        id: another,
        token: `${them.session.token}-yard`,
        ipAddress: "10.0.0.9",
        userAgent: "a phone left in the yard",
      })
      .onConflictDoNothing();

    const both = await signedInOn(scratchDb(), them.user.id, now);
    expect(both.map((one) => one.id)).toContain(another);

    await tried((tx) => signOutOf(tx, them.user.id, another, now));

    // Signing out of somewhere they are not, somewhere that is somebody else's, or somewhere they were signed
    // out of already: each is nothing to do.
    await expect(
      tried((tx) => signOutOf(tx, them.user.id, "no-such-session", now))
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      tried((tx) => signOutOf(tx, thePerson("owner").id, another, now))
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const longSince = new Date(them.session.expiresAt.getTime() + DAY);
    await expect(
      tried((tx) => signOutOf(tx, them.user.id, another, longSince))
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    // And it is not one of the places they are, either.
    expect(await signedInOn(scratchDb(), them.user.id, longSince)).toEqual([]);
  });
});

describe("the Pens somebody keeps", () => {
  it("reopens the assignment they had before rather than starting a second one", async () => {
    const staff = await createTestPrincipal("staff", now);
    const penId = await aPen();

    const twice = await tried(async (tx) => {
      await setPens(
        tx,
        farmId,
        staff.user.id,
        { add: [penId], remove: [] },
        now
      );
      await setPens(
        tx,
        farmId,
        staff.user.id,
        { add: [], remove: [penId] },
        now
      );
      await setPens(
        tx,
        farmId,
        staff.user.id,
        { add: [penId], remove: [] },
        now
      );
      const rows = await tx.query.penAssignment.findMany({
        where: { farmId, userId: staff.user.id, penId },
        columns: { id: true, endedAt: true },
      });
      return { rows, keeps: await pensOf(tx, farmId, staff.user.id) };
    });

    expect(twice.rows).toHaveLength(1);
    expect(twice.rows.at(0)?.endedAt).toBeNull();
    expect(twice.keeps).toEqual([penId]);
  });

  it("refuses a Pen this farm does not have", async () => {
    const staff = await createTestPrincipal("staff", now);

    await expect(
      tried((tx) =>
        setPens(
          tx,
          farmId,
          staff.user.id,
          { add: ["no-such-pen"], remove: [] },
          now
        )
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("taking up an invitation", () => {
  it("grants what it was written for, once, and to that email alone", async () => {
    const newcomer = await createTestPrincipal("newcomer", now);
    await createTestPrincipal("owner", now);
    const planned = await planInvite(
      {
        email: newcomer.user.email,
        name: newcomer.user.name,
        roles: ["staff"],
      },
      owner(),
      now
    );

    const taken = await tried(async (tx) => {
      await writeInvite(tx, farmId, planned);
      const first = await acceptInvite(
        tx,
        farmId,
        {
          userId: newcomer.user.id,
          email: newcomer.user.email,
          codeHash: planned.codeHash,
        },
        now
      );
      const again = await acceptInvite(
        tx,
        farmId,
        {
          userId: newcomer.user.id,
          email: newcomer.user.email,
          codeHash: planned.codeHash,
        },
        now
      );
      return {
        first,
        again,
        holds: await rolesOf(tx, farmId, newcomer.user.id),
      };
    });

    expect(taken.first).toEqual(["staff"]);
    expect(taken.holds).toEqual(["staff"]);
    // The code works once, and a second try is nothing rather than a refusal — a wrong guess for the
    // caller to count.
    expect(taken.again).toBeNull();
  });

  it("is nothing to somebody signed in under another email", async () => {
    const newcomer = await createTestPrincipal("newcomer", now);
    await createTestPrincipal("owner", now);
    const planned = await planInvite(
      { email: "somebody.else@test.openfarm", name: "অন্য", roles: ["staff"] },
      owner(),
      now
    );

    const taken = await tried(async (tx) => {
      await writeInvite(tx, farmId, planned);
      return await acceptInvite(
        tx,
        farmId,
        {
          userId: newcomer.user.id,
          email: newcomer.user.email,
          codeHash: planned.codeHash,
        },
        now
      );
    });

    expect(taken).toBeNull();
  });
});
