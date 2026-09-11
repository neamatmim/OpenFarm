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
