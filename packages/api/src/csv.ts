/** A minimal RFC-4180 reader: quoted fields, doubled quotes, CRLF. Enough for the opening
 *  register, which the Manager exports from a spreadsheet. Rows carry the line they came
 *  from, so a blank line between sections cannot shift the numbers we report back. */
export interface CsvRow {
  line: number;
  values: string[];
}

export const parseCsv = (text: string): CsvRow[] => {
  const rows: CsvRow[] = [];
  let values: string[] = [];
  let field = "";
  let quoted = false;
  /** Non-space content seen in this field: a quote after only spaces still opens a field. */
  let content = false;
  let line = 1;
  let rowLine = 1;

  const endField = () => {
    values.push(field.trim());
    field = "";
    content = false;
  };
  const endRow = () => {
    endField();
    if (values.some((value) => value !== "")) {
      rows.push({ line: rowLine, values });
    }
    values = [];
    rowLine = line + 1;
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        if (char === "\n") {
          line += 1;
        }
        field += char;
      }
      continue;
    }
    if (char === '"' && !content) {
      quoted = true;
      content = true;
      field = "";
    } else if (char === ",") {
      endField();
    } else if (char === "\n") {
      endRow();
      line += 1;
    } else if (char !== "\r") {
      field += char;
      if (char !== " " && char !== "\t") {
        content = true;
      }
    }
  }
  endRow();
  return rows;
};

export interface CsvRecord {
  line: number;
  values: Record<string, string>;
}

/** Rows keyed by their header, lower-cased and underscored, each with its source line. */
export const parseCsvRecords = (text: string): CsvRecord[] => {
  const [header, ...rest] = parseCsv(text);
  if (!header) {
    return [];
  }
  const keys = header.values.map((key) =>
    key.toLowerCase().replaceAll(" ", "_")
  );
  return rest.map((row) => ({
    line: row.line,
    values: Object.fromEntries(
      keys.map((key, index) => [key, row.values[index] ?? ""])
    ),
  }));
};

/** A field a spreadsheet would read as a formula: a buyer named "=HYPERLINK(...)" is a buyer name
 *  somebody should not be able to run on the accountant's computer. */
const LOOKS_LIKE_A_FORMULA = /^[=+\-@\t\r]/u;

/** One field as RFC 4180 writes it: quoted when it holds a comma, a quote or a line break, and made
 *  inert when a spreadsheet would take it for a formula. */
const csvField = (value: string | number | null): string => {
  if (value === null) {
    return "";
  }
  if (typeof value === "number") {
    return String(value);
  }
  const inert = LOOKS_LIKE_A_FORMULA.test(value) ? `'${value}` : value;
  return /[",\r\n]/u.test(inert) ? `"${inert.replaceAll('"', '""')}"` : inert;
};

/**
 * A CSV an accountant's or a processor's spreadsheet opens: a byte-order mark so Bangla opens as Bangla
 * rather than as noise, a header row, one row per record ending in CRLF as RFC 4180 has it, and plain
 * digits whatever language the person producing it reads in.
 */
export const toCsv = (
  header: readonly string[],
  rows: readonly (readonly (string | number | null)[])[]
): string =>
  `\uFEFF${[header, ...rows].map((row) => row.map(csvField).join(",")).join("\r\n")}\r\n`;
