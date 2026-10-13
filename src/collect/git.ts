import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { RawDocument, SourceLine } from "../types.js";
import { splitLines } from "./markdown.js";

const run = promisify(execFile);

/** `git log` format understood by this tool. Export a log file with the same format to use it offline. */
export const GIT_LOG_FORMAT = "%h|%ad|%an|%s";

export interface Commit {
  line: number;
  hash: string;
  date: string;
  author: string;
  subject: string;
}

export function parseGitLog(content: string): Commit[] {
  const commits: Commit[] = [];
  splitLines(content).forEach((raw, idx) => {
    const parts = raw.split("|");
    if (parts.length < 4) return;
    const [hash, date, author, ...subject] = parts;
    if (!/^[0-9a-f]{4,40}$/i.test(hash!.trim())) return;
    commits.push({ line: idx + 1, hash: hash!.trim(), date: date!.trim(), author: author!.trim(), subject: subject.join("|").trim() });
  });
  return commits;
}

/**
 * Turns a git log into two documents: the commit list itself and a deterministic summary
 * (commit count, date range, contributor count) so these numbers are citeable facts.
 */
export function gitLogToDocuments(path: string, content: string): RawDocument[] {
  const commits = parseGitLog(content);
  if (commits.length === 0) return [];
  const dates = commits.map((c) => c.date).sort();
  const authors = new Set(commits.map((c) => c.author));
  const summary = `Repository history: ${commits.length} commits between ${dates[0]} and ${dates[dates.length - 1]} by ${authors.size} contributors.`;
  const lines: SourceLine[] = commits.map((c) => ({ line: c.line, text: `${c.date} ${c.hash} ${c.subject}` }));
  return [
    { path: `${path} (summary)`, kind: "git", lines: [{ line: 1, text: summary }] },
    { path, kind: "git", lines },
  ];
}

/** Reads `git log` from a local repository (no network, read-only). */
export async function readGitRepo(repoPath: string, label: string, maxCount = 1000): Promise<RawDocument[]> {
  const { stdout } = await run(
    "git",
    ["-C", repoPath, "log", "--no-merges", "--date=short", `--max-count=${maxCount}`, `--pretty=format:${GIT_LOG_FORMAT}`],
    { maxBuffer: 32 * 1024 * 1024 },
  );
  return gitLogToDocuments(`git:${label}`, stdout);
}
