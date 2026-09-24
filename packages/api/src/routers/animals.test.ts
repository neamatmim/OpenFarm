import { readFileSync } from "node:fs";

import { penAssignment } from "@OpenFarm/db/schema/herd";
import { scratchDb, theFarm, thePerson } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

/** One shed with a dairy pen, a fattening pen and a staff-assigned pen, made once. */
const setup = async () => {
  const owner = await createTestClient(appRouter, { as: "owner" });
  const sheds = await owner.client.herd.list();
  let shedId = sheds[0]?.id;
  if (!shedId) {
    const created = await owner.client.herd.createShed({ name: "শেড A" });
    shedId = created.id;
  }
  const named = async (name: string) => {
    const all = await owner.client.herd.list();
    const found = all.flatMap((s) => s.pens).find((p) => p.name === name);
    if (found) {
      return found.id;
    }
    const created = await owner.client.herd.createPen({ shedId, name });
    return created.id;
  };
  return {
    owner,
    dairyPen: await named("পেন ১"),
    fatteningPen: await named("পেন ২"),
    staffPen: await named("পেন ৩"),
  };
};

let pens: Awaited<ReturnType<typeof setup>>;

beforeAll(async () => {
  pens = await setup();
  // Seed the Staff principal first: the Pen Assignment below references them.
  await createTestClient(appRouter, { as: "staff" });
  await scratchDb()
    .insert(penAssignment)
    .values({
      id: "pa-staff",
      farmId: theFarm().id,
      userId: thePerson("staff").id,
      penId: pens.staffPen,
    })
    .onConflictDoNothing();
});

const registerDairyCalf = (penId = pens.dairyPen) =>
  pens.owner.client.animals.register({
    sex: "female",
    side: "dairy",
    state: "calf",
    penId,
    source: "born",
    aliases: [],
  });

describe("sheds and pens", () => {
  it("creates and renames a shed and a pen", async () => {
    const { client } = pens.owner;
    const shed = await client.herd.createShed({ name: `শেড ${Date.now()}` });
    const pen = await client.herd.createPen({ shedId: shed.id, name: "পেন ক" });

    await client.herd.renameShed({ id: shed.id, name: "শেড খ" });
    await client.herd.renamePen({ id: pen.id, name: "পেন গ" });

    const listed = await client.herd.list();
    const found = listed.find((s) => s.id === shed.id);
    expect(found?.name).toBe("শেড খ");
    expect(found?.pens.map((p) => p.name)).toEqual(["পেন গ"]);
  });
});

