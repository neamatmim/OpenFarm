import type { Database } from "@OpenFarm/db";
import { YEAR_CHANGE_IN_FORCE } from "@OpenFarm/db/schema/farm";
import type { YearRules } from "@OpenFarm/domain";

import { firstYearStarts } from "./farm-locale";

/**
 * How the farm's years run (ADR 0016, 0017): the month the server says they began in, and the Year Changes the Owner
 * has recorded and not withdrawn, oldest first. Read whenever a year is asked for, so a change recorded today moves
 * every screen at once and nothing worked out from a year is ever stored.
 */
export const yearRulesOf = async (
  db: Pick<Database, "query">,
  farmId: string
): Promise<YearRules> => {
  const changes = await db.query.financialYearChange.findMany({
    where: { farmId, ...YEAR_CHANGE_IN_FORCE },
    orderBy: { changingFrom: "asc", id: "asc" },
    columns: { changingFrom: true, newFrom: true },
  });
  return { firstStarts: firstYearStarts(), changes };
};

/** Every Year Change the farm has recorded, the withdrawn ones among them, newest first: what it changes, why, and
 *  who recorded and withdrew it. */
export const yearChangesOf = async (db: Database, farmId: string) => {
  const rows = await db.query.financialYearChange.findMany({
    where: { farmId },
    orderBy: { recordedAt: "desc", id: "desc" },
    with: {
      recorder: { columns: { name: true } },
      withdrawer: { columns: { name: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    changingFrom: row.changingFrom,
    newFrom: row.newFrom,
    reason: row.reason,
    recordedBy: row.recorder?.name ?? null,
    recordedAt: row.recordedAt,
    withdrawn:
      row.withdrawnAt === null
        ? null
        : {
            by: row.withdrawer?.name ?? null,
            at: row.withdrawnAt,
            reason: row.withdrawnReason,
          },
  }));
};
