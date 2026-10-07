import {
  aSetupCode,
  hashOfSetupCode,
  setUpCodeIfNoFarm,
  setupCodeAnswers,
  theSetupCodeHash,
} from "@OpenFarm/auth/setup-code";
import { setupCode } from "@OpenFarm/db/schema/auth";
import { createTestPrincipal, scratchDb } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

// A production server with no farm prints a one-time code in its own log, and the first Owner signs up with it: only
// somebody who can read the server's log can open the account that becomes the Owner's (the Owner, 2026-10-07).

const CODE_SHAPE =
  /^[34679ACDEFGHJKMNPQRTUVWXY]{4}(?:-[34679ACDEFGHJKMNPQRTUVWXY]{4}){2}$/u;

describe("a setup code", () => {
  it("is twelve letters nobody misreads, in groups of four, and a new one each time", () => {
    const one = aSetupCode();
    expect(one).toMatch(CODE_SHAPE);
    expect(aSetupCode()).not.toBe(one);
  });

  it("answers however it is typed — case, spaces, dashes — and nothing else does", () => {
    const code = aSetupCode();
    const kept = hashOfSetupCode(code);
    expect(setupCodeAnswers(code, kept)).toBe(true);
    expect(
      setupCodeAnswers(` ${code.toLowerCase().replaceAll("-", " ")} `, kept)
    ).toBe(true);
    expect(setupCodeAnswers(aSetupCode(), kept)).toBe(false);
    expect(setupCodeAnswers("", kept)).toBe(false);
    expect(setupCodeAnswers(null, kept)).toBe(false);
    // Nothing kept, nothing answers — a server that never made one opens for nobody.
    expect(setupCodeAnswers(code, undefined)).toBe(false);
  });

  it("is kept only as its hash", () => {
    const code = aSetupCode();
    expect(hashOfSetupCode(code)).toMatch(/^[0-9a-f]{64}$/u);
    expect(hashOfSetupCode(code)).not.toContain(code.replaceAll("-", ""));
  });

  it("is forgotten as a server starts once the farm is set up, and none is made", async () => {
    await createTestPrincipal("owner", new Date());
    await scratchDb()
      .insert(setupCode)
      .values({
        id: "the-farm",
        codeHash: hashOfSetupCode("LEFT-OVER-CODE"),
        madeAt: new Date(),
      })
      .onConflictDoNothing();

    expect(await setUpCodeIfNoFarm(scratchDb(), new Date())).toBeNull();
    expect(await theSetupCodeHash(scratchDb())).toBeUndefined();
  });

  it("is made once while there is no farm, and a restart prints no other", async () => {
    const db = scratchDb();
    // The shared test database always holds a farm: here the server sees none, and the rest is the real database.
    const noFarm = {
      query: new Proxy(db.query, {
        get: (query, name) =>
          name === "farm"
            ? { findFirst: () => Promise.resolve() }
            : Reflect.get(query, name),
      }),
      insert: db.insert.bind(db),
      delete: db.delete.bind(db),
    } as unknown as typeof db;
    await db.delete(setupCode);

    const printed = await setUpCodeIfNoFarm(noFarm, new Date());
    expect(printed).toMatch(CODE_SHAPE);
    expect(setupCodeAnswers(printed, await theSetupCodeHash(db))).toBe(true);
    // A restart, or a second instance: nothing printed, and the first code still the one.
    expect(await setUpCodeIfNoFarm(noFarm, new Date())).toBeNull();
    expect(setupCodeAnswers(printed, await theSetupCodeHash(db))).toBe(true);

    await db.delete(setupCode);
  });
});
