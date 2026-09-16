import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

describe("language", () => {
  it("is Bangla for a person who has never chosen", async () => {
    // The newcomer, whom no test in this file gives a language: "never chosen" has to be true of somebody.
    const { client } = await createTestClient(appRouter, { as: "newcomer" });

    expect(await client.language.get()).toEqual({ language: "bn" });
  });

  it("remembers a person's choice", async () => {
    const { client } = await createTestClient(appRouter, { as: "manager" });

    await client.language.set({ language: "en" });

    try {
      expect(await client.language.get()).toEqual({ language: "en" });
    } finally {
      // The Manager is every file's Manager: papers and notices elsewhere are asserted in Bangla.
      await client.language.set({ language: "bn" });
    }
  });

  it("refuses a language the app does not speak", async () => {
    const { client } = await createTestClient(appRouter, { as: "owner" });

    await expect(
      // @ts-expect-error — proving the runtime guard, not the type
      client.language.set({ language: "fr" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("is not available to an unauthenticated caller", async () => {
    const { client } = await createTestClient(appRouter, { as: null });

    await expect(client.language.get()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
