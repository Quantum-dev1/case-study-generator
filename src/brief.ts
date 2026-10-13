import { describeChunk } from "./chunk.js";
import { EDITOR_SOURCE, type Chunk, type Fact, type FactCategory, type ProjectConfig } from "./types.js";

const SECTIONS: { category: FactCategory; heading: string }[] = [
  { category: "challenge", heading: "Challenge" },
  { category: "solution", heading: "Solution" },
  { category: "result", heading: "Results" },
  { category: "stack", heading: "Stack" },
  { category: "context", heading: "Context" },
  { category: "quote", heading: "Quotes" },
];
const NOTES_HEADING = "Notes for the writer";
const SOURCES_HEADING = "Sources";

export interface Brief {
  approved: boolean;
  project?: string;
  facts: Fact[];
  notes: string;
  /** Lines that looked like facts but could not be parsed. */
  problems: string[];
}

/** Renders the human review step: every fact as a checkbox with its sources and warnings. */
export function renderBrief(facts: Fact[], chunks: Chunk[], config: ProjectConfig): string {
  const out: string[] = [
    "---",
    `project: ${config.project}`,
    `client: ${config.client.name}`,
    "approved: false",
    "---",
    "",
    `# Case study brief: ${config.project}`,
    "",
    "> **Review before writing.** Every fact below was extracted from your materials and cites its sources.",
    "> - Untick `[ ]` anything that must not appear in the case study; tick `[x]` to include.",
    "> - Edit wording freely. Keep the `(S1, S2)` source list at the end of the line.",
    "> - Add your own statements as `- [x] Your statement (editor)`; they are cited as editor notes.",
    "> - Facts with a WARNING were unticked automatically: their numbers or quotes were not found in the cited sources.",
    "> - When done, set `approved: true` above (or pass `--approve`) and run `case-study write <this folder>`.",
    "",
  ];
  for (const { category, heading } of SECTIONS) {
    const items = facts.filter((f) => f.category === category);
    out.push(`## ${heading}`, "");
    if (items.length === 0) out.push("_No facts extracted._");
    for (const f of items) out.push(renderFactLine(f));
    out.push("");
  }
  out.push(`## ${NOTES_HEADING}`, "", "<!-- Optional guidance for the writer: audience, angle, what to emphasise. -->", "");
  if (config.audience) out.push(config.audience, "");
  out.push(`## ${SOURCES_HEADING}`, "", "| ID | Location | Excerpt |", "| --- | --- | --- |");
  for (const c of chunks) out.push(`| ${c.id} | ${escapeCell(describeChunk(c))} | ${escapeCell(excerpt(c.text, 90))} |`);
  out.push("");
  return out.join("\n");
}

function renderFactLine(f: Fact): string {
  const box = f.approved ? "[x]" : "[ ]";
  const body = f.category === "quote" ? `"${f.statement}" — ${f.attribution ?? "unknown speaker"}` : f.statement;
  const warn = f.warnings.length ? ` <!-- WARNING: ${f.warnings.join("; ")} -->` : "";
  return `- ${box} ${f.id}: ${body} (${f.sources.join(", ")})${warn}`;
}

const FACT_LINE = /^\s*[-*]\s+\[( |x|X)\]\s+(?:(F\d+):\s*)?(.+?)\s*(?:<!--(.*?)-->)?\s*$/;
const SOURCE_TAIL = /\(\s*((?:S\d+|editor)(?:\s*,\s*(?:S\d+|editor))*)\s*\)$/i;
const QUOTE_BODY = /^["“](.+)["”]\s*[—–-]\s*(.+)$/;

/** Parses an (edited) brief back into facts. Human edits win over the original extraction. */
export function parseBrief(text: string): Brief {
  const brief: Brief = { approved: false, facts: [], notes: "", problems: [] };
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let i = 0;
  if (lines[0]?.trim() === "---") {
    for (i = 1; i < lines.length && lines[i]!.trim() !== "---"; i++) {
      const m = /^(\w+):\s*(.*)$/.exec(lines[i]!.trim());
      if (!m) continue;
      if (m[1] === "approved") brief.approved = /^(true|yes)$/i.test(m[2]!.trim());
      if (m[1] === "project") brief.project = m[2]!.trim();
    }
    i++;
  }
  let section: FactCategory | "notes" | "other" = "other";
  const notes: string[] = [];
  let nextId = 1;
  const usedIds = new Set<string>();
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      const name = heading[1]!.toLowerCase();
      const match = SECTIONS.find((s) => s.heading.toLowerCase() === name);
      section = match ? match.category : name === NOTES_HEADING.toLowerCase() ? "notes" : "other";
      continue;
    }
    if (section === "notes") {
      notes.push(line);
      continue;
    }
    if (section === "other") continue;
    const m = FACT_LINE.exec(line);
    if (!m) {
      if (/^\s*[-*]\s+\[/.test(line)) brief.problems.push(`Could not parse: ${line.trim()}`);
      continue;
    }
    let body = m[3]!.trim();
    let sources = [EDITOR_SOURCE];
    const tail = SOURCE_TAIL.exec(body);
    if (tail) {
      sources = [...new Set(tail[1]!.split(",").map((s) => normalizeSourceId(s.trim())))];
      body = body.slice(0, tail.index).trim();
    } else {
      brief.problems.push(`No sources on "${excerpt(body, 60)}" — treated as an editor statement.`);
    }
    let id = m[2] && !usedIds.has(m[2]) ? m[2] : "";
    if (!id) {
      while (usedIds.has(`F${nextId}`) || lines.some((l) => l.includes(`F${nextId}:`))) nextId++;
      id = `F${nextId}`;
    }
    usedIds.add(id);
    const fact: Fact = { id, category: section, statement: body, sources, approved: m[1]!.toLowerCase() === "x", warnings: [] };
    if (section === "quote") {
      const q = QUOTE_BODY.exec(body);
      if (q) {
        fact.statement = q[1]!.trim();
        fact.attribution = q[2]!.trim();
      }
    }
    if (m[4]) fact.warnings.push(m[4].replace(/^\s*WARNING:\s*/, "").trim());
    brief.facts.push(fact);
  }
  brief.notes = notes
    .join("\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  return brief;
}

function normalizeSourceId(s: string): string {
  return /^editor$/i.test(s) ? EDITOR_SOURCE : s.toUpperCase();
}

export function excerpt(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, "\\|");
}
