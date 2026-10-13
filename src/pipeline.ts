import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseBrief, renderBrief, type Brief } from "./brief.js";
import { chunkDocuments } from "./chunk.js";
import { collect } from "./collect/index.js";
import { checkFact, extractFacts } from "./extract.js";
import { factCheck, renderFactCheckReport } from "./factcheck.js";
import type { LLM } from "./llm/types.js";
import { createRedactor, redactCaseStudy, redactChunks } from "./redact.js";
import { renderHtml, renderMarkdown } from "./render.js";
import type { CaseStudy, Chunk, Fact, FactCheckReport, ProjectConfig } from "./types.js";
import { writeDraft } from "./write.js";

export const SOURCES_FILE = "sources.json";
export const FACTS_FILE = "facts.json";
export const BRIEF_FILE = "brief.md";

interface SourcesFile {
  version: 1;
  config: ProjectConfig;
  chunks: Chunk[];
}

export interface BriefOptions {
  materialsDir: string;
  outDir: string;
  config: ProjectConfig;
  llm: LLM;
  concurrency?: number;
  maxChunkChars?: number;
  maxBatchChars?: number;
}

export interface BriefResult {
  documents: number;
  chunks: Chunk[];
  facts: Fact[];
  dropped: { statement: string; reason: string }[];
  briefPath: string;
}

/** Steps 1–4: collect → chunk → extract facts → write `brief.md` for human review. */
export async function buildBrief(options: BriefOptions): Promise<BriefResult> {
  const docs = await collect(options.materialsDir, { gitRepos: options.config.git ?? [] });
  if (docs.length === 0) throw new Error(`No supported materials found in ${resolve(options.materialsDir)} (.md, .txt, .vtt, .csv, .gitlog).`);
  const chunks = chunkDocuments(docs, { maxChars: options.maxChunkChars ?? 1200 });
  const extractOpts: { concurrency?: number; maxBatchChars?: number } = {};
  if (options.concurrency !== undefined) extractOpts.concurrency = options.concurrency;
  if (options.maxBatchChars !== undefined) extractOpts.maxBatchChars = options.maxBatchChars;
  const { facts, dropped } = await extractFacts(chunks, options.config, options.llm, extractOpts);

  await mkdir(options.outDir, { recursive: true });
  const sources: SourcesFile = { version: 1, config: options.config, chunks };
  await writeJson(join(options.outDir, SOURCES_FILE), sources);
  await writeJson(join(options.outDir, FACTS_FILE), { facts, dropped });
  const briefPath = join(options.outDir, BRIEF_FILE);
  await writeFile(briefPath, renderBrief(facts, chunks, options.config), "utf8");
  return { documents: docs.length, chunks, facts, dropped, briefPath };
}

export interface WriteOptions {
  outDir: string;
  llm: LLM;
  /** Treat the brief as approved even if `approved: false`. */
  approve?: boolean;
  /** NDA mode: redact client names; writes `*.nda.*` files. */
  nda?: boolean;
}

export interface WriteResult {
  study: CaseStudy;
  report: FactCheckReport;
  files: string[];
  /** Messages for the user: brief parse problems, re-check warnings on approved facts, invalid citations. */
  notices: string[];
}

export class NotApprovedError extends Error {
  override name = "NotApprovedError";
}

/** Steps 5–7: read the approved brief → write the case study → fact-check → render (optionally redacted). */
export async function writeCaseStudy(options: WriteOptions): Promise<WriteResult> {
  const sources = JSON.parse(await readFile(join(options.outDir, SOURCES_FILE), "utf8")) as SourcesFile;
  const brief: Brief = parseBrief(await readFile(join(options.outDir, BRIEF_FILE), "utf8"));
  if (!brief.approved && !options.approve) {
    throw new NotApprovedError(
      `${join(options.outDir, BRIEF_FILE)} is not approved yet. Review it, set "approved: true" in its header (or pass --approve), then run write again.`,
    );
  }
  const { config, chunks } = sources;
  const notices = [...brief.problems];
  const byId = new Map(chunks.map((c) => [c.id, c]));
  const approved = brief.facts.filter((f) => f.approved);
  if (approved.length === 0) throw new Error("The brief has no ticked facts; nothing to write.");

  for (const f of approved) {
    const unknown = f.sources.filter((s) => s !== "editor" && !byId.has(s));
    if (unknown.length) notices.push(`${f.id} cites unknown source ${unknown.join(", ")}.`);
    const probe: Fact = { ...f, warnings: [] };
    checkFact(probe, byId);
    if (probe.warnings.length) notices.push(`${f.id} is ticked but ${probe.warnings.join("; ")} (kept: editor decision).`);
  }

  const draft = await writeDraft(approved, config, brief.notes, options.llm);
  if (draft.invalidFactIds.length) notices.push(`Writer cited unknown or unapproved facts: ${draft.invalidFactIds.join(", ")} (citations dropped).`);
  const { study: checked, report } = factCheck(draft.study, chunks, approved, config.project);

  let study = checked;
  let footChunks = chunks;
  let clientLabel = `Client: ${config.client.name}`;
  if (options.nda) {
    const redactor = createRedactor(config);
    study = redactCaseStudy(checked, redactor);
    footChunks = redactChunks(chunks, redactor);
    clientLabel = `Client: ${config.client.industry} (name withheld under NDA)`;
    for (const claim of report.claims) claim.text = redactor.text(claim.text);
  }

  const renderOpts = { project: config.project, clientLabel, ...(config.agency ? { agency: config.agency } : {}) };
  const markdown = renderMarkdown(study, footChunks, renderOpts);
  const html = renderHtml(study, footChunks, renderOpts);
  const reportMd = renderFactCheckReport(report);

  if (options.nda) {
    const redactor = createRedactor(config);
    const leaked = [...new Set([markdown, html, reportMd, JSON.stringify(study)].flatMap((t) => redactor.leaks(t)))];
    if (leaked.length) throw new Error(`NDA check failed: ${leaked.join(", ")} still present in the output. Nothing was written.`);
  }

  const suffix = options.nda ? ".nda" : "";
  const files = {
    md: join(options.outDir, `case-study${suffix}.md`),
    html: join(options.outDir, `case-study${suffix}.html`),
    json: join(options.outDir, `case-study${suffix}.json`),
    report: join(options.outDir, `fact-check${suffix}.md`),
    reportJson: join(options.outDir, `fact-check${suffix}.json`),
  };
  await writeFile(files.md, markdown, "utf8");
  await writeFile(files.html, html, "utf8");
  await writeJson(files.json, study);
  await writeFile(files.report, reportMd, "utf8");
  await writeJson(files.reportJson, report);
  return { study, report, files: Object.values(files), notices };
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}
