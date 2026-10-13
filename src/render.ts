import { excerpt } from "./brief.js";
import { describeChunk } from "./chunk.js";
import { extractNumbers } from "./numbers.js";
import { EDITOR_SOURCE, type CaseStudy, type Chunk, type Claim } from "./types.js";

export interface RenderOptions {
  project: string;
  agency?: string;
  /** Shown under the title, e.g. "Client: a regional freight carrier". */
  clientLabel?: string;
}

export interface Footnote {
  n: number;
  sourceId: string;
  location: string;
  excerpt: string;
}

interface Numbered {
  footnotes: Footnote[];
  refs: (sources: string[]) => number[];
}

/** Numbers footnotes in reading order; one footnote per source id. */
function numberFootnotes(study: CaseStudy, chunks: Chunk[]): Numbered {
  const byId = new Map(chunks.map((c) => [c.id, c]));
  const order = new Map<string, number>();
  const firstClaim = new Map<string, string>();
  const visit = (c: Claim | undefined) => {
    if (!c || !c.text) return;
    for (const s of c.sources) {
      if (!order.has(s)) {
        order.set(s, order.size + 1);
        firstClaim.set(s, c.text);
      }
    }
  };
  visit(study.summary);
  for (const c of [...study.challenge, ...study.solution, ...study.results, ...study.stack]) visit(c);
  if (study.quote) visit(study.quote);

  const footnotes: Footnote[] = [...order].map(([sourceId, n]) => {
    if (sourceId === EDITOR_SOURCE) {
      return { n, sourceId, location: "Editor note in the approved brief", excerpt: "" };
    }
    const chunk = byId.get(sourceId);
    if (!chunk) return { n, sourceId, location: "unknown source", excerpt: "" };
    return { n, sourceId, location: describeChunk(chunk), excerpt: bestExcerpt(chunk.text, firstClaim.get(sourceId) ?? "") };
  });
  return {
    footnotes,
    refs: (sources) =>
      [...new Set(sources.map((s) => order.get(s)).filter((n): n is number => n !== undefined))].sort((a, b) => a - b),
  };
}

const STOP = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "by", "was", "were", "is", "are", "from", "that", "this", "it", "as", "at"]);

function words(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9%]+/)
      .filter((w) => w.length > 1 && !STOP.has(w)),
  );
}

