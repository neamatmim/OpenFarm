import { customType } from "drizzle-orm/pg-core";

/**
 * Money, as a figure rather than as a string.
 *
 * Money is kept `numeric(12,2)` — exact in the database, where it matters. The driver hands a numeric
 * back as a string, so every reader has had to remember `Number(...)` and every writer `.toFixed(2)`:
 * a fact about the column that had become part of the interface of every store that reads one.
 *
 * Here instead. The column is unchanged and no migration is needed — this is how the same column is
 * read and written, not what it is.
 *
 * What it does **not** do is make arithmetic exact. Taka and paisa still arrive as a JS number, so a
 * sum of many of them can still land a paisa out; `roundTaka` is still how a total is settled, and the
 * Settlement's own sweep is still what catches the rest.
 */
export const taka = (name: string) =>
  customType<{ data: number; driverData: string }>({
    dataType: () => "numeric(12, 2)",
    fromDriver: Number,
    toDriver: (value: number) => value.toFixed(2),
  })(name);
