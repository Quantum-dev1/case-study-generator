import { describeChunk } from "./chunk.js";
import { parseJsonObject } from "./llm/json.js";
import type { LLM } from "./llm/types.js";
import { NumberIndex, normalizeForQuote, unsupportedNumbers } from "./numbers.js";
import { mapWithConcurrency } from "./pool.js";
import { FACT_CATEGORIES, type Chunk, type Fact, type FactCategory, type ProjectConfig } from "./types.js";

export interface ExtractOptions {
  maxBatchChars?: number;
  concurrency?: number;
}

export interface ExtractResult {
  facts: Fact[];
  /** Facts the model returned that were discarded, with the reason. */
  dropped: { statement: string; reason: string }[];
}

export const EXTRACT_SYSTEM_PROMPT = `You extract facts for a software project case study.
You receive source chunks, each labelled with an id like S3.

Return a JSON object: {"facts": [{"category": "...", "statement": "...", "sources": ["S3"], "attribution": "..."}]}

Rules:
- category is one of: challenge, solution, result, stack, context, quote.
- Only extract what the sources state. Never infer, estimate, round or compute numbers
  (no percentages derived from before/after values unless a source states the percentage).
- Copy numbers and units exactly as they appear in the source.
- Every fact lists the ids of the chunks that state it in "sources". Use only ids you were given.
- One fact per statement; keep statements short and self-contained (one sentence).
- For category "quote": "statement" is a verbatim quote from a transcript (no paraphrasing)
  and "attribution" is the speaker as written in the source. Prefer quotes about the problem or the outcome.
- Skip small talk, scheduling, and anything not useful for a case study.`;

/** Groups chunks into batches that fit one LLM request. */
export function batchChunks(chunks: Chunk[], maxChars = 6000): Chunk[][] {
  const batches: Chunk[][] = [];
  let current: Chunk[] = [];
  let size = 0;
  for (const chunk of chunks) {
    if (current.length > 0 && size + chunk.text.length > maxChars) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(chunk);
    size += chunk.text.length;
  }
  if (current.length) batches.push(current);
  return batches;
}

export function batchTag(batch: Chunk[]): string {
  const first = batch[0]!.id;
  const last = batch[batch.length - 1]!.id;
  return first === last ? `extract:${first}` : `extract:${first}-${last}`;
}

export function renderChunksForPrompt(batch: Chunk[]): string {
  return batch.map((c) => `<<${c.id} | ${describeChunk(c)}>>\n${c.text}`).join("\n\n");
}

interface RawFact {
  category?: unknown;
  statement?: unknown;
  sources?: unknown;
  attribution?: unknown;
}

/** Extracts facts from all chunks via the LLM, then validates every fact against the sources. */
export async function extractFacts(chunks: Chunk[], config: ProjectConfig, llm: LLM, options: ExtractOptions = {}): Promise<ExtractResult> {
  const batches = batchChunks(chunks, options.maxBatchChars);
  const replies = await mapWithConcurrency(batches, options.concurrency ?? 3, async (batch) => {
    const reply = await llm.complete({
      tag: batchTag(batch),
      json: true,
      messages: [
        { role: "system", content: EXTRACT_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Project: ${config.project}\nClient: ${config.client.name}\n\nSources:\n\n${renderChunksForPrompt(batch)}`,
        },
      ],
    });
    const parsed = parseJsonObject(reply) as { facts?: RawFact[] };
    return Array.isArray(parsed.facts) ? parsed.facts : [];
  });
  return validateFacts(replies.flat(), chunks);
}

const CATEGORY_ORDER: Record<FactCategory, number> = { challenge: 0, solution: 1, result: 2, stack: 3, context: 4, quote: 5 };

/**
 * Turns raw model output into facts:
 * - drops facts without a statement or without any valid source id;
 * - flags (unticks) facts whose numbers are not in the cited chunks, and quotes that are not verbatim;
 * - merges duplicates; assigns ids F1..Fn in brief order.
 */
export function validateFacts(raw: RawFact[], chunks: Chunk[]): ExtractResult {
  const byId = new Map(chunks.map((c) => [c.id, c]));
  const dropped: ExtractResult["dropped"] = [];
  const merged = new Map<string, Fact>();

  for (const r of raw) {
    const statement = typeof r.statement === "string" ? r.statement.trim().replace(/\s+/g, " ") : "";
    if (!statement) {
      dropped.push({ statement: "", reason: "empty statement" });
      continue;
    }
    const cited = Array.isArray(r.sources) ? r.sources.filter((s): s is string => typeof s === "string").map((s) => s.trim()) : [];
    const sources = [...new Set(cited.filter((s) => byId.has(s)))];
    if (sources.length === 0) {
      dropped.push({ statement, reason: cited.length ? `unknown source ids: ${cited.join(", ")}` : "no source cited" });
      continue;
    }
    const category = (FACT_CATEGORIES as readonly string[]).includes(String(r.category)) ? (r.category as FactCategory) : "context";
    const key = `${category}|${normalizeForQuote(statement)}`;
    const existing = merged.get(key);
    if (existing) {
      existing.sources = [...new Set([...existing.sources, ...sources])];
      continue;
    }
    const fact: Fact = { id: "", category, statement, sources, approved: true, warnings: [] };
    if (category === "quote" && typeof r.attribution === "string" && r.attribution.trim()) fact.attribution = r.attribution.trim();
    merged.set(key, fact);
  }

  const facts = [...merged.values()].sort((a, b) => CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category]);
  facts.forEach((f, i) => {
    f.id = `F${i + 1}`;
    checkFact(f, byId);
  });
  return { facts, dropped };
}

/** Re-runs the automatic checks for one fact (also used after a human edits the brief). */
export function checkFact(fact: Fact, chunksById: Map<string, Chunk>): void {
  fact.warnings = [];
  const cited = fact.sources.map((s) => chunksById.get(s)).filter((c): c is Chunk => c !== undefined);
  if (cited.length === 0) return; // editor statements are trusted by definition
  const index = new NumberIndex(cited.map((c) => c.text));
  const missing = unsupportedNumbers(fact.statement, index);
  if (missing.length) {
    fact.warnings.push(`number${missing.length > 1 ? "s" : ""} ${missing.map((n) => `"${n.raw}"`).join(", ")} not found in cited sources`);
  }
  if (fact.category === "quote") {
    const needle = normalizeForQuote(fact.statement);
    if (!cited.some((c) => normalizeForQuote(c.text).includes(needle))) fact.warnings.push("quote is not verbatim in the cited source");
  }
  if (fact.warnings.length) fact.approved = false;
}
