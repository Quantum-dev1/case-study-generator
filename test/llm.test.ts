import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RecordingLLM, ReplayLLM, promptHash } from "../src/llm/cassette.js";
import { parseJsonObject } from "../src/llm/json.js";
import { LLMError, OpenAICompatibleLLM, optionsFromEnv } from "../src/llm/openai.js";
import { MockLLM, tempDir } from "./helpers.js";

const ok = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), { status: 200 });

const req = { tag: "write:case-study", json: true, messages: [{ role: "user" as const, content: "hi" }] };

describe("OpenAICompatibleLLM", () => {
  it("posts to /chat/completions with model, auth and json mode, and tracks usage", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const llm = new OpenAICompatibleLLM({
      baseUrl: "https://llm.example.com/v1/",
      model: "test-model",
      apiKey: "sk-test",
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return ok("{}");
      }) as unknown as typeof fetch,
    });
    expect(await llm.complete(req)).toBe("{}");
    expect(calls[0]!.url).toBe("https://llm.example.com/v1/chat/completions");
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body).toMatchObject({ model: "test-model", response_format: { type: "json_object" } });
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe("Bearer sk-test");
    expect(llm.usage).toEqual({ calls: 1, promptTokens: 10, completionTokens: 5 });
  });

  it("retries transient errors with backoff and then succeeds", async () => {
    const statuses = [503, 429];
    const sleeps: number[] = [];
    const llm = new OpenAICompatibleLLM({
      baseUrl: "http://x",
      model: "m",
      jsonMode: false,
      sleep: async (ms) => void sleeps.push(ms),
      fetch: (async () => {
        const s = statuses.shift();
        return s ? new Response("busy", { status: s }) : ok("done");
      }) as unknown as typeof fetch,
    });
    expect(await llm.complete(req)).toBe("done");
    expect(sleeps).toEqual([1000, 2000]);
  });

  it("does not retry client errors", async () => {
    let n = 0;
    const llm = new OpenAICompatibleLLM({
      baseUrl: "http://x",
      model: "m",
      sleep: async () => {},
      fetch: (async () => {
        n++;
        return new Response("bad key", { status: 401 });
      }) as unknown as typeof fetch,
    });
    await expect(llm.complete(req)).rejects.toThrow(/HTTP 401 bad key/);
    expect(n).toBe(1);
  });

  it("reads configuration from CSG_* env and explains what is missing", () => {
    expect(() => optionsFromEnv({})).toThrow(LLMError);
    expect(() => optionsFromEnv({})).toThrow(/CSG_BASE_URL and CSG_MODEL/);
    expect(optionsFromEnv({ CSG_BASE_URL: "http://localhost:11434/v1", CSG_MODEL: "llama3", CSG_JSON_MODE: "0" })).toMatchObject({
      baseUrl: "http://localhost:11434/v1",
      model: "llama3",
      jsonMode: false,
      maxRetries: 3,
    });
  });
});

describe("cassettes", () => {
  it("records live responses and replays them offline", async () => {
    const dir = await tempDir();
    const path = join(dir, "cassette.json");
    const recorder = new RecordingLLM(new MockLLM({ "write:case-study": "recorded" }), path);
    expect(await recorder.complete(req)).toBe("recorded");
    await recorder.close();
    const saved = JSON.parse(await readFile(path, "utf8"));
    expect(saved.entries["write:case-study"]).toEqual({ response: "recorded", promptHash: promptHash(req) });

    const replay = await ReplayLLM.fromFile(path);
    expect(await replay.complete(req)).toBe("recorded");
    expect(replay.warnings).toEqual([]);
    await replay.complete({ ...req, messages: [{ role: "user", content: "changed" }] });
    expect(replay.warnings[0]).toMatch(/changed since it was recorded/);
  });

  it("fails clearly when a step was not recorded", async () => {
    const replay = new ReplayLLM({ version: 1, entries: { "extract:S1": { response: "{}" } } }, "demo.json");
    await expect(replay.complete(req)).rejects.toThrow('No recorded response for step "write:case-study" in demo.json. Recorded steps: extract:S1.');
  });
});

describe("parseJsonObject", () => {
  it("accepts plain JSON, fenced JSON and JSON wrapped in prose", () => {
    expect(parseJsonObject('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonObject('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(parseJsonObject('Sure! Here it is: {"a":3} Hope it helps.')).toEqual({ a: 3 });
    expect(() => parseJsonObject("no json")).toThrow(/not valid JSON/);
  });
});
