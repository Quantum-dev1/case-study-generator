/**
 * Number extraction and normalization used by the fact-checker.
 *
 * "1,200", "1200", "1.2k" and "1.2 thousand" all normalize to 1200; "40%",
 * "40 %" and "40 percent" normalize to a percentage of 40. A number in the
 * generated text is supported only if the same normalized value appears in
 * the source text.
 */

export interface NumberToken {
  raw: string;
  value: number;
  percent: boolean;
  index: number;
}

const NUMBER_RE =
  /(?<![\w.]|\d,)([$€£])?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(?:(\s?%)|\s(percent|per cent|thousand|million|billion|mln|bn)\b|([a-zA-Z×]+))?/g;

const WORD_MULTIPLIER: Record<string, number> = { thousand: 1e3, million: 1e6, mln: 1e6, billion: 1e9, bn: 1e9 };
const SUFFIX_MULTIPLIER: Record<string, number> = { k: 1e3, K: 1e3, M: 1e6, MM: 1e6, B: 1e9, bn: 1e9 };

/** Removes things that look numeric but are not claims: timestamps, citation markers, footnote refs. */
export function stripNonClaims(text: string): string {
  return text
    .replace(/\[\^?\d+\]/g, " ")
    .replace(/[[(]S\d+(?:\s*,\s*S\d+)*[\])]/g, " ")
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?\b/g, " ")
    .replace(/\b[0-9a-f]{7,40}\b/g, (m) => (/[a-f]/.test(m) && /\d/.test(m) ? " " : m));
}

export function extractNumbers(text: string): NumberToken[] {
  const clean = stripNonClaims(text);
  const out: NumberToken[] = [];
  for (const m of clean.matchAll(NUMBER_RE)) {
    const intPart = m[2]!.replace(/,/g, "");
    let value = Number(m[3] ? `${intPart}.${m[3]}` : intPart);
    let percent = false;
    if (m[4]) percent = true;
    const word = m[5]?.toLowerCase();
    if (word) {
      if (word === "percent" || word === "per cent") percent = true;
      else value *= WORD_MULTIPLIER[word] ?? 1;
    }
    const suffix = m[6];
    if (suffix && SUFFIX_MULTIPLIER[suffix] !== undefined) value *= SUFFIX_MULTIPLIER[suffix]!;
    out.push({ raw: m[0].trim(), value, percent, index: m.index ?? 0 });
  }
  return out;
}

function key(value: number, percent: boolean): string {
  return `${percent ? "p" : "n"}:${Number(value.toFixed(6))}`;
}

/** Fast lookup of all numbers that appear in a body of source text. */
export class NumberIndex {
  private readonly keys = new Set<string>();

  constructor(texts: Iterable<string> = []) {
    for (const t of texts) this.add(t);
  }

  add(text: string): void {
    for (const n of extractNumbers(text)) {
      this.keys.add(key(n.value, n.percent));
      // A bare "40" in the sources also supports "40" in the output, and "40%" supports a bare "40".
      if (n.percent) this.keys.add(key(n.value, false));
    }
  }

  has(token: NumberToken): boolean {
    return this.keys.has(key(token.value, token.percent));
  }
}

/** Numbers in `text` that are not present in the index. */
export function unsupportedNumbers(text: string, index: NumberIndex): NumberToken[] {
  return extractNumbers(text).filter((n) => !index.has(n));
}

/** Normalizes text for verbatim-quote comparison (case, punctuation, quotes, whitespace). */
export function normalizeForQuote(text: string): string {
  return text
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9'%$ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
