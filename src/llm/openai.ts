import { emptyUsage, type CompletionRequest, type LLM, type Usage } from "./types.js";

export interface OpenAICompatibleOptions {
  baseUrl: string;
  model: string;
  apiKey?: string;
  temperature?: number;
  timeoutMs?: number;
  maxRetries?: number;
  /** Send `response_format: {type: "json_object"}` for JSON steps. Disable for servers that reject it. */
  jsonMode?: boolean;
  /** Injected for tests. */
  fetch?: typeof fetch;
  /** Injected for tests (no real sleeping). */
  sleep?: (ms: number) => Promise<void>;
}

export class LLMError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LLMError";
  }
}

/** Reads `CSG_*` environment variables. Throws a helpful error if the endpoint is not configured. */
export function optionsFromEnv(env: NodeJS.ProcessEnv = process.env): OpenAICompatibleOptions {
  const baseUrl = env.CSG_BASE_URL;
  const model = env.CSG_MODEL;
  if (!baseUrl || !model) {
    throw new LLMError(
      "No LLM endpoint configured. Set CSG_BASE_URL and CSG_MODEL (and CSG_API_KEY if your server needs one), " +
        "or run offline with --replay <cassette.json>.",
    );
  }
  const opts: OpenAICompatibleOptions = {
    baseUrl,
    model,
    temperature: numberEnv(env.CSG_TEMPERATURE, 0.2),
    timeoutMs: numberEnv(env.CSG_TIMEOUT_MS, 120_000),
    maxRetries: numberEnv(env.CSG_MAX_RETRIES, 3),
    jsonMode: env.CSG_JSON_MODE !== "0",
  };
  if (env.CSG_API_KEY) opts.apiKey = env.CSG_API_KEY;
  return opts;
}

function numberEnv(value: string | undefined, fallback: number): number {
  const n = value === undefined || value === "" ? NaN : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const RETRYABLE = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

/** Client for any OpenAI-compatible `/chat/completions` endpoint. */
export class OpenAICompatibleLLM implements LLM {
  readonly usage: Usage = emptyUsage();
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: OpenAICompatibleOptions) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async complete(request: CompletionRequest): Promise<string> {
    const url = `${this.options.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    const body: Record<string, unknown> = {
      model: this.options.model,
      messages: request.messages,
      temperature: this.options.temperature ?? 0.2,
    };
    if (request.json && this.options.jsonMode !== false) body.response_format = { type: "json_object" };
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.options.apiKey) headers.authorization = `Bearer ${this.options.apiKey}`;

    const maxRetries = this.options.maxRetries ?? 3;
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) await this.sleep(Math.min(30_000, 1000 * 2 ** (attempt - 1)));
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.options.timeoutMs ?? 120_000),
        });
      } catch (err) {
        lastError = err;
        continue;
      }
      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 500);
        lastError = new LLMError(`LLM request "${request.tag}" failed: HTTP ${res.status} ${detail}`, res.status);
        if (RETRYABLE.has(res.status)) continue;
        throw lastError;
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string | null } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== "string") throw new LLMError(`LLM request "${request.tag}" returned no message content`);
      this.usage.calls++;
      this.usage.promptTokens += data.usage?.prompt_tokens ?? 0;
      this.usage.completionTokens += data.usage?.completion_tokens ?? 0;
      return content;
    }
    if (lastError instanceof LLMError) throw lastError;
    throw new LLMError(`LLM request "${request.tag}" failed after ${maxRetries + 1} attempts: ${String(lastError)}`);
  }
}
