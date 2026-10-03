import { createDb } from "@OpenFarm/db";
import { sql } from "@OpenFarm/db/operators";
import { describe, expect, it } from "vitest";

// Every moment the farm keeps is written as UTC — drizzle writes a Date as its UTC wall clock into a column kept without
// its zone — so the database must read and default them at UTC too: a `DEFAULT now()` in a session set to the server's
// own zone would write Dhaka's wall clock into a column read back as UTC, six hours out.

describe("the database the farm talks to", () => {
  it("runs every connection at UTC, whatever its address or its server asks for", async () => {
    const url = process.env.DATABASE_URL ?? "";
    const separator = url.includes("?") ? "&" : "?";
    const askedForDhaka = `${url}${separator}options=${encodeURIComponent("-c TimeZone=Asia/Dhaka")}`;
    const db = createDb(askedForDhaka, { allowExitOnIdle: true });
    const result = await db.execute<{ zone: string }>(
      sql`select current_setting('TimeZone') as zone`
    );
    expect(result.rows[0]?.zone).toBe("UTC");
    await db.$client.end();
  });
});
