import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { appRouter } from "./index";

describe("language", () => {
  it("is Bangla for a person who has never chosen", async () => {
    // A person no other test touches: the shared database means "never chosen" has to be
    // true of this principal specifically.
    const { client } = await createTestClient(appRouter, { as: "newcomer" });

    expect(await client.language.get()).toEqual({ language: "bn" });
  });

  it("remembers a person's choice", async () => {
    const { client } = await createTestClient(appRouter, { as: "manager" });

    await client.language.set({ language: "en" });

    expect(await client.language.get()).toEqual({ language: "en" });
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
