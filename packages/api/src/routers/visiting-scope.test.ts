import { FakeClock } from "@OpenFarm/test-harness";
import { createRouterClient } from "@orpc/server";
import { beforeAll, describe, expect, it } from "vitest";

import type { Context } from "../context";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Every procedure the farm has, called by a Vet called in for a visit and holding no other Role. Whatever has not been
// declared open to a visit is refused before the procedure reads a word of what it was sent — so a procedure added
// without anybody deciding whether a Vet on a visit may call it is closed, not open.

/**
 * What a Vet called in for a visit is meant to be able to call, as the farm decided it: their own cases' animals, what the Vet
 * does for them, the Drug List and the notifiable-disease list to do it with, and their own notices and trail. Each is
 * declared at its own procedure; a procedure that opens to a visit without being written here fails, and so does one
 * written here that a visit cannot call.
 */
const OPEN_TO_A_VISIT = new Set<string>([
  "alerts.mine",
  "alerts.dismiss",
  "animals.list",
  "animals.byTag",
  "animals.photo",
  "audit.list",
  "breeding.recordAbortion",
  "breeding.correctAbortion",
  "diagnoses.record",
  "diagnoses.correct",
  "diagnoses.waiting",
  "diagnoses.mine",
  "drugs.list",
  "instances.today",
  "instances.get",
  "instances.attachPhoto",
  "instances.claim",
  "instances.completeStep",
  "instances.correctStep",
  "instances.complete",
  "milk.forAnimal",
  "notifiable.list",
  "observations.record",
  "papers.passport",
  "papers.withdrawalSummary",
  "prescriptions.prescribe",
  "prescriptions.forAnimal",
  "push.key",
  "push.listen",
  "push.stopListening",
  "sync.batch",
  "vetCases.close",
  "vetCases.mine",
]);

/**
 * Procedures that ask for no Role at all, and why a Vet on a visit may call them: they are about the person or the phone in
 * their hand, not about the farm's animals, work or settings.
 */
const ROLE_FREE = new Map<string, string>([
  ["healthCheck", "says the server is up, and nothing else"],
  ["serverTime", "says what time the farm's clock reads"],
  ["privateData", "says who is signed in, to them"],
  ["people.me", "says who they are, and what their Scope is"],
  [
    "people.acceptInvite",
    "is how somebody invited takes up the Role they were invited to",
  ],
  [
    "people.setPasswordWithCode",
    "is how somebody who has forgotten their password sets one, which is done signed out",
  ],
  [
    "portal.join",
    "is how an Investor takes up the Owner's invitation to the portal, which is done signed out",
  ],
  ["language.get", "is their own language"],
  ["language.set", "is their own language"],
  ["devices.claim", "enrols a Shed Phone with a code the Manager gave it"],
  ["devices.current", "says which phone this is and who is switched in on it"],
  ["devices.switchUser", "is a PIN Switch, which the PIN is the gate of"],
  [
    "devices.keepAwake",
    "keeps a Shed Phone unlocked, and only a Shed Phone may ask",
  ],
  ["devices.lock", "locks a Shed Phone, and only a Shed Phone may ask"],
  [
    "people.roster",
    "is who may PIN Switch on a Shed Phone, and only a Shed Phone may ask",
  ],
  ["farm.bootstrap", "makes the farm, once, and refuses when there is one"],
]);

const procedurePaths = (node: unknown, prefix: string[] = []): string[][] => {
  if (node && typeof node === "object" && "~orpc" in node) {
    return [prefix];
  }
  if (!node || typeof node !== "object") {
    return [];
  }
  return Object.entries(node).flatMap(([key, child]) =>
    procedurePaths(child, [...prefix, key])
  );
};

let onAVisit: ReturnType<typeof createRouterClient<typeof appRouter>>;

beforeAll(async () => {
  const { context } = await createTestClient(appRouter, {
    as: "vet",
    clock: new FakeClock("2030-01-01T04:00:00.000Z"),
  });
  const vetOnAVisit: Context = {
    ...context,
    roles: ["vet"],
    visiting: true,
    penIds: [],
    caseAnimalIds: [],
  };
  onAVisit = createRouterClient(appRouter, { context: vetOnAVisit });
});

/** What the Vet on a visit sends: nothing, so a procedure that reads its input first would refuse the input, not them. */
const NOTHING_SENT: unknown = undefined;

const call = async (path: string[]): Promise<unknown> => {
  let target: unknown = onAVisit;
  for (const key of path) {
    target = (target as Record<string, unknown>)[key];
  }
  try {
    await (target as (input: unknown) => Promise<unknown>)(NOTHING_SENT);
    return null;
  } catch (error) {
    return error;
  }
};

describe("a Vet on a visit, calling every procedure", () => {
  const closed = procedurePaths(appRouter).filter((path) => {
    const name = path.join(".");
    return !(
      OPEN_TO_A_VISIT.has(name) ||
      ROLE_FREE.has(name) ||
      name === "farm.current"
    );
  });

  it.each(closed.map((path) => [path.join("."), path] as const))(
    "is refused %s before it reads what it was sent",
    async (_name, path) => {
      const answer = (await call(path)) as {
        code?: string;
        message?: string;
        data?: { refusal?: string };
      } | null;
      // Refused by the Role check — as a visit where the procedure is a Vet's, as not theirs where it is not — and not
      // by anything further in, which would mean the procedure had let them past the Role check first.
      expect(answer?.code).toBe("FORBIDDEN");
      expect(answer?.message ?? "").not.toMatch(/shed phone/u);
    }
  );
  const open = procedurePaths(appRouter).filter((path) =>
    OPEN_TO_A_VISIT.has(path.join("."))
  );

  it.each(open.map((path) => [path.join("."), path] as const))(
    "lets them call %s, whatever it then says about what was sent",
    async (_name, path) => {
      const answer = (await call(path)) as {
        data?: { refusal?: string };
      } | null;
      expect(answer?.data?.refusal).not.toBe("visiting_vet");
    }
  );
});

describe("the farm itself, for a Vet on a visit", () => {
  it("is its name and no more: the settings the farm runs on are not for a Vet on a visit", async () => {
    const current = onAVisit.farm.current as () => Promise<Record<
      string,
      unknown
    > | null>;
    const farm = await current();
    expect(Object.keys(farm ?? {}).toSorted()).toEqual(["id", "name"]);
  });
});
