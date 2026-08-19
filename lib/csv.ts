/** Quotes a value for CSV only when it actually needs it. */
function csvCell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Builds a CSV string (with header row) from an array of plain objects. */
export function toCsv(rows: Record<string, string | number | null | undefined>[], columns: string[]): string {
  const header = columns.map(csvCell).join(",");
  const body = rows.map((row) => columns.map((col) => csvCell(row[col])).join(",")).join("\n");
  return `${header}\n${body}\n`;
}
