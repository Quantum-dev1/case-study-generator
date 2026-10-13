/** Kind of raw material a chunk came from. */
export type SourceKind = "doc" | "transcript" | "git" | "metrics";

/** A raw document produced by a collector, before chunking. */
export interface RawDocument {
  /** Path relative to the materials folder (or `git:<repo>` for live git logs). */
  path: string;
  kind: SourceKind;
  /** Logical lines. `line` is the 1-based line number in the original file. */
  lines: SourceLine[];
}

export interface SourceLine {
  line: number;
  text: string;
  /** Transcript cue start, e.g. `00:03:10`. */
  timestamp?: string;
  speaker?: string;
}

/** A citeable unit of source text with a stable id such as `S3`. */
export interface Chunk {
  id: string;
  path: string;
  kind: SourceKind;
  lineStart: number;
  lineEnd: number;
  /** Transcript time range, if any, e.g. `00:03:10–00:05:42`. */
  timeRange?: string;
  text: string;
}

export const FACT_CATEGORIES = ["challenge", "solution", "result", "stack", "context", "quote"] as const;
export type FactCategory = (typeof FACT_CATEGORIES)[number];

/** A fact extracted from sources. Every fact cites at least one chunk id. */
export interface Fact {
  id: string;
  category: FactCategory;
  statement: string;
  sources: string[];
  /** Included in the case study (ticked in brief.md). */
  approved: boolean;
  /** Problems found by the automatic checks (shown in brief.md). */
  warnings: string[];
  /** For `quote` facts: who said it. */
  attribution?: string;
}

/** Special source id used for statements the human editor added to the brief. */
export const EDITOR_SOURCE = "editor";

export interface ClientConfig {
  name: string;
  aliases?: string[];
  /** Neutral description used in NDA mode, e.g. "a regional freight carrier". */
  industry: string;
}

export interface ProjectConfig {
  project: string;
  agency?: string;
  client: ClientConfig;
  /** Extra names to replace in NDA mode (people, product names, domains). */
  redact?: Record<string, string>;
  /** Local git repositories to read `git log` from (relative to the config file). */
  git?: string[];
  /** Free-form guidance for the writer (audience, tone, length). */
  audience?: string;
}

export interface Claim {
  text: string;
  sources: string[];
}

export interface Quote {
  text: string;
  attribution: string;
  sources: string[];
}

export interface CaseStudy {
  title: string;
  summary: Claim;
  challenge: Claim[];
  solution: Claim[];
  results: Claim[];
  stack: Claim[];
  quote?: Quote;
}

export const SECTION_KEYS = ["challenge", "solution", "results", "stack"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export type CheckStatus = "ok" | "recited" | "removed";

export interface ClaimCheck {
  section: SectionKey | "summary" | "quote" | "title";
  text: string;
  status: CheckStatus;
  numbers: string[];
  unsupported: string[];
  sourcesBefore: string[];
  sourcesAfter: string[];
  reason?: string;
}

export interface FactCheckReport {
  checked: number;
  ok: number;
  recited: number;
  removed: number;
  numbersChecked: number;
  claims: ClaimCheck[];
}
