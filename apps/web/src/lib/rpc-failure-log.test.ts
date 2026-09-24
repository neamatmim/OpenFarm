import { inspect } from "node:util";

import { onError, os } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { logTheFailure } from "./rpc-failure-log";

// What a failed call writes to the server's log, read through a real oRPC handler with the farm's own interceptor —
// the way a mistyped `portal.join` reaches it.

const PASSWORD = "gorur-khamar-secret-2026";
const NID = "1985220788993";

const router = {
  join: os
    .input(
      z.object({
        phone: z.string(),
        code: z.string().min(4),
        password: z.string(),
      })
    )
    .handler(() => ({ ok: true })),
  record: os.output(z.object({ nid: z.string().max(4) })).handler(() => ({
    nid: NID,
  })),
  broken: os.handler(() => {
    throw new Error("the database went away");
  }),
};

const handler = new RPCHandler(router, {
  interceptors: [onError(logTheFailure)],
});

/** Sends one call the way the farm's own client does, and hands back what the log was given. */
const logged = async (path: string, input?: unknown) => {
  const log = vi.spyOn(console, "error").mockImplementation(() => null);
  await handler.handle(
    new Request(`http://farm.test/rpc/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: input }),
    }),
    { prefix: "/rpc", context: {} }
  );
  // Read as the console writes it — every field and cause, all the way down — not as JSON, which drops an Error's own.
  return inspect(log.mock.calls, { depth: null });
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a failed call's line in the log", () => {
  it("never carries the password somebody typed, only which field failed", async () => {
    const line = await logged("join", {
      phone: "01712345678",
      code: "AB",
      password: PASSWORD,
    });

    expect(line).toContain("BAD_REQUEST");
    expect(line).toContain("code");
    expect(line).not.toContain(PASSWORD);
    expect(line).not.toContain("01712345678");
  });

  it("never carries the answer that failed its own check", async () => {
    const line = await logged("record");

    expect(line).toContain("nid");
    expect(line).not.toContain(NID);
  });

  it("keeps what an unexpected error was, and where it was thrown", async () => {
    const line = await logged("broken");

    expect(line).toContain("the database went away");
    expect(line).toContain("rpc-failure-log.test.ts");
  });
});
