import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// A Closed Month (ADR 0028) is asked about every change to the figures its month is made of, so each of them is
// written in one place and no other. The Farm's money is written in the money store alone — `bookMoney`,
// `putMoneyRight`, `takeOffTheBooks`, and the Owner's approval, which writes who approved and when, never a figure.
// A Handover and a Cash Count are written in the cash store, a Write-off where it is written and put right, a Bank
// Check where it is read: each beside the Closed Month's own question. Written anywhere else, a change would land in a
// month the Owner has closed without refusing anybody else or telling the next paper.
const SOURCE = import.meta.dirname;

/** Each table a closed month's figures are read from, the files that may write it, and the variable it is known by. */
const WRITTEN_ONLY_IN = [
  {
    table: "money_event",
    name: "moneyEvent",
    files: ["money-store.ts"],
  },

  { table: "handover", name: "handover", files: ["cash-store.ts"] },
  { table: "cash_count", name: "cashCount", files: ["cash-store.ts"] },
  {
    table: "receivable_write_off",
    name: "receivableWriteOff",
    files: [
      path.join("routers", "receivables.ts"),
      path.join("corrections", "receivable-write-off.ts"),
    ],
  },
  {
    table: "farm_account_check",
    name: "farmAccountCheck",
    files: [path.join("routers", "farm-accounts.ts")],
  },
] as const;

const sources = readdirSync(SOURCE, { recursive: true, encoding: "utf-8" })
  .filter(
    (name) =>
      name.endsWith(".ts") &&
      !name.includes(".test.") &&
      !name.includes("node_modules") &&
      !name.startsWith(path.join("seed", ""))
  )
  .map(
    (name) => [name, readFileSync(path.join(SOURCE, name), "utf-8")] as const
  );

/** The names a file knows a table's variable by: its own, and any it was imported as. */
const namesFor = (source: string, name: string): string[] => [
  name,
  ...[...source.matchAll(new RegExp(`\\b${name}\\s+as\\s+(\\w+)`, "gu"))].map(
    (match) => match[1] ?? name
  ),
];

/** Whether a file writes a table: through the query builder by any name it knows it by, or in raw SQL. */
const writes = (
  source: string,
  { table, name }: { table: string; name: string }
): boolean => {
  const known = namesFor(source, name).join("|");
  const built = new RegExp(
    `\\.\\s*(?:update|insert|delete)\\s*\\(\\s*(?:[\\w.]+\\.)?(?:${known})\\s*\\)`,
    "u"
  );
  const raw = new RegExp(
    `\\b(?:update|insert\\s+into|delete\\s+from)\\s+(?:"?${table}"?\\b|\\$\\{\\s*(?:[\\w.]+\\.)?(?:${known})\\s*\\})`,
    "iu"
  );
  return built.test(source) || raw.test(source);
};

describe("where a closed month's figures are written", () => {
  it("reads the stores and the routers both", () => {
    const names = sources.map(([name]) => name);
    expect(names).toContain("money-store.ts");
    expect(names).toContain(path.join("corrections", "vet-fee.ts"));
  });

  it("knows a write however it is spelled", () => {
    const [moneyEvent] = WRITTEN_ONLY_IN;
    expect(writes("await tx.update(moneyEvent).set({})", moneyEvent)).toBe(
      true
    );
    expect(
      writes("await tx.delete(schema.moneyEvent).where(x)", moneyEvent)
    ).toBe(true);
    expect(
      writes(
        'import { moneyEvent as money } from "x";\nawait tx.insert(money).values(row)',
        moneyEvent
      )
    ).toBe(true);
    expect(
      writes(
        'await tx.execute(sql`update "money_event" set a = 1`)',
        moneyEvent
      )
    ).toBe(true);
    expect(
      writes(
        `await tx.execute(sql\`delete from ${"$"}{moneyEvent} where\`)`,

        moneyEvent
      )
    ).toBe(true);
    expect(writes("await tx.query.moneyEvent.findMany({})", moneyEvent)).toBe(
      false
    );
  });

  it("is written only where a Closed Month is asked about it", () => {
    const strays = WRITTEN_ONLY_IN.flatMap((table) =>
      sources
        .filter(
          ([name, source]) =>
            !(table.files as readonly string[]).includes(name) &&
            writes(source, table)
        )
        .map(([name]) => `${table.table} in ${name}`)
    );
    expect(strays).toEqual([]);
  });

  it("asks the Closed Month in every file that writes one", () => {
    const silent = WRITTEN_ONLY_IN.flatMap((table) =>
      table.files.filter((name) => {
        const source = sources.find(([one]) => one === name)?.[1] ?? "";
        return !/answerToClosedMonths|answerForWriteOff|takeOffTheBooks/u.test(
          source
        );
      })
    );
    expect(silent).toEqual([]);
  });

  it("writes only who approved and when in the Owner's approval, never a figure", () => {
    const store = sources.find(([name]) => name === "money-store.ts")?.[1];
    const approval = store?.slice(
      store.indexOf("export const approveMoney"),
      store.indexOf("};", store.indexOf("export const approveMoney"))
    );
    const set =
      approval?.match(/\.set\(\{(?<columns>[^}]*)\}\)/u)?.groups?.columns ?? "";

    expect(
      set
        .split(",")
        .map((one) => one.split(":")[0]?.trim())
        .filter(Boolean)
        .toSorted()
    ).toEqual(["approval", "approvedAt", "approvedBy"]);
  });
});
