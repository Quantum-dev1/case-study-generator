import { describe, expect, it } from "vitest";
import { createRedactor, redactCaseStudy, redactChunks } from "../src/redact.js";
import { bestExcerpt, renderHtml, renderMarkdown } from "../src/render.js";
import type { CaseStudy } from "../src/types.js";
import { CONFIG, chunk } from "./helpers.js";

describe("redaction", () => {
  const r = createRedactor(CONFIG);

  it("replaces the client name, aliases and people with neutral descriptions", () => {
    expect(r.text("Acme Logistics runs 60 trucks. We met Jane Doe at Acme's depot.")).toBe(
      "A mid-size logistics company runs 60 trucks. We met Client executive at a mid-size logistics company's depot.",
    );
  });

  it("handles articles, case and sentence starts", () => {
    expect(r.text("the ACME team said")).toBe("the mid-size logistics company team said");
    expect(r.text("Thanks, acme logistics!")).toBe("Thanks, a mid-size logistics company!");
    expect(r.text("- Acme rolled out")).toBe("- A mid-size logistics company rolled out");
  });

  it("does not touch words that merely contain an alias", () => {
    expect(r.text("Acmeville is a town")).toBe("Acmeville is a town");
  });

  it("slugifies names inside paths", () => {
    expect(r.path("notes/acme-logistics-kickoff.md")).toBe("notes/mid-size-logistics-company-kickoff.md");
  });

  it("detects leaks", () => {
    expect(r.leaks("clean text")).toEqual([]);
    expect(r.leaks("Hello ACME")).toEqual(["Acme"]);
  });

  it("redacts the whole document including quotes, attributions and source excerpts", () => {
    const s: CaseStudy = {
      title: "Acme Logistics ships faster",
      summary: { text: "Acme needed speed.", sources: ["S1"] },
      challenge: [],
      solution: [],
      results: [],
      stack: [],
      quote: { text: "Acme is happy", attribution: "Jane Doe, Acme Logistics", sources: ["S1"] },
    };
    const chunks = redactChunks([chunk("S1", "Jane Doe: Acme is happy", { path: "acme/call.vtt" })], r);
    const md = renderMarkdown(redactCaseStudy(s, r), chunks, { project: "P" });
    expect(r.leaks(md)).toEqual([]);
    expect(md).toContain("— Client executive, a mid-size logistics company");
    expect(md).toContain("mid-size-logistics-company/call.vtt");
  });
});

describe("rendering", () => {
  const chunks = [chunk("S1", "Intro\nPlanning took 150 minutes.\nOther"), chunk("S2", "Planning now 25 minutes")];
  const s: CaseStudy = {
    title: "Fast <dispatch> & more",
    summary: { text: "Planning got faster.", sources: ["S2", "S1"] },
    challenge: [{ text: "It took 150 minutes.", sources: ["S1"] }],
    solution: [{ text: "A new console.", sources: ["editor"] }],
    results: [{ text: "Now 25 minutes.", sources: ["S2"] }],
    stack: [],
  };

  it("numbers footnotes in reading order, one per source, sorted within a claim", () => {
    const md = renderMarkdown(s, chunks, { project: "P", agency: "Example Studio", clientLabel: "Client: X" });
    expect(md).toContain("_Client: X · Delivered by Example Studio_");
    expect(md).toContain("**Planning got faster.**[^1][^2]");
    expect(md).toContain("It took 150 minutes.[^2]");
    expect(md).toContain("[^2]: **S1** · s1.md, lines 1–3 — “Planning took 150 minutes.”");
    expect(md).toContain("[^3]: **editor** · Editor note in the approved brief");
    expect(md).not.toContain("## Stack");
  });

  it("produces escaped standalone HTML with linked footnotes", () => {
    const html = renderHtml(s, chunks, { project: "P" });
    expect(html).toContain("<title>Fast &lt;dispatch&gt; &amp; more</title>");
    expect(html).toContain('<sup><a href="#fn-1" aria-label="Source 1">1</a>,<a href="#fn-2" aria-label="Source 2">2</a></sup>');
    expect(html).toContain('<li id="fn-2"><code>S1</code>');
    expect(html).not.toMatch(/<script/i);
  });

  it("picks the excerpt line that shares numbers and words with the claim", () => {
    expect(bestExcerpt("Kickoff\nWe ship 3 apps.\nPlanning took 150 minutes.", "planning took 150 minutes")).toBe("Planning took 150 minutes.");
  });
});
