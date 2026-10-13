import type { RawDocument } from "../types.js";

/** Markdown / plain-text documents: one source line per file line. */
export function parseDocument(path: string, content: string): RawDocument {
  const lines = splitLines(content).map((text, i) => ({ line: i + 1, text }));
  return { path, kind: "doc", lines };
}

export function splitLines(content: string): string[] {
  return content.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
}
