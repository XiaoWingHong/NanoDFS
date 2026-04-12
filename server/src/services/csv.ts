/**
 * CSV field escaping and spreadsheet formula-injection mitigation (OWASP-style).
 */
export function sanitizeSpreadsheetFormulaPrefix(value: string): string {
  if (/^[=+\-@\t\r\n]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

export function escapeCsvCell(value: unknown): string {
  let s = String(value ?? "");
  s = sanitizeSpreadsheetFormulaPrefix(s);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function escapeCsvRow(cells: unknown[]): string {
  return cells.map((c) => escapeCsvCell(c)).join(",");
}
