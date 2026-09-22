import { describe, expect, it } from "vitest";

import {
  aiWindow,
  attemptOf,
  attemptsThatBegin,
  attemptsThatFailed,
  calvingWorkDue,
  expectedCalvingFrom,
  failedAttempts,
  heatsThatBegin,
  isRepeatBreeder,
  SAME_HEAT_WITHIN_HOURS,
  sinceSheLastCalved,
} from "./breeding";
import { startOfFarmDay } from "./farm-clock";

// Which sightings begin a heat, which services begin an attempt, and which attempts did not take. All
// three are decided from the records themselves rather than from whatever work happens to be open, so
// they answer the same way however late a phone gets signal — and that is what is asserted here.

const HOUR = 60 * 60 * 1000;
const at = (day: string, time = "06:00") =>
  new Date(`2027-${day}T${time}:00+06:00`);
const hoursAfter = (from: Date, hours: number) =>
  new Date(from.getTime() + hours * HOUR);

const seen = (id: string, animalId: string, seenAt: Date) => ({
  id,
  animalId,
  seenAt,
});
const served = (id: string, animalId: string, servedAt: Date) => ({
  id,
  animalId,
  servedAt,
});
const check = (
  id: string,
  serviceId: string,
  result: "positive" | "negative",
  checkedAt: Date
) => ({ id, serviceId, result, checkedAt });

describe("which sightings begin a heat", () => {
  const evening = at("03-01", "18:00");

  it("counts the evening round and the next morning as one heat seen twice", () => {
    // A standing heat lasts most of a day and its signs longer.
    const heats = heatsThatBegin([
      seen("1", "১০১", evening),
      seen("2", "১০১", hoursAfter(evening, 13)),
    ]);
    expect(heats.map((one) => one.id)).toEqual(["1"]);
  });

  it("counts a cow back in heat three weeks later as a second one", () => {
    const heats = heatsThatBegin([
      seen("1", "১০১", evening),
      seen("2", "১০১", hoursAfter(evening, 21 * 24)),
    ]);
    expect(heats.map((one) => one.id)).toEqual(["1", "2"]);
  });

  it("does not let a run of daily records chain into one long heat", () => {
    // Measured from the record that began the run, not from the last one. A cow marked every day for a
    // week is not one heat — chaining would let the run hide the fact.
    const daily = [0, 1, 2, 3, 4, 5, 6].map((day) =>
      seen(String(day), "১০১", hoursAfter(evening, day * 24))
    );
    expect(heatsThatBegin(daily).map((one) => one.id)).toEqual([
      "0",
      "2",
      "4",
      "6",
    ]);
  });

  it("keeps each cow's heats to herself", () => {
    const heats = heatsThatBegin([
      seen("1", "১০১", evening),
      seen("2", "২০২", hoursAfter(evening, 1)),
    ]);
    expect(heats.map((one) => one.id)).toEqual(["1", "2"]);
  });

  it("answers the same however late the records arrive", () => {
    // Two sightings reaching the farm together from a phone that had no signal must raise one job,
    // not two — and the order they are handed over in cannot matter.
    const first = seen("1", "১০১", evening);
    const second = seen("2", "১০১", hoursAfter(evening, 13));
    expect(heatsThatBegin([second, first]).map((one) => one.id)).toEqual(["1"]);
  });

  it("splits exactly at the hour two sightings stop being one heat", () => {
    const apart = (hours: number) =>
      heatsThatBegin([
        seen("1", "১০১", evening),
        seen("2", "১০১", hoursAfter(evening, hours)),
      ]).length;
    expect(apart(SAME_HEAT_WITHIN_HOURS - 1)).toBe(1);
    expect(apart(SAME_HEAT_WITHIN_HOURS)).toBe(2);
  });
});

describe("which services begin an attempt", () => {
  const morning = at("03-01");
  const twice = [
    served("s1", "১০১", morning),
    served("s2", "১০১", hoursAfter(morning, 12)),
  ];

  it("counts a cow served twice in one heat as one attempt", () => {
    // The farm serves at twelve hours and again at twenty-four; those are one attempt, and counted
    // per service a cow served twice every heat would be a Repeat Breeder a whole cycle early.
    expect(attemptsThatBegin(twice).map((one) => one.id)).toEqual(["s1"]);
  });

  it("puts the second service of a heat under the first", () => {
    expect(attemptOf(twice, "s2")?.id).toBe("s1");
    expect(attemptOf(twice, "s1")?.id).toBe("s1");
  });

  it("knows nothing of a service it was not given", () => {
    expect(attemptOf(twice, "s9")).toBe(null);
  });
});

