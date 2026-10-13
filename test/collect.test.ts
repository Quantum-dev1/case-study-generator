import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { chunkDocuments, describeChunk } from "../src/chunk.js";
import { collect, parseCsv, parseFile, parseGitLog, parseMetricsCsv, parseTextTranscript, parseVtt, readGitRepo } from "../src/collect/index.js";
import { tempDir } from "./helpers.js";

const VTT = `WEBVTT

1
00:00:04.000 --> 00:00:09.000
<v Dana Whitfield>We plan routes in spreadsheets

2
00:00:09.500 --> 00:00:12.000
<v Dana Whitfield>every single morning.

3
00:01:05.250 --> 00:01:09.000
Marco: Calls all day.
`;

describe("transcripts", () => {
  it("parses WebVTT cues with speakers and start times, merging continued sentences", () => {
    const doc = parseVtt("call.vtt", VTT);
    expect(doc.kind).toBe("transcript");
    expect(doc.lines).toEqual([
      { line: 5, text: "We plan routes in spreadsheets every single morning.", timestamp: "00:00:04", speaker: "Dana Whitfield" },
      { line: 13, text: "Calls all day.", timestamp: "00:01:05", speaker: "Marco" },
    ]);
  });

  it("parses plain-text transcripts with optional timestamps", () => {
    const doc = parseTextTranscript("call.txt", "[00:00:05] Priya: Hi\n\nMarco Reyes: Hello there\n");
    expect(doc.lines).toEqual([
      { line: 1, text: "Hi", timestamp: "00:00:05", speaker: "Priya" },
      { line: 3, text: "Hello there", speaker: "Marco Reyes" },
    ]);
  });

  it("detects whether a .txt file is a transcript or a note", async () => {
    expect((await parseFile("a.txt", "Dana: one\nMarco: two\n"))[0]!.kind).toBe("transcript");
    expect((await parseFile("b.txt", "Plain note.\nAnother line.\n"))[0]!.kind).toBe("doc");
  });
});

describe("csv metrics", () => {
  it("handles quoted fields, escaped quotes and embedded newlines", () => {
    const rows = parseCsv('a,b\n"x, y","say ""hi"""\n"multi\nline",2\n');
    expect(rows).toEqual([
      { line: 1, cells: ["a", "b"] },
      { line: 2, cells: ["x, y", 'say "hi"'] },
      { line: 3, cells: ["multi\nline", "2"] },
    ]);
  });

  it("turns each row into a self-describing line with its file line number", () => {
    const doc = parseMetricsCsv("kpis.csv", "metric,before,after\nPlanning time,150,25\n");
    expect(doc.lines).toEqual([{ line: 2, text: "metric: Planning time; before: 150; after: 25" }]);
  });
});

describe("git", () => {
  it("parses an exported log and adds a deterministic summary document", async () => {
    const log = "abc1234|2025-05-02|Ann|feat: b\nnot a commit\ndef5678|2025-04-01|Bo|fix: a | pipe\n";
    expect(parseGitLog(log)[1]).toEqual({ line: 3, hash: "def5678", date: "2025-04-01", author: "Bo", subject: "fix: a | pipe" });
    const docs = await parseFile("repo.gitlog", log);
    expect(docs[0]!.lines[0]!.text).toBe("Repository history: 2 commits between 2025-04-01 and 2025-05-02 by 2 contributors.");
  });

  it("reads history from a real local repository", async () => {
    const dir = await tempDir();
    const git = (...args: string[]) =>
      execFileSync("git", ["-C", dir, "-c", "user.name=Test", "-c", "user.email=test@example.com", ...args], { stdio: "pipe" });
    git("init", "-q");
    await writeFile(join(dir, "a.txt"), "1");
    git("add", ".");
    git("commit", "-q", "-m", "feat: first commit");
    const docs = await readGitRepo(dir, "demo");
    expect(docs[0]!.path).toBe("git:demo (summary)");
    expect(docs[1]!.lines[0]!.text).toMatch(/^\d{4}-\d{2}-\d{2} [0-9a-f]+ feat: first commit$/);
  });
});

describe("collect + chunk", () => {
  it("walks a folder in stable order, skips config and hidden files, and assigns stable ids", async () => {
    const dir = await tempDir();
    await mkdir(join(dir, "notes"));
    await writeFile(join(dir, "case-study.config.json"), "{}");
    await writeFile(join(dir, ".secret.md"), "hidden");
    await writeFile(join(dir, "notes", "b.md"), "# Title\nIntro line\n\n## Section\nBody with 42 items\n");
    await writeFile(join(dir, "a.csv"), "metric,value\nUsers,10\n");
    await writeFile(join(dir, "image.png"), "binary");
    const docs = await collect(dir);
    expect(docs.map((d) => d.path)).toEqual(["a.csv", "notes/b.md"]);
    const chunks = chunkDocuments(docs);
    expect(chunks.map((c) => [c.id, describeChunk(c)])).toEqual([
      ["S1", "a.csv, line 2"],
      ["S2", "notes/b.md, lines 1–2"],
      ["S3", "notes/b.md, lines 4–5"],
    ]);
    expect(chunkDocuments(await collect(dir)).map((c) => c.text)).toEqual(chunks.map((c) => c.text));
  });

  it("splits long documents by size and keeps transcript time ranges", () => {
    const long = { path: "x.md", kind: "doc" as const, lines: Array.from({ length: 50 }, (_, i) => ({ line: i + 1, text: "word ".repeat(10) })) };
    const chunks = chunkDocuments([long], { maxChars: 200 });
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.every((c) => c.text.length <= 260)).toBe(true);
    const t = chunkDocuments([parseVtt("c.vtt", VTT)]);
    expect(t[0]!.timeRange).toBe("00:00:04–00:01:05");
    expect(t[0]!.text).toContain("[00:00:04] Dana Whitfield: We plan routes");
  });
});
