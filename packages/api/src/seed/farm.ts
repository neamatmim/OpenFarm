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
  await takeInBulls(farm, herd, {
    on: addDays(start, -6),
    count: 14,
    pen: "quarantine",
  });
  step(`${herd.cows.size} dairy animals, ${herd.bulls.size} bulls`);
  step(`${HISTORY_DAYS} days of the farm`);
  await liveTheDays(farm, herd, scriptTheDays(farm, herd), (line) =>
    step(line)
  );
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
