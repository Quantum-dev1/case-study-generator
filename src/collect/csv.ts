import type { RawDocument, SourceLine } from "../types.js";

/** RFC 4180-ish CSV parser (quoted fields, escaped quotes, CRLF). Returns rows with their 1-based start line. */
export function parseCsv(content: string): { line: number; cells: string[] }[] {
  const rows: { line: number; cells: string[] }[] = [];
  const text = content.replace(/^﻿/, "");
  let cells: string[] = [];
  let cell = "";
  let inQuotes = false;
  let line = 1;
  let rowStart = 1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === "\n") line++;
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      cells.push(cell);
      if (cells.some((c) => c.trim() !== "")) rows.push({ line: rowStart, cells });
      cells = [];
      cell = "";
      line++;
      rowStart = line;
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  if (cells.some((c) => c.trim() !== "")) rows.push({ line: rowStart, cells });
  return rows;
}

/** Metrics CSV: every data row becomes a `column: value; ...` line so numbers keep their meaning. */
export function parseMetricsCsv(path: string, content: string): RawDocument {
  const rows = parseCsv(content);
  const header = rows[0];
  if (!header) return { path, kind: "metrics", lines: [] };
  const columns = header.cells.map((c, i) => c.trim() || `column ${i + 1}`);
  const lines: SourceLine[] = rows.slice(1).map((row) => ({
    line: row.line,
    text: columns
      .map((col, i) => [col, (row.cells[i] ?? "").trim()] as const)
      .filter(([, v]) => v !== "")
      .map(([col, v]) => `${col}: ${v}`)
      .join("; "),
  }));
  return { path, kind: "metrics", lines };
}
