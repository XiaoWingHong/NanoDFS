import { describe, expect, it } from "vitest";
import { escapeCsvCell, escapeCsvRow, sanitizeSpreadsheetFormulaPrefix } from "./csv.js";

describe("csv", () => {
  it("escapes commas and quotes per RFC-style CSV", () => {
    expect(escapeCsvCell(`say "hello"`)).toBe(`"say ""hello"""`);
    expect(escapeCsvCell("a,b")).toBe(`"a,b"`);
    expect(escapeCsvCell("line\nbreak")).toBe(`"line\nbreak"`);
  });

  it("prefixes spreadsheet formula injection vectors", () => {
    expect(sanitizeSpreadsheetFormulaPrefix("=1+1")).toBe("'=1+1");
    expect(sanitizeSpreadsheetFormulaPrefix("+cmd")).toBe("'+cmd");
    expect(sanitizeSpreadsheetFormulaPrefix("-1+2")).toBe("'-1+2");
    expect(sanitizeSpreadsheetFormulaPrefix("@ref")).toBe("'@ref");
    expect(sanitizeSpreadsheetFormulaPrefix("safe")).toBe("safe");
  });

  it("escapeCsvCell combines formula safety and CSV quoting", () => {
    expect(escapeCsvCell("=SUM(1)")).toBe("'=SUM(1)");
    expect(escapeCsvRow(["a", "=cmd", 42])).toBe("a,'=cmd,42");
    expect(escapeCsvRow(["x", 'say "hi"'])).toBe(`x,"say ""hi"""`);
  });
});
