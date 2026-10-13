import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyUsage, type CompletionRequest, type LLM, type Usage } from "../src/llm/types.js";
import type { Chunk, ProjectConfig } from "../src/types.js";

type Answer = string | Record<string, unknown> | ((req: CompletionRequest) => unknown);

/** Mocked LLM: answers by step tag (exact match or prefix like `extract:`), records every request. */
export class MockLLM implements LLM {
  readonly usage: Usage = emptyUsage();
  readonly requests: CompletionRequest[] = [];

  constructor(private readonly answers: Record<string, Answer>) {}

  async complete(req: CompletionRequest): Promise<string> {
    this.requests.push(req);
    this.usage.calls++;
    const key = Object.keys(this.answers).find((k) => req.tag === k || (k.endsWith(":") && req.tag.startsWith(k)));
    if (!key) throw new Error(`MockLLM: no answer for ${req.tag}`);
    const a = this.answers[key];
    const value = typeof a === "function" ? (a as (r: CompletionRequest) => unknown)(req) : a;
    return typeof value === "string" ? value : JSON.stringify(value);
  }
}

export function chunk(id: string, text: string, extra: Partial<Chunk> = {}): Chunk {
  return { id, path: `${id.toLowerCase()}.md`, kind: "doc", lineStart: 1, lineEnd: text.split("\n").length, text, ...extra };
}

export const CONFIG: ProjectConfig = {
  project: "Fleet portal",
  agency: "Example Studio",
  client: { name: "Acme Logistics", aliases: ["Acme"], industry: "a mid-size logistics company" },
  redact: { "Jane Doe": "Client executive" },
};

export async function tempDir(prefix = "csg-"): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}
