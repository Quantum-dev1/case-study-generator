import { describe, expect, it } from "vitest";
import { NumberIndex, extractNumbers, normalizeForQuote, unsupportedNumbers } from "../src/numbers.js";

const values = (t: string) => extractNumbers(t).map((n) => [n.value, n.percent]);

describe("extractNumbers", () => {
  it("normalizes thousands separators, suffixes and words", () => {
    expect(values("1,200 orders")).toEqual([[1200, false]]);
    expect(values("1.2k orders")).toEqual([[1200, false]]);
    expect(values("1.2 thousand orders")).toEqual([[1200, false]]);
    expect(values("$1.5M budget")).toEqual([[1_500_000, false]]);
    expect(values("2 million users")).toEqual([[2_000_000, false]]);
  });

  it("recognises percentages in every common spelling", () => {
    expect(values("40%")).toEqual([[40, true]]);
    expect(values("40 %")).toEqual([[40, true]]);
    expect(values("40 percent")).toEqual([[40, true]]);
    expect(values("12.5 per cent")).toEqual([[12.5, true]]);
  });

  it("keeps numbers glued to units and multipliers", () => {
    expect(values("11min")).toEqual([[11, false]]);
    expect(values("3x faster")).toEqual([[3, false]]);
    expect(values("a 10-week project")).toEqual([[10, false]]);
  });

  it("ignores timestamps, citation markers, footnotes and commit hashes", () => {
    expect(values("[00:03:10] Dana: hello")).toEqual([]);
    expect(values("as stated (S12) and [S3, S4] and[^2]")).toEqual([]);
    expect(values("commit 5b7897c fixed it")).toEqual([]);
  });

  it("does not split version-like or decimal tokens into extra numbers", () => {
    expect(values("v2.3")).toEqual([]);
    expect(values("2.5 hours")).toEqual([[2.5, false]]);
  });
});

describe("NumberIndex", () => {
  const index = new NumberIndex(["Planning took 150 minutes; on-time rate 81% and 1,200 orders a day."]);

  it("matches equivalent spellings", () => {
    expect(unsupportedNumbers("1.2k orders, 81 percent on time, 150 min", index)).toEqual([]);
  });

  it("flags numbers that are absent, including derived percentages", () => {
    expect(unsupportedNumbers("planning is 83% faster", index).map((n) => n.raw)).toEqual(["83%"]);
  });

  it("does not let a bare number support a percentage", () => {
    expect(unsupportedNumbers("150% growth", index).map((n) => n.raw)).toEqual(["150%"]);
  });

  it("lets a percentage support the same bare number", () => {
    expect(unsupportedNumbers("from 81 to", index)).toEqual([]);
  });
});

describe("normalizeForQuote", () => {
  it("ignores case, curly quotes, punctuation and timestamps", () => {
    expect(normalizeForQuote("[00:01:10] Dana: “It’s DONE,  finally!”")).toBe("dana it's done finally");
  });
});
