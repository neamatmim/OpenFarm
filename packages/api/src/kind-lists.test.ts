import { ALERT_KINDS as STORED_KINDS } from "@OpenFarm/db/schema/alert-kinds";
import {
  CALVING_EASES as STORED_EASES,
  PREGNANCY_CHECK_RESULTS as STORED_CHECK_RESULTS,
  REPEAT_BREEDER_DECISIONS as STORED_BREEDER_DECISIONS,
  SERVICE_METHODS as STORED_SERVICE_METHODS,
  WEANED_TO as STORED_WEANED_TO,
} from "@OpenFarm/db/schema/breeding";
import { ROLES as STORED_ROLES, farm } from "@OpenFarm/db/schema/farm";
import { READY_REASONS as STORED_READY_REASONS } from "@OpenFarm/db/schema/fattening";
import {
  FEED_PACKS as STORED_PACKS,
  FEED_UNITS as STORED_UNITS,
} from "@OpenFarm/db/schema/feed";
import { ROUTES as STORED_ROUTES } from "@OpenFarm/db/schema/health";
import {
  CALF_OUTCOMES as STORED_CALF_OUTCOMES,
  DISPOSALS as STORED_DISPOSALS,
  MORTALITY_KINDS as STORED_MORTALITY_KINDS,
  SEXES as STORED_SEXES,
  SIDES as STORED_SIDES,
} from "@OpenFarm/db/schema/herd";
import { MILK_DESTINATIONS as STORED_MILK_DESTINATIONS } from "@OpenFarm/db/schema/milk-destinations";
import {
  RECEIVABLE_KINDS as STORED_RECEIVABLE_KINDS,
  PAYMENT_METHODS as STORED_PAYMENT_METHODS,
} from "@OpenFarm/db/schema/money";
import { REVIEW_REASONS as STORED_REASONS } from "@OpenFarm/db/schema/review";
import { CAPITAL_PAID as STORED_CAPITAL_PAID } from "@OpenFarm/db/schema/venture";
import {
  ALERT_KINDS,
  RECEIVABLE_KINDS,
  CALF_OUTCOMES,
  CALF_SEXES,
  CALVING_EASES,
  CAPITAL_PAID,
  DEFAULT_AUTO_LOCK_MINUTES,
  DISPOSALS,
  FEED_PACKS,
  FEED_UNITS,
  MILK_DESTINATIONS,
  MORTALITY_KINDS,
  PAYMENT_METHODS,
  PREGNANCY_CHECK_RESULTS,
  READY_REASONS,
  REPEAT_BREEDER_DECISIONS,
  REVIEW_REASONS,
  ROLES,
  ROUTES,
  SERVICE_METHODS,
  SIDES,
} from "@OpenFarm/domain";
import { describe, expect, it } from "vitest";

// The db package depends on nothing, so the lists its columns are typed from are written twice: once there, once in
// the domain the screens read. Each copy is right on its own, and only this says they are the same list — a reason
// the store takes and the screens have never heard of is a row that prints its own code.

describe("the lists the store keeps and the lists the screens read", () => {
  it("name the same kinds of Notice", () => {
    expect([...ALERT_KINDS].toSorted()).toEqual([...STORED_KINDS].toSorted());
  });

  it("name the same reasons for putting something in front of the Manager", () => {
    expect([...REVIEW_REASONS].toSorted()).toEqual(
      [...STORED_REASONS].toSorted()
    );
  });

  it("count feed in the same units, and buy it in the same packs", () => {
    expect([...FEED_UNITS].toSorted()).toEqual([...STORED_UNITS].toSorted());
    expect([...FEED_PACKS].toSorted()).toEqual([...STORED_PACKS].toSorted());
  });

  // In order, too: a picker lists them in the order the list gives, and a list reordered on one side only would put
  // the screens' first choice somewhere the store does not.
  it.each([
    ["Roles", ROLES, STORED_ROLES],
    ["ways of paying", PAYMENT_METHODS, STORED_PAYMENT_METHODS],
    ["kinds of Receivable", RECEIVABLE_KINDS, STORED_RECEIVABLE_KINDS],
    ["ways she is served", SERVICE_METHODS, STORED_SERVICE_METHODS],
    [
      "what a pregnancy check finds",
      PREGNANCY_CHECK_RESULTS,
      STORED_CHECK_RESULTS,
    ],
    [
      "answers about a Repeat Breeder",
      REPEAT_BREEDER_DECISIONS,
      STORED_BREEDER_DECISIONS,
    ],
    ["how a calving went", CALVING_EASES, STORED_EASES],
    ["a calf's sex", CALF_SEXES, STORED_SEXES],
    ["how a calf came", CALF_OUTCOMES, STORED_CALF_OUTCOMES],
    ["ways a medicine is given", ROUTES, STORED_ROUTES],
    ["the farm's sides", SIDES, STORED_SIDES],
    ["the sides a calf is weaned to", SIDES, STORED_WEANED_TO],
    ["what is done with a carcass", DISPOSALS, STORED_DISPOSALS],
    ["ways an animal leaves by death", MORTALITY_KINDS, STORED_MORTALITY_KINDS],
    ["where milk goes", MILK_DESTINATIONS, STORED_MILK_DESTINATIONS],
    ["ways a Venture's capital is paid", CAPITAL_PAID, STORED_CAPITAL_PAID],
    ["reasons she is ready for sale", READY_REASONS, STORED_READY_REASONS],
  ] as const)("name the same %s, in the same order", (_, read, stored) => {
    expect([...read]).toEqual([...stored]);
  });

  it("lock a Shed Phone after the same minutes the farm starts with", () => {
    expect(farm.pinAutoLockMinutes.default).toBe(DEFAULT_AUTO_LOCK_MINUTES);
  });
});
