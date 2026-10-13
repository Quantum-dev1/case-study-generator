import { parseJsonObject } from "./llm/json.js";
import type { LLM } from "./llm/types.js";
import type { CaseStudy, Claim, Fact, ProjectConfig } from "./types.js";

export const WRITE_TAG = "write:case-study";

export const WRITE_SYSTEM_PROMPT = `You write client-ready software case studies for an agency website.
You receive a list of approved facts, each with an id like F3. Write ONLY from these facts.

Return a JSON object:
{
  "title": "short, specific headline",
  "summary": {"text": "one-sentence lead", "facts": ["F1"]},
  "challenge": [{"text": "one or two sentences", "facts": ["F2", "F3"]}],
  "solution": [{"text": "...", "facts": ["F5"]}],
  "results": [{"text": "one outcome per item", "facts": ["F9"]}],
  "stack": [{"text": "technology — what it was used for", "facts": ["F12"]}],
  "quote": "F15" or null
}

Rules:
- Every item cites the fact ids it is based on. Do not cite ids that were not given.
- Use numbers exactly as stated in the facts. Do not compute new numbers (no derived percentages,
  totals, multipliers or annualised figures).
- Plain, confident, specific language. No hype words ("revolutionary", "seamless", "cutting-edge").
- "quote" is the id of one quote fact to feature (it is reproduced verbatim), or null.`;

export interface WriterDraft {
  study: CaseStudy;
  /** Fact ids the model cited that do not exist or are not approved. */
  invalidFactIds: string[];
}

interface RawClaim {
  text?: unknown;
  facts?: unknown;
}

export function renderFactsForPrompt(facts: Fact[]): string {
  return facts
    .map((f) => {
      const who = f.category === "quote" && f.attribution ? ` (said by ${f.attribution})` : "";
      return `${f.id} [${f.category}] ${f.statement}${who}`;
    })
    .join("\n");
}

/** Asks the LLM for a structured case study and maps fact citations to source citations. */
export async function writeDraft(facts: Fact[], config: ProjectConfig, notes: string, llm: LLM): Promise<WriterDraft> {
  const approved = facts.filter((f) => f.approved);
  const guidance = notes.trim() || config.audience || "";
  const reply = await llm.complete({
    tag: WRITE_TAG,
    json: true,
    messages: [
      { role: "system", content: WRITE_SYSTEM_PROMPT },
      {
        role: "user",
        content:
          `Project: ${config.project}\nClient: ${config.client.name}\n` +
          (config.agency ? `Agency: ${config.agency}\n` : "") +
          (guidance ? `Editor guidance:\n${guidance}\n` : "") +
          `\nApproved facts:\n${renderFactsForPrompt(approved)}`,
      },
    ],
  });
  return draftFromReply(parseJsonObject(reply), approved, config);
}

/** Converts the writer JSON into a CaseStudy whose claims cite source ids (via the facts they used). */
export function draftFromReply(raw: unknown, approvedFacts: Fact[], config: ProjectConfig): WriterDraft {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const byId = new Map(approvedFacts.map((f) => [f.id, f]));
  const invalid = new Set<string>();

  const toClaim = (value: unknown): Claim | null => {
    const c = (typeof value === "object" && value !== null ? value : {}) as RawClaim;
    const text = typeof c.text === "string" ? c.text.trim() : "";
    if (!text) return null;
    const ids = Array.isArray(c.facts) ? c.facts.filter((x): x is string => typeof x === "string") : [];
    const sources: string[] = [];
    for (const id of ids) {
      const fact = byId.get(id.trim());
      if (!fact) invalid.add(id);
      else sources.push(...fact.sources);
    }
    return { text, sources: [...new Set(sources)] };
  };
  const list = (value: unknown): Claim[] => (Array.isArray(value) ? value.map(toClaim).filter((c): c is Claim => c !== null) : []);

  const study: CaseStudy = {
    title: typeof r.title === "string" && r.title.trim() ? r.title.trim() : config.project,
    summary: toClaim(r.summary) ?? { text: "", sources: [] },
    challenge: list(r.challenge),
    solution: list(r.solution),
    results: list(r.results),
    stack: list(r.stack),
  };
  if (typeof r.quote === "string" && r.quote.trim()) {
    const q = byId.get(r.quote.trim());
    if (q && q.category === "quote") {
      study.quote = { text: q.statement, attribution: q.attribution ?? "Client", sources: [...q.sources] };
    } else {
      invalid.add(r.quote);
    }
  }
  return { study, invalidFactIds: [...invalid] };
}