describe("which attempts did not take", () => {
  const first = at("03-01");
  const back = at("03-22");

  it("counts the one the Vet found empty", () => {
    const services = [served("s1", "১০১", first)];
    expect(
      attemptsThatFailed(services, [
        check("c1", "s1", "negative", at("04-01")),
      ]).map((one) => one.why)
    ).toEqual(["checked_negative"]);
  });

  it("counts one she answered herself by coming back into heat", () => {
    // Served again three weeks later: she answered the question before the Vet was due to ask it.
    const services = [served("s1", "১০১", first), served("s2", "১০১", back)];
    expect(
      attemptsThatFailed(services, []).map((one) => [one.id, one.why])
    ).toEqual([["s1", "back_in_heat"]]);
  });

  it("has not failed an attempt that is still waiting for its check", () => {
    expect(attemptsThatFailed([served("s1", "১০১", first)], [])).toEqual([]);
  });

  it("does not count one she was found carrying from", () => {
    const services = [served("s1", "১০১", first)];
    expect(
      attemptsThatFailed(services, [check("c1", "s1", "positive", at("04-01"))])
    ).toEqual([]);
  });

  it("takes the Vet's latest word, not her first", () => {
    // Checked early and empty, checked again later and carrying: she is carrying.
    const services = [served("s1", "১০১", first)];
    expect(
      attemptsThatFailed(services, [
        check("c1", "s1", "negative", at("03-25")),
        check("c2", "s1", "positive", at("04-20")),
      ])
    ).toEqual([]);
  });

  it("counts one failure for a heat she was served twice in", () => {
    const services = [
      served("s1", "১০১", first),
      served("s2", "১০১", hoursAfter(first, 12)),
      served("s3", "১০১", back),
    ];
    expect(failedAttempts(services, [])).toBe(1);
  });

  it("does not let another cow's attempt answer for her last one", () => {
    // Her last attempt is waiting for its check. This is given one cow's services, but it is generic
    // over the animal and sorts by it, so a herd reads as welcome — and a herd used to make her last
    // attempt look like one she had been served again after.
    const services = [
      served("a1", "১০১", first),
      served("a2", "১০১", back),
      served("b1", "২০২", at("03-05")),
    ];
    expect(
      attemptsThatFailed(services, []).map((one) => [one.id, one.why])
    ).toEqual([["a1", "back_in_heat"]]);
  });
});

describe("the services that count towards a Repeat Breeder", () => {
  const services = [
    served("s1", "১০১", at("01-10")),
    served("s2", "১০১", at("05-10")),
  ];

  it("is the ones since she last calved", () => {
    // A cow who struggled three years ago and has calved twice since is not the question she was then.
    expect(
      sinceSheLastCalved(services, at("03-01")).map((one) => one.id)
    ).toEqual(["s2"]);
  });

  it("is all of them for a heifer who has never calved", () => {
    expect(sinceSheLastCalved(services, null)).toHaveLength(2);
  });
});

describe("whether she is one somebody has to decide about", () => {
  const her = {
    failed: 3,
    threshold: 3,
    answeredAtFailures: null,
    carrying: false,
  };

  it("raises her once she has failed the farm's threshold", () => {
    expect(isRepeatBreeder(her)).toBe(true);
    expect(isRepeatBreeder({ ...her, failed: 2 })).toBe(false);
  });

  it("is not a question about a cow found carrying again", () => {
    expect(isRepeatBreeder({ ...her, failed: 9, carrying: true })).toBe(false);
  });

  it("stays answered until she fails again", () => {
    expect(isRepeatBreeder({ ...her, answeredAtFailures: 3 })).toBe(false);
    expect(isRepeatBreeder({ ...her, failed: 4, answeredAtFailures: 3 })).toBe(
      true
    );
  });
});

describe("the work a heat and a calving pull with them", () => {
  it("makes the AI due at the window's start and late at its end", () => {
    // How soon a technician can reach the farm is a fact about this farm, so both ends are the
    // farm's; a service takes in a window, not at an instant.
    const heat = at("03-01", "18:00");
    expect(aiWindow(heat, { startHours: 12, endHours: 24 })).toEqual({
      dueAt: hoursAfter(heat, 12),
      graceMinutes: 12 * 60,
    });
  });

  it("carries her the farm's gestation on from the service, hour and all", () => {
    expect(expectedCalvingFrom(at("01-05", "14:00"), 283)).toEqual(
      new Date("2027-10-15T08:00:00.000Z")
    );
  });

  it("puts work a lead ahead of calving at the start of the farm's day", () => {
    // A day's work, not an appointment at whatever hour a service happened to be.
    expect(calvingWorkDue(at("10-01", "17:30"), 60)).toEqual(
      startOfFarmDay("2027-08-02")
    );
  });
});
