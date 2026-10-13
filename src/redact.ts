import type { CaseStudy, Chunk, Claim, ProjectConfig } from "./types.js";

/**
 * NDA mode: replaces the client's name (and aliases, people, products listed in
 * `redact`) with a neutral description such as "a regional freight carrier".
 */
export interface Redactor {
  text(input: string): string;
  /** For file paths and ids: replacement is slugified (`a-regional-freight-carrier`). */
  path(input: string): string;
  /** Returns any configured name still present in `input` (case-insensitive). */
  leaks(input: string): string[];
}

interface Rule {
  term: string;
  replacement: string;
  pattern: RegExp;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function boundary(term: string, re: string): string {
  const start = /^\w/.test(term) ? "\\b" : "";
  const end = /\w$/.test(term) ? "\\b" : "";
  return `${start}${re}${end}`;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function isSentenceStart(full: string, offset: number): boolean {
  const before = full.slice(0, offset);
  return /((?:^|\n)\s*(?:[-*>#|]+\s*)?|[.!?]\s+|["“(]\s*)$/.test(before);
}

export function createRedactor(config: ProjectConfig): Redactor {
  const industry = config.client.industry.trim();
  const industryNoArticle = industry.replace(/^(a|an|the)\s+/i, "");
  const terms: [string, string][] = [
    [config.client.name, industry],
    ...(config.client.aliases ?? []).map((a): [string, string] => [a, industry]),
    ...Object.entries(config.redact ?? {}),
  ];
  const rules: Rule[] = terms
    .filter(([t]) => t.trim().length > 0)
    .sort((a, b) => b[0].length - a[0].length)
    .map(([term, replacement]) => ({
      term,
      replacement,
      pattern: new RegExp(`(\\b[Tt]he\\s+)?${boundary(term, escapeRegExp(term))}`, "gi"),
    }));

  const text = (input: string): string => {
    let out = input;
    for (const rule of rules) {
      out = out.replace(rule.pattern, (match: string, the: string | undefined, offset: number, full: string) => {
        const isClient = rule.replacement === industry;
        let rep: string;
        if (the && isClient) rep = `${the}${industryNoArticle}`;
        else rep = `${the ?? ""}${rule.replacement}`;
        if (!the && isSentenceStart(full, offset)) rep = capitalize(rep);
        return rep;
      });
    }
    return out;
  };

  const path = (input: string): string => {
    let out = input;
    for (const rule of rules) {
      const loose = rule.term.split(/[\s_-]+/).map(escapeRegExp).join("[\\s_-]*");
      out = out.replace(new RegExp(loose, "gi"), slug(rule.replacement === industry ? industryNoArticle : rule.replacement));
    }
    return out;
  };

  const leaks = (input: string): string[] =>
    rules.filter((r) => new RegExp(boundary(r.term, escapeRegExp(r.term)), "i").test(input)).map((r) => r.term);

  return { text, path, leaks };
}

function redactClaim(c: Claim, r: Redactor): Claim {
  return { text: r.text(c.text), sources: c.sources };
}

export function redactCaseStudy(study: CaseStudy, r: Redactor): CaseStudy {
  const out: CaseStudy = {
    title: r.text(study.title),
    summary: redactClaim(study.summary, r),
    challenge: study.challenge.map((c) => redactClaim(c, r)),
    solution: study.solution.map((c) => redactClaim(c, r)),
    results: study.results.map((c) => redactClaim(c, r)),
    stack: study.stack.map((c) => redactClaim(c, r)),
  };
  if (study.quote) out.quote = { text: r.text(study.quote.text), attribution: r.text(study.quote.attribution), sources: study.quote.sources };
  return out;
}

/** Redacts the source excerpts and paths that footnotes show. */
export function redactChunks(chunks: Chunk[], r: Redactor): Chunk[] {
  return chunks.map((c) => ({ ...c, path: r.path(c.path), text: r.text(c.text) }));
}
