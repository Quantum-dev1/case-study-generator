import { formatTranscriptLine } from "./collect/transcript.js";
import type { Chunk, RawDocument, SourceLine } from "./types.js";

export interface ChunkOptions {
  /** Soft limit for a chunk's text length. */
  maxChars?: number;
}

/**
 * Splits documents into citeable chunks with stable ids (`S1`, `S2`, ...).
 * Ids depend only on document order and content, so re-running on the same
 * materials yields the same ids (important for briefs and recorded LLM responses).
 */
export function chunkDocuments(docs: RawDocument[], options: ChunkOptions = {}): Chunk[] {
  const maxChars = options.maxChars ?? 1200;
  const chunks: Chunk[] = [];
  for (const doc of docs) {
    let current: SourceLine[] = [];
    let size = 0;
    const flush = () => {
      const meaningful = current.filter((l) => l.text.trim() !== "");
      if (meaningful.length > 0) chunks.push(makeChunk(`S${chunks.length + 1}`, doc, meaningful));
      current = [];
      size = 0;
    };
    for (const line of doc.lines) {
      const isHeading = doc.kind === "doc" && /^#{1,6}\s/.test(line.text);
      if (current.length > 0 && (size + line.text.length > maxChars || (isHeading && size > 0 && hasBody(current)))) {
        flush();
      }
      current.push(line);
      size += line.text.length + 1;
    }
    flush();
  }
  return chunks;
}

function hasBody(lines: SourceLine[]): boolean {
  return lines.some((l) => l.text.trim() !== "" && !/^#{1,6}\s/.test(l.text));
}

function makeChunk(id: string, doc: RawDocument, lines: SourceLine[]): Chunk {
  const text = lines
    .map((l) => (doc.kind === "transcript" ? formatTranscriptLine(l) : l.text))
    .join("\n")
    .trim();
  const first = lines[0]!;
  const last = lines[lines.length - 1]!;
  const chunk: Chunk = { id, path: doc.path, kind: doc.kind, lineStart: first.line, lineEnd: last.line, text };
  if (first.timestamp) chunk.timeRange = first.timestamp === last.timestamp || !last.timestamp ? first.timestamp : `${first.timestamp}–${last.timestamp}`;
  return chunk;
}

/** Human-readable location, e.g. `notes/kickoff.md, lines 4–12` or `call.vtt, 00:03:10–00:05:42`. */
export function describeChunk(chunk: Chunk): string {
  if (chunk.timeRange) return `${chunk.path}, ${chunk.timeRange}`;
  const lines = chunk.lineStart === chunk.lineEnd ? `line ${chunk.lineStart}` : `lines ${chunk.lineStart}–${chunk.lineEnd}`;
  return `${chunk.path}, ${lines}`;
}
