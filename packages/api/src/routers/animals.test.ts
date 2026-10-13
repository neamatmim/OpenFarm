import { readFileSync } from "node:fs";

import { penAssignment } from "@OpenFarm/db/schema/herd";
import { scratchDb, theFarm, thePerson } from "@OpenFarm/test-harness";
import { beforeAll, describe, expect, it } from "vitest";

import { aMonthOn } from "../test/carrying";
import { createTestClient } from "../test/client";
import { A_DEATH_PHOTO } from "../test/death-photo";
import { appRouter } from "./index";

/** One shed with a dairy pen, a fattening pen and a staff-assigned pen, made once. */
const setup = async () => {
  const owner = await createTestClient(appRouter, { as: "owner" });
  const sheds = await owner.client.sheds.list();
  let shedId = sheds[0]?.id;
  if (!shedId) {
    const created = await owner.client.sheds.create({ name: "শেড A" });
    shedId = created.id;
  }
  // A quarantine pen holds no dairy animal: the dairy and the Staff member's pens are plain ones.
  const named = async (name: string, quarantine: boolean) => {
    const all = await owner.client.sheds.list();
    const found = all.flatMap((s) => s.pens).find((p) => p.name === name);
    if (found) {
      return found.id;
    }
    const created = await owner.client.sheds.pens.create({
      quarantine,
      shedId,
      name,
    });
    return created.id;
  };
  return {
    owner,
    dairyPen: await named("পেন ১", false),
    fatteningPen: await named("পেন ২", true),
    staffPen: await named("পেন ৩", false),
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
    const shed = await client.sheds.create({ name: `শেড ${Date.now()}` });
    const pen = await client.sheds.pens.create({
      quarantine: true,
      shedId: shed.id,
      name: "পেন ক",
    });

    await client.sheds.rename({ id: shed.id, name: "শেড খ" });
    await client.sheds.pens.rename({ id: pen.id, name: "পেন গ" });

    const listed = await client.sheds.list();
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
      photo: A_DEATH_PHOTO,
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
    await client.animals.setState({
      tagNumber,
      state: "pregnant_heifer",
      expectedCalvingOn: aMonthOn(pens.owner),
    });
    await client.animals.setState({ tagNumber, state: "milking" });
    await client.animals.setState({ tagNumber, state: "dry" });
    await client.animals.setState({ tagNumber, state: "milking" });

    const animalRow = await client.animals.get({ tagNumber });
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
    await manager.client.sales.record({
      tagNumber,
      buyer: { name: `বাজার ${Date.now()}` },
      priceMoney: 90_000,
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
    const detail = await pens.owner.client.animals.get({ tagNumber });
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

    const detail = await pens.owner.client.animals.get({ tagNumber });
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

    const detail = await pens.owner.client.animals.get({ tagNumber });
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

    const detail = await pens.owner.client.animals.get({ tagNumber });
    expect(detail.photoUpdatedAt).toBeInstanceOf(Date);
    expect(await pens.owner.client.animals.photo({ tagNumber })).toEqual({
      contentType: "image/jpeg",
      data: "AAAA",
    });
  });

  it("sends a list the thumbnail, and the photo whole to whoever opens it", async () => {
    const { tagNumber } = await registerDairyCalf();
    await pens.owner.client.animals.setPhoto({
      tagNumber,
      contentType: "image/jpeg",
      data: "WHOLE",
      thumb: "SMALL",
    });

    expect(
      await pens.owner.client.animals.photo({ tagNumber, size: "thumb" })
    ).toEqual({ contentType: "image/jpeg", data: "SMALL" });
    expect(await pens.owner.client.animals.photo({ tagNumber })).toEqual({
      contentType: "image/jpeg",
      data: "WHOLE",
    });
  });

  it("sends a photo with no thumbnail whole, and a new photo forgets the old one's", async () => {
    const { tagNumber } = await registerDairyCalf();
    await pens.owner.client.animals.setPhoto({
      tagNumber,
      contentType: "image/jpeg",
      data: "FIRST",
      thumb: "FIRST-SMALL",
    });
    // A phone on an older build sends the new photo alone.
    await pens.owner.client.animals.setPhoto({
      tagNumber,
      contentType: "image/png",
      data: "SECOND",
    });

    expect(
      await pens.owner.client.animals.photo({ tagNumber, size: "thumb" })
    ).toEqual({ contentType: "image/png", data: "SECOND" });
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
    const looked = await staff.client.animals.get({
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
    const detail = await pens.owner.client.animals.get({
      tagNumber: first.tagNumber,
    });
    expect(detail.aliases).toEqual(["লালি", "7"]);
    expect(detail.breed?.nameEn).toBe("Sahiwal");
  });

  it("asks for shed/pen where two Sheds each have a Pen by the name the row gives, rather than guessing", async () => {
    const owner = pens.owner.client;
    const stamp = Date.now();
    const north = await owner.sheds.create({ name: `উত্তর ${stamp}` });
    const south = await owner.sheds.create({ name: `দক্ষিণ ${stamp}` });
    const both = `পেন এক ${stamp}`;
    await owner.sheds.pens.create({ shedId: north.id, name: both });
    const southPen = await owner.sheds.pens.create({
      shedId: south.id,
      name: both,
    });
    const csv = [
      "sex,side,state,pen,source",
      `female,dairy,heifer,${both},born`,
      `female,dairy,heifer,দক্ষিণ ${stamp}/${both},born`,
    ].join("\n");

    const result = await owner.animals.importRegister({ csv });

    expect(result.failed).toMatchObject([
      { line: 2, refusal: "pen_in_two_sheds", column: "pen" },
    ]);
    const [placed] = result.imported;
    const her = await owner.animals.get({ tagNumber: placed?.tagNumber ?? "" });
    expect(her.penId).toBe(southPen.id);
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
    const cow = await pens.owner.client.animals.get({ tagNumber: "D-9201" });
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

  it("takes rows pasted straight from a spreadsheet, whose cells come separated by tabs", async () => {
    const csv = [
      "tag\tsex\tside\tstate\tpen\tsource",
      "D-9501\tfemale\tdairy\theifer\tপেন ১\tborn",
    ].join("\n");

    const result = await pens.owner.client.animals.importRegister({ csv });

    expect(result.failed).toEqual([]);
    expect(result.imported.map((row) => row.tagNumber)).toEqual(["D-9501"]);
  });

  it("keeps the number on her ear tag from a file a spreadsheet saved with a byte-order mark", async () => {
    const csv = [
      "﻿tag,sex,side,state,pen,source",
      "D-9511,female,dairy,heifer,পেন ১,born",
    ].join("\n");

    const result = await pens.owner.client.animals.importRegister({ csv });

    expect(result.imported.map((row) => row.tagNumber)).toEqual(["D-9511"]);
  });

  it("takes sex, side, state and source in Bangla, and in any case", async () => {
    const csv = [
      "tag,sex,side,state,pen,source",
      "D-9521,স্ত্রী,দুগ্ধ,দোহনে,পেন ১,কেনা",
      "F-9522,Male,Fattening,Quarantine,পেন ২,BOUGHT",
      "F-9523,পুরুষ,মোটাতাজাকরণ,Ready for sale,পেন ২,Bought",
    ].join("\n");

    const result = await pens.owner.client.animals.importRegister({ csv });

    expect(result.failed).toEqual([]);
    const cow = await pens.owner.client.animals.get({ tagNumber: "D-9521" });
    expect([cow.sex, cow.side, cow.state, cow.source]).toEqual([
      "female",
      "dairy",
      "milking",
      "bought",
    ]);
    const ready = await pens.owner.client.animals.get({ tagNumber: "F-9523" });
    expect(ready.state).toBe("ready_for_sale");
  });

  it("passes over a row beginning #, as the template's example and its lists of pens and breeds are", async () => {
    const csv = [
      "tag,sex,side,state,pen,source",
      "# D-0001,female,dairy,milking,পেন ১,bought",
      "D-9531,female,dairy,heifer,পেন ১,born",
    ].join("\n");

    const result = await pens.owner.client.animals.importRegister({ csv });

    expect(result.total).toBe(1);
    expect(result.imported).toEqual([{ line: 3, tagNumber: "D-9531" }]);
  });

  it("does not take her twice when the whole register is pasted again: a row with no tag naming an animal already here by her old mark or official tag is refused", async () => {
    const stamp = Date.now();
    const csv = [
      "sex,side,state,pen,source,official_tag,alias",
      `female,dairy,heifer,পেন ১,born,,"লালি ${stamp};${stamp}"`,
      `female,dairy,heifer,পেন ১,born,BINLI-${stamp},`,
    ].join("\n");
    const first = await pens.owner.client.animals.importRegister({ csv });
    expect(first.imported).toHaveLength(2);

    const again = await pens.owner.client.animals.importRegister({ csv });

    expect(again.imported).toEqual([]);
    expect(
      again.failed.map(({ line, refusal, column, value }) => ({
        line,
        refusal,
        column,
        value,
      }))
    ).toEqual([
      {
        line: 2,
        refusal: "register_already_on_the_farm",
        column: "alias",
        value: `লালি ${stamp};${stamp}`,
      },
      {
        line: 3,
        refusal: "register_already_on_the_farm",
        column: "official_tag",
        value: `BINLI-${stamp}`,
      },
    ]);
    // A different cow who happens to share her old mark comes in by the number written on her ear.
    const twin = await pens.owner.client.animals.importRegister({
      csv: [
        "tag,sex,side,state,pen,source,alias",
        `D-9551,female,dairy,heifer,পেন ১,born,"লালি ${stamp};${stamp}"`,
      ].join("\n"),
    });
    expect(twin.failed).toEqual([]);
  });

  it("checks a register without taking anybody in, and moves no number", async () => {
    const before = await pens.owner.client.animals.list({});
    const csv = [
      "sex,side,state,pen,source",
      "female,dairy,heifer,পেন ১,born",
      "female,dairy,calf,No Such Pen,born",
    ].join("\n");

    const checked = await pens.owner.client.animals.importRegister({
      csv,
      check: true,
    });

    expect(checked.checked).toBe(true);
    expect(checked.imported.map((row) => row.line)).toEqual([2]);
    expect(checked.failed.map((row) => row.refusal)).toEqual([
      "register_unknown_pen",
    ]);
    const after = await pens.owner.client.animals.list({});
    expect(after.length).toBe(before.length);
    const imported = await pens.owner.client.animals.importRegister({ csv });
    expect(imported.imported.map((row) => row.tagNumber)).toEqual(
      checked.imported.map((row) => row.tagNumber)
    );
  });

  it("hands back only the rows it refused, under the header, to be put right and sent again", async () => {
    const sent = [
      "tag,sex,side,state,pen,source",
      "D-9541,female,dairy,heifer,পেন ১,born",
      'D-9542,female,dairy,heifer,"No Such Pen, east",born',
      "D-9543,female,dairy,heifer,পেন ১,born",
    ].join("\n");

    const result = await pens.owner.client.animals.importRegister({
      csv: sent,
    });

    expect(result.leftOver).toBe(
      [
        "tag,sex,side,state,pen,source",
        'D-9542,female,dairy,heifer,"No Such Pen, east",born',
      ].join("\n")
    );
  });

  it("hands out a template that, imported as downloaded, takes in nobody and refuses nothing", async () => {
    const template = await pens.owner.client.animals.registerTemplate();
    const [header] = readFileSync(
      new URL(
        "../../../../docs/runbooks/opening-register-template.csv",
        import.meta.url
      ),
      "utf-8"
    ).split("\n");

    expect(template.csv.replace("﻿", "").split("\r\n")[0]).toBe(header);
    expect(template.csv).toContain("পেন ১");
    const result = await pens.owner.client.animals.importRegister({
      csv: template.csv,
    });
    expect([result.imported, result.failed]).toEqual([[], []]);
  });
});

describe("a cow on the opening register who has calved before", () => {
  it("is in a Lactation of her own when Dry, so her next calving is not read as her first", async () => {
    const csv = [
      "tag,sex,side,state,pen,source,expected_calving",
      "D-9601,female,dairy,dry,পেন ১,bought,",
    ].join("\n");

    await pens.owner.client.animals.importRegister({ csv });

    const cow = await pens.owner.client.animals.get({ tagNumber: "D-9601" });
    expect(cow.lactationNumber).toBe(1);
  });

  it("keeps the Lactation the register says she is in", async () => {
    const csv = [
      "tag,sex,side,state,pen,source,calved_at,lactation",
      "D-9611,female,dairy,milking,পেন ১,bought,2026-01-10,3",
      "D-9612,female,dairy,dry,পেন ১,bought,,4",
    ].join("\n");

    const result = await pens.owner.client.animals.importRegister({ csv });

    expect(result.failed).toEqual([]);
    const milking = await pens.owner.client.animals.get({
      tagNumber: "D-9611",
    });
    const dry = await pens.owner.client.animals.get({ tagNumber: "D-9612" });
    expect([milking.lactationNumber, dry.lactationNumber]).toEqual([3, 4]);
  });

  it("refuses a Lactation no cow in that state can be in", async () => {
    const csv = [
      "tag,sex,side,state,pen,source,lactation",
      "D-9621,female,dairy,milking,পেন ১,bought,0",
      "D-9622,female,dairy,heifer,পেন ১,born,2",
      "D-9623,female,dairy,dry,পেন ১,bought,1.5",
    ].join("\n");

    const result = await pens.owner.client.animals.importRegister({ csv });

    expect(
      result.failed.map(({ line, refusal, column, value }) => ({
        line,
        refusal,
        column,
        value,
      }))
    ).toEqual([
      {
        line: 2,
        refusal: "register_lactation_not_of_state",
        column: "lactation",
        value: "0",
      },
      {
        line: 3,
        refusal: "register_lactation_not_of_state",
        column: "lactation",
        value: "2",
      },
      {
        line: 4,
        refusal: "register_value_unread",
        column: "lactation",
        value: "1.5",
      },
    ]);
  });
});

describe("what the opening register says of a row", () => {
  it("names each refusal so the screen can say it in Bangla, with the column and what was written", async () => {
    const csv = [
      "tag,sex,side,state,pen,source,breed,birth_date,calved_at,expected_calving",
      "D-9301,female,dairy,heifer,পেন ১,born,,15/03/2025,,",
      "D-9302,female,dairy,heifer,গোয়াল,born,,,,",
      "D-9303,female,dairy,heifer,পেন ১,born,Friesian Jersey,,,",
      "D-9304,female,dairy,pregnant_heifer,পেন ১,born,,,,",
      "D-9305,female,dairy,heifer,পেন ১,born,,,,",
      "D-9305,female,dairy,heifer,পেন ১,born,,,,",
      "F-9306,female,dairy,heifer,পেন ১,born,,,,",
      "D-93x7,female,dairy,heifer,পেন ১,born,,,,",
      "D-9308,female,dairy,fattening,পেন ১,born,,,,",
      "D-9309,female,dairy,milking,পেন ১,born,,,,",
    ].join("\n");

    const result = await pens.owner.client.animals.importRegister({ csv });

    expect(
      result.failed.map(({ line, refusal, column, value }) => ({
        line,
        refusal,
        column,
        value,
      }))
    ).toEqual([
      {
        line: 2,
        refusal: "register_date_unread",
        column: "birth_date",
        value: "15/03/2025",
      },
      {
        line: 3,
        refusal: "register_unknown_pen",
        column: "pen",
        value: "গোয়াল",
      },
      {
        line: 4,
        refusal: "register_unknown_breed",
        column: "breed",
        value: "Friesian Jersey",
      },
      {
        line: 5,
        refusal: "expected_calving_needed",
        column: "expected_calving",
        value: "",
      },
      { line: 7, refusal: "tag_taken", column: "tag", value: "D-9305" },
      {
        line: 8,
        refusal: "tag_of_the_other_side",
        column: "tag",
        value: "F-9306",
      },
      { line: 9, refusal: "not_a_tag_number", column: "tag", value: "D-93x7" },
      {
        line: 10,
        refusal: "register_state_not_of_side",
        column: "state",
        value: "fattening",
      },
    ]);
    // Taken, but with what the farm cannot do without said: how long she has been in milk.
    expect(result.warned).toEqual([
      { line: 11, tagNumber: "D-9309", warning: "register_no_calving_date" },
    ]);
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
      photo: A_DEATH_PHOTO,
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

    const detail = await pens.owner.client.animals.get({ tagNumber });
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
