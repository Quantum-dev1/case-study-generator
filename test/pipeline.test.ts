import { cp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { main } from "../src/cli.js";
import { buildBrief, NotApprovedError, writeCaseStudy } from "../src/pipeline.js";
import { CONFIG, MockLLM, tempDir } from "./helpers.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const EXAMPLE = join(ROOT, "examples", "bluefin-dispatch");

async function materials(): Promise<string> {
  const dir = await tempDir();
  await writeFile(join(dir, "notes.md"), "# Kickoff\nAcme Logistics planned routes by hand; it took 150 minutes a day.\n");
  await writeFile(join(dir, "kpis.csv"), "metric,before,after\nPlanning minutes,150,25\n");
  await writeFile(join(dir, "call.txt"), "[00:00:05] Jane Doe: Acme finally has quiet mornings.\n[00:00:09] Sam: Great.\n");
  return dir;
}

const extractAnswer = {
  facts: [
    { category: "challenge", statement: "Acme Logistics planned routes by hand, taking 150 minutes a day.", sources: ["S3"] },
    { category: "result", statement: "Planning dropped from 150 to 25 minutes.", sources: ["S2"] },
    { category: "quote", statement: "Acme finally has quiet mornings.", attribution: "Jane Doe", sources: ["S1"] },
  ],
};
const writeAnswer = {
  title: "Acme Logistics plans routes in 25 minutes",
  summary: { text: "Acme Logistics replaced manual routing.", facts: ["F1"] },
  challenge: [{ text: "Acme Logistics planned routes by hand for 150 minutes a day.", facts: ["F1"] }],
  solution: [{ text: "A routing console.", facts: ["F99"] }],
  results: [
    { text: "Planning dropped from 150 to 25 minutes.", facts: ["F2"] },
    { text: "Planning is 83% faster.", facts: ["F2"] },
  ],
  stack: [],
  quote: "F3",
};

describe("pipeline (mocked LLM)", () => {
  it("brief → review gate → write → fact-check → NDA output", async () => {
    const dir = await materials();
    const out = join(dir, "out");
    const llm = new MockLLM({ "extract:": extractAnswer, "write:case-study": writeAnswer });

    const brief = await buildBrief({ materialsDir: dir, outDir: out, config: CONFIG, llm });
    expect(brief.chunks.map((c) => c.path)).toEqual(["call.txt", "kpis.csv", "notes.md"]);
    expect(brief.facts.every((f) => f.approved)).toBe(true);
    expect(brief.facts.map((f) => f.id)).toEqual(["F1", "F2", "F3"]);

    await expect(writeCaseStudy({ outDir: out, llm })).rejects.toBeInstanceOf(NotApprovedError);

    const briefPath = join(out, "brief.md");
    const edited = (await readFile(briefPath, "utf8"))
      .replace("approved: false", "approved: true")
      .replace("## Notes for the writer\n", "## Notes for the writer\n\nKeep it short.\n");
    await writeFile(briefPath, edited);

    const res = await writeCaseStudy({ outDir: out, llm });
    expect(llm.requests.at(-1)!.messages[1]!.content).toContain("Editor guidance:\nKeep it short.");
    expect(res.notices).toEqual(["Writer cited unknown or unapproved facts: F99 (citations dropped)."]);
    expect(res.report).toMatchObject({ removed: 2 }); // uncited solution + derived "83%"
    const md = await readFile(join(out, "case-study.md"), "utf8");
    expect(md).toContain("# Acme Logistics plans routes in 25 minutes");
    expect(md).not.toContain("83%");
    expect(md).toContain("> “Acme finally has quiet mornings.”");

    const nda = await writeCaseStudy({ outDir: out, llm, nda: true });
    const ndaFiles = await Promise.all(nda.files.map((f) => readFile(f, "utf8")));
    for (const text of ndaFiles) {
      expect(text).not.toMatch(/acme/i);
      expect(text).not.toContain("Jane Doe");
    }
    expect(ndaFiles[0]).toContain("# A mid-size logistics company plans routes in 25 minutes");
  });
});

describe("example (recorded responses, offline)", () => {
  it("regenerates exactly the committed example outputs", async () => {
    const out = join(await tempDir(), "output");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const cassette = join(EXAMPLE, "cassette.json");
    expect(await main(["brief", join(EXAMPLE, "materials"), "-o", out, "--replay", cassette])).toBe(0);
    expect(await main(["write", out, "--approve", "--replay", cassette])).toBe(0);
    expect(await main(["write", out, "--approve", "--nda", "--replay", cassette])).toBe(0);
    log.mockRestore();
    const files = [
      "brief.md",
      "facts.json",
      "case-study.md",
      "case-study.html",
      "case-study.json",
      "fact-check.md",
      "case-study.nda.md",
      "case-study.nda.html",
      "fact-check.nda.md",
    ];
    for (const f of files) {
      expect(await readFile(join(out, f), "utf8"), f).toBe(await readFile(join(EXAMPLE, "output", f), "utf8"));
    }
  });
});

describe("cli", () => {
  it("prints help and rejects unknown commands", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await main(["--help"])).toBe(0);
    expect(log.mock.calls[0]![0]).toContain("case-study brief <materials-dir>");
    expect(await main(["publish", "x"])).toBe(1);
    expect(err.mock.calls[0]![0]).toContain('Unknown command "publish"');
    log.mockRestore();
    err.mockRestore();
  });

  it("refuses to write an unapproved brief", async () => {
    const out = join(await tempDir(), "output");
    await cp(join(EXAMPLE, "output"), out, { recursive: true });
    await expect(main(["write", out, "--replay", join(EXAMPLE, "cassette.json")])).rejects.toThrow(/not approved yet/);
  });
});