describe("tag numbers", () => {
  it("assigns D- to dairy-born and F- to fattening intake, in sequence", async () => {
    const first = await registerDairyCalf();
    const second = await registerDairyCalf();
    const bought = await pens.owner.client.animals.register({
      sex: "male",
      side: "fattening",
      state: "quarantine",
      penId: pens.fatteningPen,
      source: "bought",
      aliases: [],
    });

    expect(first.tagNumber).toMatch(/^D-\d{4}$/u);
    expect(bought.tagNumber).toMatch(/^F-\d{4}$/u);
    // Only that the sequence moves forward, never that the two are adjacent: other test
    // files register their own animals against this same farm at the same time, and taking
    // a number is exactly the operation that is allowed to interleave.
    expect(Number(second.tagNumber.slice(2))).toBeGreaterThan(
      Number(first.tagNumber.slice(2))
    );
  });

  it("never reuses a number, even after the animal has left", async () => {
    const gone = await registerDairyCalf();
    await pens.owner.client.animals.recordMortality({
      tagNumber: gone.tagNumber,
      kind: "died",
      cause: "test",
      disposal: "buried",
    });

    const next = await registerDairyCalf();

    expect(next.tagNumber).not.toBe(gone.tagNumber);
    expect(Number(next.tagNumber.slice(2))).toBeGreaterThan(
      Number(gone.tagNumber.slice(2))
    );
  });

  it("refuses an entry state that does not belong to the side", async () => {
    await expect(
      pens.owner.client.animals.register({
        sex: "female",
        side: "dairy",
        state: "quarantine",
        penId: pens.dairyPen,
        source: "bought",
        aliases: [],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("the state machine", () => {
  it("allows calf → heifer → pregnant heifer → milking → dry → milking", async () => {
    const { tagNumber } = await registerDairyCalf();
    const { client } = pens.owner;

    await client.animals.setState({ tagNumber, state: "heifer" });
    await client.animals.setState({ tagNumber, state: "pregnant_heifer" });
    await client.animals.setState({ tagNumber, state: "milking" });
    await client.animals.setState({ tagNumber, state: "dry" });
    await client.animals.setState({ tagNumber, state: "milking" });

    const animalRow = await client.animals.byTag({ tagNumber });
    expect(animalRow.state).toBe("milking");
  });

  it("refuses an illegal transition by name", async () => {
    const { tagNumber } = await registerDairyCalf();

    await expect(
      pens.owner.client.animals.setState({ tagNumber, state: "dry" })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("calf to dry"),
    });
    // Reaching Milking is calving, and a calf does not calve: said in a word the phone puts into the reader's language.
    await expect(
      pens.owner.client.animals.setState({ tagNumber, state: "milking" })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: { refusal: "calving_of_a_cow_not_in_calf" },
    });
  });

  it("lets any live animal exit, and nothing move afterwards", async () => {
    const { tagNumber } = await registerDairyCalf();
    // She leaves by the record of how she went. Setting the State by hand is refused for every
    // exit now that each of them has a record of its own to be written.
    await expect(
      pens.owner.client.animals.setState({
        tagNumber,
        state: "sold",
        reason: "sold at market",
      })
    ).rejects.toMatchObject({ data: { refusal: "exit_needs_a_record" } });
    const manager = await createTestClient(appRouter, { as: "manager" });
    await manager.client.sale.record({
      tagNumber,
      buyer: { name: `বাজার ${Date.now()}` },
      priceBdt: 90_000,
      weightKg: 220,
      destination: "হাট",
      vehicle: "ট ১১-২২৩৩",
      driver: "সোহেল",
    });

    // Late rather than wrong: a Move of her is the world having moved under it, and a phone that queued one before the
    // sale is kept for the Manager (ADR 0004).
    await expect(
      pens.owner.client.animals.move({ tagNumber, toPenId: pens.fatteningPen })
    ).rejects.toMatchObject({ code: "CONFLICT", data: { late: true } });
    await expect(
      pens.owner.client.animals.setState({ tagNumber, state: "milking" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("moves", () => {
  it("records a move and keeps the side", async () => {
    const { tagNumber } = await registerDairyCalf();

    const moved = await pens.owner.client.animals.move({
      tagNumber,
      toPenId: pens.staffPen,
      reason: "regrouped",
    });

    expect(moved.side).toBe("dairy");
    const detail = await pens.owner.client.animals.byTag({ tagNumber });
    expect(detail.penId).toBe(pens.staffPen);
    expect(detail.moves[0]).toMatchObject({
      toPenId: pens.staffPen,
      reason: "regrouped",
    });
    expect(detail.moves.at(-1)).toMatchObject({
      reason: "registered",
      fromPenId: null,
    });
  });

  it("a dairy cow moved to fattening keeps her tag number and takes the fattening state", async () => {
    const { tagNumber } = await registerDairyCalf();
    await pens.owner.client.animals.setState({ tagNumber, state: "heifer" });

    await pens.owner.client.animals.move({
      tagNumber,
      toPenId: pens.fatteningPen,
      toSide: "fattening",
      reason: "not productive",
    });

    const detail = await pens.owner.client.animals.byTag({ tagNumber });
    expect(detail.tagNumber).toBe(tagNumber);
    expect(detail.tagNumber.startsWith("D-")).toBe(true);
    expect({ side: detail.side, state: detail.state }).toEqual({
      side: "fattening",
      state: "fattening",
    });
  });
});

describe("re-tagging", () => {
  it("keeps the tag number and records the event", async () => {
    const { tagNumber } = await registerDairyCalf();

    await pens.owner.client.animals.retag({
      tagNumber,
      reason: "tag lost in the field",
      officialTag: "BINLI-9",
    });

    const detail = await pens.owner.client.animals.byTag({ tagNumber });
    expect(detail.tagNumber).toBe(tagNumber);
    expect(detail.officialTag).toBe("BINLI-9");
    expect(detail.retags[0]?.reason).toBe("tag lost in the field");
  });
});

describe("photos", () => {
  it("stores a photo and marks when it changed", async () => {
    const { tagNumber } = await registerDairyCalf();

    await pens.owner.client.animals.setPhoto({
      tagNumber,
      contentType: "image/jpeg",
      data: "AAAA",
    });

    const detail = await pens.owner.client.animals.byTag({ tagNumber });
    expect(detail.photoUpdatedAt).toBeInstanceOf(Date);
    expect(await pens.owner.client.animals.photo({ tagNumber })).toEqual({
      contentType: "image/jpeg",
      data: "AAAA",
    });
  });
});

describe("staff scoping", () => {
  it("lists only the staff member's pens but finds any animal by tag", async () => {
    const mine = await registerDairyCalf(pens.staffPen);
    const theirs = await registerDairyCalf(pens.dairyPen);
    const staff = await createTestClient(appRouter, { as: "staff" });

    const listed = await staff.client.animals.list();

    expect(listed.some((a) => a.tagNumber === mine.tagNumber)).toBe(true);
    expect(listed.some((a) => a.tagNumber === theirs.tagNumber)).toBe(false);
    const looked = await staff.client.animals.byTag({
      tagNumber: theirs.tagNumber,
    });
    expect(looked.tagNumber).toBe(theirs.tagNumber);
  });

  it("refuses a staff move out of their own pens, and cannot register", async () => {
    const { tagNumber } = await registerDairyCalf(pens.dairyPen);
    const staff = await createTestClient(appRouter, { as: "staff" });

    await expect(
      staff.client.animals.move({ tagNumber, toPenId: pens.staffPen })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      staff.client.animals.register({
        sex: "female",
        side: "dairy",
        state: "calf",
        penId: pens.staffPen,
        source: "born",
        aliases: [],
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("the opening register", () => {
  it("imports the good rows with their aliases and reports the rest", async () => {
    const csv = [
      "sex,side,state,pen,source,breed,alias",
      `female,dairy,milking,পেন ১,bought,Sahiwal,"লালি;7"`,
      "male,fattening,quarantine,পেন ২,bought,,",
      "female,dairy,quarantine,পেন ১,born,,",
      "female,dairy,calf,No Such Pen,born,,",
      "unknown,dairy,calf,পেন ১,born,,",
    ].join("\n");

    const result = await pens.owner.client.animals.importRegister({ csv });

    expect(result.total).toBe(5);
    expect(result.imported).toHaveLength(2);
    expect(result.failed.map((f) => f.line)).toEqual([4, 5, 6]);
    expect(result.failed[0]?.reason).toContain(
      "does not belong to the dairy side"
    );
    expect(result.failed[1]?.reason).toContain("unknown pen");

    const [first] = result.imported;
    if (!first) {
      throw new Error("expected an imported row");
    }
    const detail = await pens.owner.client.animals.byTag({
      tagNumber: first.tagNumber,
    });
    expect(detail.aliases).toEqual(["লালি", "7"]);
    expect(detail.breed).toBe("Sahiwal");
  });

  it("keeps the number already written on her ear tag, and the next animal is numbered after it", async () => {
    const csv = [
      "tag,sex,side,state,pen,source",
      "D-9001,female,dairy,milking,পেন ১,bought",
      "f-9001,male,fattening,quarantine,পেন ২,bought",
    ].join("\n");

    const result = await pens.owner.client.animals.importRegister({ csv });

    expect(result.failed).toEqual([]);
    expect(result.imported.map((row) => row.tagNumber)).toEqual([
      "D-9001",
      "F-9001",
    ]);
    const { tagNumber } = await registerDairyCalf();
    expect(tagNumber).toBe("D-9002");
  });

  it("takes every column of the template the tagging runbook hands out", async () => {
    const [header] = readFileSync(
      new URL(
        "../../../../docs/runbooks/opening-register-template.csv",
        import.meta.url
      ),
      "utf-8"
    ).split("\n");
    const csv = [
      header,
      "D-9201,female,dairy,milking,পেন ১,bought,Sahiwal,2021-03-01,2026-06-10,2027-03-20,BINLI-9,লালি;7",
      "D-9202,female,dairy,pregnant_heifer,পেন ১,born,,2024-01-01,,2026-12-01,,",
    ].join("\n");

    const result = await pens.owner.client.animals.importRegister({ csv });

    expect(result.failed).toEqual([]);
    const cow = await pens.owner.client.animals.byTag({ tagNumber: "D-9201" });
    expect(cow.aliases).toEqual(["লালি", "7"]);
    expect(cow.officialTag).toBe("BINLI-9");
    expect(cow.birthDate).not.toBeNull();
  });

  it("a refused row does not move the number of any row after it", async () => {
    const csv = [
      "tag,sex,side,state,pen,source",
      "D-9101,female,dairy,milking,পেন ১,bought",
      "F-9102,female,dairy,milking,পেন ১,bought",
      "D-9101,female,dairy,dry,পেন ১,bought",
      "D-91x3,female,dairy,dry,পেন ১,bought",
      "D-9104,female,dairy,dry,পেন ১,bought",
    ].join("\n");

    const result = await pens.owner.client.animals.importRegister({ csv });

    expect(result.imported.map((row) => [row.line, row.tagNumber])).toEqual([
      [2, "D-9101"],
      [6, "D-9104"],
    ]);
    expect(result.failed.map((row) => row.line)).toEqual([3, 4, 5]);
    expect(result.failed[0]?.reason).toContain("dairy");
    expect(result.failed[1]?.reason).toContain("already");
    expect(result.failed[2]?.reason).toContain("D-91x3");
  });
});

describe("audit", () => {
  it("records the registration and the move under the animal's own id", async () => {
    const { tagNumber, id } = await registerDairyCalf();
    await pens.owner.client.animals.move({ tagNumber, toPenId: pens.staffPen });

    const events = await scratchDb().query.auditEvent.findMany({
      where: { entity: "animal", entityId: id },
      orderBy: { receivedAt: "asc", id: "asc" },
    });

    expect(events.map((e) => e.action)).toEqual(["create", "update"]);
  });
});

describe("review findings", () => {
  it("nothing may change an animal that has left", async () => {
    const { tagNumber } = await registerDairyCalf();
    await pens.owner.client.animals.recordMortality({
      tagNumber,
      kind: "died",
      cause: "test",
      disposal: "buried",
    });

    await expect(
      pens.owner.client.animals.retag({ tagNumber, reason: "tag lost" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      pens.owner.client.animals.setPhoto({
        tagNumber,
        contentType: "image/jpeg",
        data: "AAAA",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("staff cannot re-tag or photograph an animal outside their pens", async () => {
    const { tagNumber } = await registerDairyCalf(pens.dairyPen);
    const staff = await createTestClient(appRouter, { as: "staff" });

    await expect(
      staff.client.animals.retag({ tagNumber, reason: "x" })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      staff.client.animals.setPhoto({
        tagNumber,
        contentType: "image/jpeg",
        data: "AAAA",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("a re-tag that does not change the official tag does not claim it was cleared", async () => {
    const { tagNumber } = await registerDairyCalf();
    await pens.owner.client.animals.retag({
      tagNumber,
      reason: "first",
      officialTag: "BINLI-7",
    });

    await pens.owner.client.animals.retag({ tagNumber, reason: "lost again" });

    const detail = await pens.owner.client.animals.byTag({ tagNumber });
    expect(detail.officialTag).toBe("BINLI-7");
    const events = await scratchDb().query.auditEvent.findMany({
      where: { entity: "animal", entityId: detail.id },
      orderBy: { receivedAt: "asc", id: "asc" },
    });
    expect(
      (events.at(-1)?.after as { officialTag?: string } | null)?.officialTag
    ).toBe("BINLI-7");
  });

  it("every event for one animal is keyed on the same id, so its history is whole", async () => {
    const { tagNumber, id } = await registerDairyCalf();
    await pens.owner.client.animals.move({ tagNumber, toPenId: pens.staffPen });
    await pens.owner.client.animals.setState({ tagNumber, state: "heifer" });

    const events = await scratchDb().query.auditEvent.findMany({
      where: { entity: "animal", entityId: id },
      orderBy: { receivedAt: "asc", id: "asc" },
    });

    expect(events.map((e) => e.action)).toEqual(["create", "update", "update"]);
  });

  it("reports the source line even when the register has a blank line", async () => {
    const csv = [
      "sex,side,state,pen,source",
      "female,dairy,milking,পেন ১,bought",
      "",
      "female,dairy,quarantine,পেন ১,born",
    ].join("\n");

    const result = await pens.owner.client.animals.importRegister({ csv });

    expect(result.imported.map((r) => r.line)).toEqual([2]);
    expect(result.failed.map((r) => r.line)).toEqual([4]);
  });
});
