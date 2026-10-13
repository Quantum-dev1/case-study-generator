export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  /** Stable step tag, e.g. `extract:S1-S6` or `write:case-study`. Used as the cassette key. */
  tag: string;
  messages: ChatMessage[];
  /** Ask the server for a JSON object response (OpenAI `response_format`). */
  json?: boolean;
}

export interface Usage {
  calls: number;
  promptTokens: number;
  completionTokens: number;
}

/** Minimal LLM interface. Anything that can answer a chat request can drive the pipeline. */
export interface LLM {
  complete(request: CompletionRequest): Promise<string>;
  readonly usage: Usage;
  /** Called once at the end of a run (e.g. to flush a cassette). */
  close?(): Promise<void>;
}

export function emptyUsage(): Usage {
  return { calls: 0, promptTokens: 0, completionTokens: 0 };
}
