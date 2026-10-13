import { NumberIndex, extractNumbers, normalizeForQuote, type NumberToken } from "./numbers.js";
import {
  EDITOR_SOURCE,
  SECTION_KEYS,
  type CaseStudy,
  type Chunk,
  type Claim,
  type ClaimCheck,
  type Fact,
  type FactCheckReport,
} from "./types.js";

export interface FactCheckResult {
  study: CaseStudy;
  report: FactCheckReport;
}

/**
 * Verifies the draft against the source materials:
 * - a claim without a valid citation is removed;
 * - every number must appear in the cited sources; if it appears only in other sources,
 *   those sources are added to the citation ("recited"); if it appears nowhere, the claim is removed;
 * - the featured quote must be verbatim in its cited source;
 * - numbers in the title must be supported, otherwise the title falls back to the project name.
 * Statements the editor added to the brief count as a source (`editor`).
 */
export function factCheck(draft: CaseStudy, chunks: Chunk[], approvedFacts: Fact[], fallbackTitle: string): FactCheckResult {
  const texts = new Map<string, string>(chunks.map((c) => [c.id, c.text]));
  const editorText = approvedFacts
    .filter((f) => f.sources.includes(EDITOR_SOURCE))
    .map((f) => f.statement)
    .join("\n");
  if (editorText) texts.set(EDITOR_SOURCE, editorText);
  const perSource = new Map([...texts].map(([id, t]) => [id, new NumberIndex([t])]));
  const all = new NumberIndex(texts.values());

  const checks: ClaimCheck[] = [];
  let numbersChecked = 0;

  const checkClaim = (claim: Claim, section: ClaimCheck["section"]): Claim | null => {
    const numbers = extractNumbers(claim.text);
    numbersChecked += numbers.length;
    const valid = claim.sources.filter((s) => texts.has(s));
    const base: ClaimCheck = {
      section,
      text: claim.text,
      status: "ok",
      numbers: numbers.map((n) => n.raw),
      unsupported: [],
      sourcesBefore: [...claim.sources],
      sourcesAfter: valid,
    };
    if (valid.length === 0) {
      checks.push({ ...base, status: "removed", sourcesAfter: [], reason: "no valid citation" });
      return null;
    }
    const supportedByCited = (n: NumberToken) => valid.some((s) => perSource.get(s)!.has(n));
    const notInCited = numbers.filter((n) => !supportedByCited(n));
    const nowhere = notInCited.filter((n) => !all.has(n));
    if (nowhere.length) {
      checks.push({
        ...base,
        status: "removed",
        unsupported: nowhere.map((n) => n.raw),
        sourcesAfter: [],
        reason: `number${nowhere.length > 1 ? "s" : ""} ${nowhere.map((n) => `"${n.raw}"`).join(", ")} not found in any source`,
      });
      return null;
    }
    if (notInCited.length) {
      const extra = new Set<string>();
      for (const n of notInCited) {
        const holder = [...perSource].find(([, idx]) => idx.has(n));
        if (holder) extra.add(holder[0]);
      }
      const sourcesAfter = [...new Set([...valid, ...extra])];
      checks.push({
        ...base,
        status: "recited",
        sourcesAfter,
        reason: `${notInCited.map((n) => `"${n.raw}"`).join(", ")} found in ${[...extra].join(", ")}, citation added`,
      });
      return { text: claim.text, sources: sourcesAfter };
    }
    checks.push(base);
    return { text: claim.text, sources: valid };
  };

  const study: CaseStudy = { title: draft.title, summary: { text: "", sources: [] }, challenge: [], solution: [], results: [], stack: [] };

  const titleNumbers = extractNumbers(draft.title);
  numbersChecked += titleNumbers.length;
  const badTitle = titleNumbers.filter((n) => !all.has(n));
  if (badTitle.length) {
    study.title = fallbackTitle;
    checks.push({
      section: "title",
      text: draft.title,
      status: "removed",
      numbers: titleNumbers.map((n) => n.raw),
      unsupported: badTitle.map((n) => n.raw),
      sourcesBefore: [],
      sourcesAfter: [],
      reason: `title replaced: ${badTitle.map((n) => `"${n.raw}"`).join(", ")} not found in any source`,
    });
  }

  if (draft.summary.text) study.summary = checkClaim(draft.summary, "summary") ?? { text: "", sources: [] };
  for (const key of SECTION_KEYS) {
    study[key] = draft[key].map((c) => checkClaim(c, key)).filter((c): c is Claim => c !== null);
  }

  if (draft.quote) {
    const q = draft.quote;
    const cited = q.sources.filter((s) => texts.has(s) && s !== EDITOR_SOURCE);
    const needle = normalizeForQuote(q.text);
    const verbatim = cited.some((s) => normalizeForQuote(texts.get(s)!).includes(needle));
    const check: ClaimCheck = {
      section: "quote",
      text: q.text,
      status: verbatim ? "ok" : "removed",
      numbers: [],
      unsupported: [],
      sourcesBefore: [...q.sources],
      sourcesAfter: verbatim ? cited : [],
    };
    if (!verbatim) check.reason = "quote is not verbatim in its cited source";
    checks.push(check);
    if (verbatim) study.quote = { ...q, sources: cited };
  }

  const count = (s: ClaimCheck["status"]) => checks.filter((c) => c.status === s).length;
  return {
    study,
    report: { checked: checks.length, ok: count("ok"), recited: count("recited"), removed: count("removed"), numbersChecked, claims: checks },
  };
}

/** Markdown version of the fact-check report. */
export function renderFactCheckReport(report: FactCheckReport): string {
  const lines = [
    "# Fact-check report",
    "",
    `- Statements checked: **${report.checked}**`,
    `- Numbers checked: **${report.numbersChecked}**`,
    `- Passed: **${report.ok}**`,
    `- Citation corrected: **${report.recited}**`,
    `- Removed: **${report.removed}**`,
    "",
  ];
  const flagged = report.claims.filter((c) => c.status !== "ok");
  if (flagged.length) {
    lines.push("## Flagged statements", "");
    for (const c of flagged) {
      lines.push(`- **${c.status.toUpperCase()}** (${c.section}): ${c.text}`, `  - ${c.reason ?? ""}`);
    }
    lines.push("");
  }
  lines.push("## All statements", "", "| Section | Status | Numbers | Sources | Statement |", "| --- | --- | --- | --- | --- |");
  for (const c of report.claims) {
    const nums = c.numbers.length ? c.numbers.join(", ") : "—";
    const src = c.sourcesAfter.length ? c.sourcesAfter.join(", ") : "—";
    lines.push(`| ${c.section} | ${c.status} | ${nums} | ${src} | ${c.text.replace(/\|/g, "\\|")} |`);
  }
  lines.push("");
  return lines.join("\n");
}
