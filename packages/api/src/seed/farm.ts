import type { Database } from "@OpenFarm/db";
import { farmDayOf } from "@OpenFarm/domain";

import { registerTheHerd, takeInBulls } from "./herd";
import { liveTheDays } from "./history";
import {
  SEED_PASSWORD,
  SeedClock,
  addDays,
  onFarm,
  randomFrom,
} from "./runtime";
import { scriptTheDays } from "./script";
import {
  PEOPLE,
  openTheFarm,
  stockTheFarm,
  writeThePlaybook,
} from "./standing";
import { openTheVentures, runTheVentures } from "./ventures";
import { VISITING_VET, callInAVisitingVet } from "./visit";

/** How far back the farm's life goes before today. */
export const HISTORY_DAYS = Number(process.env.SEED_DAYS ?? 90);

const step = (what: string) => {
  process.stdout.write(`  · ${what}\n`);
};

export const seedFarm = async (db: Database) => {
  const today = farmDayOf(new Date());
  const start = addDays(today, -HISTORY_DAYS);
  const clock = new SeedClock(onFarm(start));
  const random = randomFrom(20_260_914);

  step("people, farm identity, sheds and pens");
  const farm = await openTheFarm(db, clock, random, { today, start });
  step("feed store, rations, medicines, notifiable diseases");
  await stockTheFarm(farm);
  step("the Playbook");
  await writeThePlaybook(farm);
  step("the opening herd register");
  const herd = await registerTheHerd(farm);
  step("the first lorry of bulls");
  const firstLorry = await takeInBulls(farm, herd, {
    on: addDays(start, -6),
    count: 14,
    pen: "quarantine",
  });
  // The heaviest of them go to the Eid buyers, confirmed ready a fortnight before today.
  for (const bull of firstLorry) {
    bull.sellBy = addDays(today, -14);
  }
  step("two Ventures, their Investors and their cattle");
  const ventures = await openTheVentures(farm, herd);
  step(`${herd.cows.size} dairy animals, ${herd.bulls.size} bulls`);
  step(`${HISTORY_DAYS} days of the farm`);
  const happenings = scriptTheDays(farm, herd);
  runTheVentures(farm, ventures, (day, time, what, run) => {
    if (day >= farm.start && day <= farm.today) {
      happenings.push({ day, time, what, run });
    }
  });
  await liveTheDays(farm, herd, happenings, (line) => step(line));
  step("a visiting vet called in about a lame cow");
  await callInAVisitingVet(farm, db, clock, today);

  return {
    password: SEED_PASSWORD,
    people: [
      ...PEOPLE.map(({ role, name, email }) => ({ role, name, email })),
      VISITING_VET,
    ],
  };
};
