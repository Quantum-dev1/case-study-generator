import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { emptyUsage, type CompletionRequest, type LLM, type Usage } from "./types.js";

/**
 * A cassette stores LLM responses keyed by step tag. Record once against a live
 * endpoint, then replay offline: deterministic demos, CI and reproducible examples.
 */
export interface Cassette {
  version: 1;
  entries: Record<string, CassetteEntry>;
}

export interface CassetteEntry {
  response: string;
  /** sha256 of the request messages; replay warns when the prompt changed since recording. */
  promptHash?: string;
}

export function promptHash(request: CompletionRequest): string {
  return createHash("sha256").update(JSON.stringify(request.messages)).digest("hex").slice(0, 16);
}

export async function loadCassette(path: string): Promise<Cassette> {
  const data = JSON.parse(await readFile(path, "utf8")) as Partial<Cassette>;
  if (data.version !== 1 || typeof data.entries !== "object" || data.entries === null) {
    throw new Error(`${path} is not a valid cassette (expected {"version": 1, "entries": {...}})`);
  }
  return data as Cassette;
}

export class ReplayLLM implements LLM {
  readonly usage: Usage = emptyUsage();
  readonly warnings: string[] = [];

  constructor(
    private readonly cassette: Cassette,
    private readonly source = "cassette",
  ) {}

  static async fromFile(path: string): Promise<ReplayLLM> {
    return new ReplayLLM(await loadCassette(path), path);
  }

  async complete(request: CompletionRequest): Promise<string> {
    const entry = this.cassette.entries[request.tag];
    if (!entry) {
      const known = Object.keys(this.cassette.entries).join(", ") || "none";
      throw new Error(
        `No recorded response for step "${request.tag}" in ${this.source}. ` +
          `Recorded steps: ${known}. Re-record with --record against a live endpoint.`,
      );
    }
    if (entry.promptHash && entry.promptHash !== promptHash(request)) {
      this.warnings.push(`Prompt for "${request.tag}" changed since it was recorded; replaying the old response.`);
    }
    this.usage.calls++;
    return entry.response;
  }
}

export class RecordingLLM implements LLM {
  private readonly cassette: Cassette = { version: 1, entries: {} };

  constructor(
    private readonly inner: LLM,
    private readonly path: string,
  ) {}

  get usage(): Usage {
    return this.inner.usage;
  }

  async complete(request: CompletionRequest): Promise<string> {
    const response = await this.inner.complete(request);
    this.cassette.entries[request.tag] = { response, promptHash: promptHash(request) };
    return response;
  }

  async close(): Promise<void> {
    let existing: Cassette = { version: 1, entries: {} };
    try {
      existing = await loadCassette(this.path);
    } catch {
      // new cassette
    }
    const merged: Cassette = { version: 1, entries: { ...existing.entries, ...this.cassette.entries } };
    await writeFile(this.path, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  }
}
