import { describe, expect, it } from "vitest";
import { factCheck, renderFactCheckReport } from "../src/factcheck.js";
import type { CaseStudy, Fact } from "../src/types.js";
import { chunk } from "./helpers.js";

const chunks = [
  chunk("S1", "Morning planning took 150 minutes. On-time rate was 81% last quarter."),
  chunk("S2", "Planning now takes 25 minutes. On-time delivery reached 94%."),
  chunk("S3", "[00:01:10] Dana: For the first time in years, my dispatchers go home on time.", { kind: "transcript" }),
];
const editorFact: Fact = { id: "F9", category: "result", statement: "The team was 4 engineers.", sources: ["editor"], approved: true, warnings: [] };

function study(partial: Partial<CaseStudy>): CaseStudy {
  return { title: "Faster dispatch", summary: { text: "", sources: [] }, challenge: [], solution: [], results: [], stack: [], ...partial };
}

describe("factCheck", () => {
  it("passes claims whose numbers are in the cited sources", () => {
    const { report, study: out } = factCheck(study({ results: [{ text: "Planning takes 25 minutes now.", sources: ["S2"] }] }), chunks, [], "P");
    expect(report).toMatchObject({ checked: 1, ok: 1, removed: 0, numbersChecked: 1 });
    expect(out.results).toHaveLength(1);
  });

  it("removes claims with numbers that appear in no source (hallucinated or derived)", () => {
    const { report, study: out } = factCheck(
      study({
        results: [
          { text: "Planning is 83% faster.", sources: ["S2"] },
          { text: "It saves $210,000 a year.", sources: ["S2"] },
          { text: "On-time delivery reached 94%.", sources: ["S2"] },
        ],
      }),
      chunks,
      [],
      "P",
    );
    expect(out.results.map((c) => c.text)).toEqual(["On-time delivery reached 94%."]);
    expect(report.removed).toBe(2);
    expect(report.claims[1]!.unsupported).toEqual(["$210,000"]);
  });

  it("adds the missing citation when a number exists in another source", () => {
    const { report, study: out } = factCheck(study({ results: [{ text: "On-time rose from 81% to 94%.", sources: ["S2"] }] }), chunks, [], "P");
    expect(out.results[0]!.sources).toEqual(["S2", "S1"]);
    expect(report.claims[0]).toMatchObject({ status: "recited", reason: '"81%" found in S1, citation added' });
  });

  it("removes uncited claims and claims citing unknown sources", () => {
    const { report } = factCheck(
      study({ challenge: [{ text: "Things were slow.", sources: [] }, { text: "Very slow.", sources: ["S42"] }] }),
      chunks,
      [],
      "P",
    );
    expect(report.claims.map((c) => [c.status, c.reason])).toEqual([
      ["removed", "no valid citation"],
      ["removed", "no valid citation"],
    ]);
  });

  it("treats approved editor statements as a source", () => {
    const { report } = factCheck(study({ solution: [{ text: "A team of 4 engineers built it.", sources: ["editor"] }] }), chunks, [editorFact], "P");
    expect(report.ok).toBe(1);
  });

  it("keeps verbatim quotes and removes paraphrased ones", () => {
    const ok = factCheck(study({ quote: { text: "my dispatchers go home on time", attribution: "Dana", sources: ["S3"] } }), chunks, [], "P");
    expect(ok.study.quote).toBeDefined();
    const bad = factCheck(study({ quote: { text: "dispatchers finally leave on time", attribution: "Dana", sources: ["S3"] } }), chunks, [], "P");
    expect(bad.study.quote).toBeUndefined();
    expect(bad.report.claims[0]!.reason).toBe("quote is not verbatim in its cited source");
  });

  it("falls back to the project name when the title contains an unsupported number", () => {
    const { study: out, report } = factCheck(study({ title: "Dispatch 5x faster" }), chunks, [], "Fleet portal");
    expect(out.title).toBe("Fleet portal");
    expect(report.claims[0]!.section).toBe("title");
  });

  it("renders a readable report", () => {
    const { report } = factCheck(study({ results: [{ text: "Planning is 83% faster.", sources: ["S2"] }] }), chunks, [], "P");
    const md = renderFactCheckReport(report);
    expect(md).toContain("- Removed: **1**");
    expect(md).toContain('- **REMOVED** (results): Planning is 83% faster.\n  - number "83%" not found in any source');
  });
});
