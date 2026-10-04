import { createDb } from "@OpenFarm/db";
import { sql } from "@OpenFarm/db/operators";
import { describe, expect, it } from "vitest";

// Every moment the farm keeps carries its zone, so it is the same instant in any session; each of the farm's sessions
// still runs at UTC, so a moment cut to its day in SQL falls on the UTC day the code works in, not Dhaka's.

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

  it("lets no statement run past half a minute, nor a transaction sit idle past one", async () => {
    const db = createDb(process.env.DATABASE_URL ?? "", {
      allowExitOnIdle: true,
    });
    const result = await db.execute<{ statement: string; idle: string }>(
      sql`select current_setting('statement_timeout') as statement,
                 current_setting('idle_in_transaction_session_timeout') as idle`
    );
    expect(result.rows[0]).toEqual({ statement: "30s", idle: "1min" });
    await db.$client.end();
  });
});
