import { describe, expect, it } from "vitest";
import { parseBrief, renderBrief } from "../src/brief.js";
import { batchChunks, batchTag, extractFacts, validateFacts } from "../src/extract.js";
import { CONFIG, MockLLM, chunk } from "./helpers.js";

const chunks = [
  chunk("S1", "Dispatch took 150 minutes every morning in spreadsheets."),
  chunk("S2", "After launch, planning takes 25 minutes. On-time rate reached 94%."),
  chunk("S3", "[00:00:10] Dana: For the first time in years, the phones are quiet.", { kind: "transcript", path: "call.vtt" }),
];

describe("validateFacts", () => {
  it("drops facts without valid sources and keeps the rest", () => {
    const { facts, dropped } = validateFacts(
      [
        { category: "challenge", statement: "Dispatch took 150 minutes.", sources: ["S1"] },
        { category: "result", statement: "Delivered on budget.", sources: ["S99"] },
        { category: "result", statement: "No citation." },
        { category: "result", statement: "  ", sources: ["S1"] },
      ],
      chunks,
    );
    expect(facts.map((f) => f.statement)).toEqual(["Dispatch took 150 minutes."]);
    expect(dropped.map((d) => d.reason)).toEqual(["unknown source ids: S99", "no source cited", "empty statement"]);
  });

  it("unticks facts whose numbers are not in the cited chunks", () => {
    const { facts } = validateFacts(
      [
        { category: "result", statement: "Planning is 83% faster.", sources: ["S2"] },
        { category: "result", statement: "Planning takes 25 minutes.", sources: ["S2"] },
      ],
      chunks,
    );
    expect(facts[0]).toMatchObject({ approved: false, warnings: ['number "83%" not found in cited sources'] });
    expect(facts[1]).toMatchObject({ approved: true, warnings: [] });
  });

  it("number support is per cited chunk, not the whole corpus", () => {
    const { facts } = validateFacts([{ category: "result", statement: "Planning took 150 minutes.", sources: ["S2"] }], chunks);
    expect(facts[0]!.approved).toBe(false);
  });

  it("flags paraphrased quotes and accepts verbatim ones", () => {
    const { facts } = validateFacts(
      [
        { category: "quote", statement: "For the first time in years, the phones are quiet.", attribution: "Dana", sources: ["S3"] },
        { category: "quote", statement: "The phones finally stopped ringing.", attribution: "Dana", sources: ["S3"] },
      ],
      chunks,
    );
    expect(facts.map((f) => f.approved)).toEqual([true, false]);
    expect(facts[1]!.warnings).toEqual(["quote is not verbatim in the cited source"]);
  });

  it("merges duplicates, normalizes unknown categories and orders by section", () => {
    const { facts } = validateFacts(
      [
        { category: "result", statement: "On-time rate reached 94%.", sources: ["S2"] },
        { category: "weird", statement: "Spreadsheets were used.", sources: ["S1"] },
        { category: "challenge", statement: "Dispatch took 150 minutes.", sources: ["S1"] },
        { category: "result", statement: "On-time rate reached 94%!", sources: ["S2", "S1"] },
      ],
      chunks,
    );
    expect(facts.map((f) => [f.id, f.category, f.sources])).toEqual([
      ["F1", "challenge", ["S1"]],
      ["F2", "result", ["S2", "S1"]],
      ["F3", "context", ["S1"]],
    ]);
  });
});

describe("extractFacts", () => {
  it("batches chunks into tagged requests and parses fenced JSON replies", async () => {
    const llm = new MockLLM({
      "extract:": (req) =>
        "```json\n" +
        JSON.stringify({
          facts: req.tag === "extract:S1-S2" ? [{ category: "challenge", statement: "Dispatch took 150 minutes.", sources: ["S1"] }] : [],
        }) +
        "\n```",
    });
    const batches = batchChunks(chunks, 130);
    expect(batches.map(batchTag)).toEqual(["extract:S1-S2", "extract:S3"]);
    const { facts } = await extractFacts(chunks, CONFIG, llm, { maxBatchChars: 130 });
    expect(llm.requests.map((r) => r.tag).sort()).toEqual(["extract:S1-S2", "extract:S3"]);
    expect(llm.requests[0]!.json).toBe(true);
    expect(llm.requests[0]!.messages[1]!.content).toContain("<<S1 | s1.md, line 1>>");
    expect(facts).toHaveLength(1);
  });
});

describe("brief", () => {
  const { facts } = validateFacts(
    [
      { category: "challenge", statement: "Dispatch took 150 minutes.", sources: ["S1"] },
      { category: "result", statement: "Planning is 83% faster.", sources: ["S2"] },
      { category: "result", statement: "Planning takes 25 minutes.", sources: ["S2"] },
      { category: "quote", statement: "For the first time in years, the phones are quiet.", attribution: "Dana", sources: ["S3"] },
    ],
    chunks,
  );
  const text = renderBrief(facts, chunks, CONFIG);

  it("renders checkboxes, warnings and a source table", () => {
    expect(text).toContain("approved: false");
    expect(text).toContain("- [x] F1: Dispatch took 150 minutes. (S1)");
    expect(text).toContain('- [ ] F2: Planning is 83% faster. (S2) <!-- WARNING: number "83%" not found in cited sources -->');
    expect(text).toContain('- [x] F4: "For the first time in years, the phones are quiet." — Dana (S3)');
    expect(text).toContain("| S3 | call.vtt, line 1 |");
  });

  it("round-trips without changes", () => {
    const parsed = parseBrief(text);
    expect(parsed.approved).toBe(false);
    expect(parsed.facts.map((f) => [f.id, f.category, f.statement, f.sources, f.approved])).toEqual(
      facts.map((f) => [f.id, f.category, f.statement, f.sources, f.approved]),
    );
    expect(parsed.facts[3]!.attribution).toBe("Dana");
    expect(parsed.notes).toBe("");
  });

  it("applies human edits: approval, unticking, rewording, editor facts and notes", () => {
    const edited = text
      .replace("approved: false", "approved: true")
      .replace("- [x] F1: Dispatch took 150 minutes. (S1)", "- [ ] F1: Dispatch took 150 minutes. (S1)")
      .replace("Planning takes 25 minutes. (S2)", "Morning planning now takes 25 minutes. (S2)")
      .replace("## Stack\n", "## Stack\n\n- [x] Hosted on our own servers (editor)\n- [x] Uses Kafka\n")
      .replace("<!-- Optional guidance for the writer: audience, angle, what to emphasise. -->", "<!-- x -->\nFocus on dispatchers.");
    const parsed = parseBrief(edited);
    expect(parsed.approved).toBe(true);
    const byText = (t: string) => parsed.facts.find((f) => f.statement === t);
    expect(byText("Dispatch took 150 minutes.")!.approved).toBe(false);
    expect(byText("Morning planning now takes 25 minutes.")).toMatchObject({ id: "F3", approved: true, sources: ["S2"] });
    expect(byText("Hosted on our own servers")).toMatchObject({ category: "stack", sources: ["editor"], approved: true, id: "F5" });
    expect(byText("Uses Kafka")).toMatchObject({ sources: ["editor"], id: "F6" });
    expect(parsed.problems).toEqual(['No sources on "Uses Kafka" — treated as an editor statement.']);
    expect(parsed.notes).toBe("Focus on dispatchers.");
  });
});