/** Picks the source line that best supports the claim (shared numbers first, then word overlap). */
export function bestExcerpt(sourceText: string, claim: string): string {
  const lines = sourceText.split("\n").filter((l) => l.trim() && !/^#{1,6}\s*$/.test(l));
  const claimNums = new Set(extractNumbers(claim).map((n) => `${n.value}|${n.percent}`));
  const claimWords = words(claim);
  let best = lines[0] ?? "";
  let bestScore = -1;
  for (const line of lines) {
    const nums = extractNumbers(line).filter((n) => claimNums.has(`${n.value}|${n.percent}`)).length;
    let overlap = 0;
    for (const w of words(line)) if (claimWords.has(w)) overlap++;
    const score = nums * 10 + overlap;
    if (score > bestScore) {
      best = line;
      bestScore = score;
    }
  }
  return excerpt(best.replace(/^#{1,6}\s+/, "").replace(/^[-*]\s+/, ""), 220);
}

function mdRefs(nums: number[]): string {
  return nums.map((n) => `[^${n}]`).join("");
}

/** Markdown with GitHub-style footnotes (`[^1]`). */
export function renderMarkdown(study: CaseStudy, chunks: Chunk[], options: RenderOptions): string {
  const { footnotes, refs } = numberFootnotes(study, chunks);
  const out: string[] = [`# ${study.title}`, ""];
  const meta = [options.clientLabel, options.agency ? `Delivered by ${options.agency}` : undefined].filter(Boolean);
  if (meta.length) out.push(`_${meta.join(" · ")}_`, "");
  if (study.summary.text) out.push(`**${study.summary.text}**${mdRefs(refs(study.summary.sources))}`, "");

  const paragraph = (claims: Claim[]) => claims.map((c) => `${c.text}${mdRefs(refs(c.sources))}`).join(" ");
  const bullets = (claims: Claim[]) => claims.map((c) => `- ${c.text}${mdRefs(refs(c.sources))}`);

  if (study.challenge.length) out.push("## Challenge", "", paragraph(study.challenge), "");
  if (study.solution.length) out.push("## Solution", "", ...bullets(study.solution), "");
  if (study.results.length) out.push("## Results", "", ...bullets(study.results), "");
  if (study.quote) out.push(`> “${study.quote.text}”`, `> — ${study.quote.attribution}${mdRefs(refs(study.quote.sources))}`, "");
  if (study.stack.length) out.push("## Stack", "", ...bullets(study.stack), "");

  out.push("---", "", "_Every statement is linked to the project material it comes from. Numbers were verified against the sources._", "");
  for (const f of footnotes) {
    out.push(`[^${f.n}]: **${f.sourceId}** · ${f.location}${f.excerpt ? ` — “${f.excerpt}”` : ""}`);
  }
  out.push("");
  return out.join("\n");
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const CSS = `:root{--bg:#ffffff;--fg:#14171f;--muted:#5b6170;--accent:#025aff;--rule:#e3e6ec;--card:#f5f7fb}
@media (prefers-color-scheme:dark){:root{--bg:#0f1115;--fg:#e8eaf0;--muted:#9aa1b0;--accent:#6b9bff;--rule:#262a33;--card:#171a21}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:760px;margin:0 auto;padding:56px 20px 80px}h1{font-size:2.1rem;line-height:1.2;margin:0 0 8px}
.meta{color:var(--muted);margin:0 0 28px}.lead{font-size:1.2rem;font-weight:600;margin:0 0 32px}
h2{font-size:.85rem;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);margin:40px 0 12px}
ul{padding-left:1.2em}li{margin:6px 0}sup a{color:var(--accent);text-decoration:none;font-size:.75em;padding:0 1px}
blockquote{margin:36px 0;padding:20px 24px;background:var(--card);border-left:4px solid var(--accent);border-radius:6px}
blockquote p{margin:0;font-size:1.15rem}blockquote footer{margin-top:8px;color:var(--muted)}
.notes{margin-top:56px;border-top:1px solid var(--rule);padding-top:16px;color:var(--muted);font-size:.9rem}
.notes ol{padding-left:1.4em}.notes code{font-size:.85em}.backref{text-decoration:none;color:var(--accent)}
@media print{body{font-size:12pt}main{padding:0}}`;

/** Standalone, dependency-free HTML page with numbered footnotes and back-links. */
export function renderHtml(study: CaseStudy, chunks: Chunk[], options: RenderOptions): string {
  const { footnotes, refs } = numberFootnotes(study, chunks);
  const sup = (sources: string[]) => {
    const nums = refs(sources);
    if (nums.length === 0) return "";
    return `<sup>${nums.map((n) => `<a href="#fn-${n}" aria-label="Source ${n}">${n}</a>`).join(",")}</sup>`;
  };
  const claimHtml = (c: Claim) => `${escapeHtml(c.text)}${sup(c.sources)}`;
  const list = (claims: Claim[]) => `<ul>\n${claims.map((c) => `  <li>${claimHtml(c)}</li>`).join("\n")}\n</ul>`;

  const body: string[] = [`<h1>${escapeHtml(study.title)}</h1>`];
  const meta = [options.clientLabel, options.agency ? `Delivered by ${options.agency}` : undefined].filter((x): x is string => Boolean(x));
  if (meta.length) body.push(`<p class="meta">${meta.map(escapeHtml).join(" · ")}</p>`);
  if (study.summary.text) body.push(`<p class="lead">${claimHtml(study.summary)}</p>`);
  if (study.challenge.length) body.push(`<h2>Challenge</h2>`, `<p>${study.challenge.map(claimHtml).join(" ")}</p>`);
  if (study.solution.length) body.push(`<h2>Solution</h2>`, list(study.solution));
  if (study.results.length) body.push(`<h2>Results</h2>`, list(study.results));
  if (study.quote) {
    body.push(
      `<blockquote><p>“${escapeHtml(study.quote.text)}”</p><footer>— ${escapeHtml(study.quote.attribution)}${sup(study.quote.sources)}</footer></blockquote>`,
    );
  }
  if (study.stack.length) body.push(`<h2>Stack</h2>`, list(study.stack));
  body.push(
    `<section class="notes" aria-label="Sources">`,
    `<p>Every statement is linked to the project material it comes from. Numbers were verified against the sources.</p>`,
    `<ol>`,
    ...footnotes.map(
      (f) =>
        `  <li id="fn-${f.n}"><code>${escapeHtml(f.sourceId)}</code> · ${escapeHtml(f.location)}${f.excerpt ? ` — “${escapeHtml(f.excerpt)}”` : ""}</li>`,
    ),
    `</ol>`,
    `</section>`,
  );

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(study.title)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
${body.join("\n")}
</main>
</body>
</html>
`;
}
