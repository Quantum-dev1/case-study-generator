import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";
import type { RawDocument } from "../types.js";
import { parseMetricsCsv } from "./csv.js";
import { gitLogToDocuments, readGitRepo } from "./git.js";
import { parseDocument } from "./markdown.js";
import { looksLikeTranscript, parseTextTranscript, parseVtt } from "./transcript.js";

export { parseCsv, parseMetricsCsv } from "./csv.js";
export { GIT_LOG_FORMAT, gitLogToDocuments, parseGitLog, readGitRepo } from "./git.js";
export { parseDocument } from "./markdown.js";
export { formatTranscriptLine, looksLikeTranscript, parseTextTranscript, parseVtt } from "./transcript.js";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "out", "output"]);
/** Files the tool itself writes or reads as config; never treated as source material. */
const SKIP_FILES = new Set(["case-study.config.json", "cassette.json"]);

export interface CollectOptions {
  /** Local git repositories to read history from. */
  gitRepos?: string[];
}

/** Recursively collects supported materials from a folder, in a stable (sorted) order. */
export async function collect(root: string, options: CollectOptions = {}): Promise<RawDocument[]> {
  const absRoot = resolve(root);
  const files = (await walk(absRoot)).sort();
  const docs: RawDocument[] = [];
  for (const file of files) {
    const rel = relative(absRoot, file).split(sep).join("/");
    docs.push(...(await parseFile(rel, await readFile(file, "utf8"))));
  }
  for (const repo of options.gitRepos ?? []) {
    docs.push(...(await readGitRepo(resolve(repo), basename(resolve(repo)))));
  }
  return docs.filter((d) => d.lines.some((l) => l.text.trim() !== ""));
}

/** Picks a parser by extension (and content, for .txt). */
export async function parseFile(path: string, content: string): Promise<RawDocument[]> {
  const lower = path.toLowerCase();
  if (lower.endsWith(".vtt")) return [parseVtt(path, content)];
  if (lower.endsWith(".csv")) return [parseMetricsCsv(path, content)];
  if (lower.endsWith(".gitlog")) return gitLogToDocuments(path, content);
  if (lower.endsWith(".txt")) {
    return [looksLikeTranscript(content) ? parseTextTranscript(path, content) : parseDocument(path, content)];
  }
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return [parseDocument(path, content)];
  return [];
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...(await walk(full)));
    } else if (entry.isFile() && !SKIP_FILES.has(entry.name) && (await stat(full)).size > 0) {
      out.push(full);
    }
  }
  return out;
}
