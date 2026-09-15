import { FakeClock } from "@OpenFarm/test-harness";
import { createRouterClient } from "@orpc/server";
import { beforeAll, describe, expect, it } from "vitest";

import type { Context } from "../context";
import { VISITING_VET_REACH } from "../roles";
import { createTestClient } from "../test/client";
import { appRouter } from "./index";

// Every procedure the farm has, called by a Vet called in for a visit and nothing else. Whatever a visit has not been
// declared to reach is refused before the procedure reads a word of what it was sent — so a procedure added without
// anybody deciding whether a visitor may call it is closed, not open.

/**
 * Procedures that ask for no Role at all, and why a visitor may call them: they are about the person or the phone in
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
  ["language.get", "is their own language"],
  ["language.set", "is their own language"],
  ["devices.claim", "enrols a Shed Phone with a code the Manager gave it"],
  ["devices.current", "says which phone this is and who is switched in on it"],
  ["devices.switchUser", "is a PIN Switch, which the PIN is the gate of"],
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

let visitor: ReturnType<typeof createRouterClient<typeof appRouter>>;

beforeAll(async () => {
  const { context } = await createTestClient(appRouter, {
    as: "vet",
    clock: new FakeClock("2030-01-01T04:00:00.000Z"),
  });
  const onAVisit: Context = {
    ...context,
    roles: ["vet"],
    visiting: true,
    penIds: [],
    caseAnimalIds: [],
  };
  visitor = createRouterClient(appRouter, { context: onAVisit });
});

/** What the visitor sends: nothing, so a procedure that reads its input first would refuse the input, not the visitor. */
const NOTHING_SENT: unknown = undefined;

const call = async (path: string[]): Promise<unknown> => {
  let target: unknown = visitor;
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
      VISITING_VET_REACH.has(name) ||
      ROLE_FREE.has(name) ||
      name === "farm.current"
    );
  });

  it.each(closed.map((path) => [path.join("."), path] as const))(
    "is refused %s before it reads what it was sent",
    async (_name, path) => {
      expect(await call(path)).toMatchObject({ code: "FORBIDDEN" });
    }
  );
});

describe("the farm itself, for a Vet on a visit", () => {
  it("is its name and no more: the settings the farm runs on are not a visitor's to read", async () => {
    const current = visitor.farm.current as () => Promise<Record<
      string,
      unknown
    > | null>;
    const farm = await current();
    expect(Object.keys(farm ?? {}).toSorted()).toEqual(["id", "name"]);
  });
});
