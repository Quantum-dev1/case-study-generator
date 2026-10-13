import type { RawDocument, SourceLine } from "../types.js";
import { splitLines } from "./markdown.js";

const CUE_TIMING = /^(\d{1,2}:)?\d{2}:\d{2}[.,]\d{3}\s+-->\s+(\d{1,2}:)?\d{2}:\d{2}[.,]\d{3}/;
const VOICE_TAG = /^<v(?:\.[\w.-]+)?\s+([^>]+)>/;

/** Normalizes `05:12.000` / `1:05:12,000` to `hh:mm:ss`. */
export function normalizeTimestamp(raw: string): string {
  const clean = raw.split(/[.,]/)[0] ?? raw;
  const parts = clean.split(":").map((p) => p.padStart(2, "0"));
  while (parts.length < 3) parts.unshift("00");
  return parts.join(":");
}

/** Parses a WebVTT file into one source line per cue, keeping speaker and start time. */
export function parseVtt(path: string, content: string): RawDocument {
  const raw = splitLines(content);
  const lines: SourceLine[] = [];
  for (let i = 0; i < raw.length; i++) {
    const timing = raw[i]!.trim();
    if (!CUE_TIMING.test(timing)) continue;
    const start = normalizeTimestamp(timing.split("-->")[0]!.trim());
    const textLine = i + 2; // 1-based number of the first cue text line
    const parts: string[] = [];
    let speaker: string | undefined;
    let j = i + 1;
    for (; j < raw.length && raw[j]!.trim() !== ""; j++) {
      let t = raw[j]!.trim();
      const voice = VOICE_TAG.exec(t);
      if (voice) {
        speaker = voice[1]!.trim();
        t = t.slice(voice[0].length);
      }
      parts.push(t.replace(/<\/?[^>]+>/g, "").trim());
    }
    i = j;
    let text = parts.join(" ").trim();
    if (!text) continue;
    if (!speaker) {
      const m = /^([A-Z][\w .'-]{1,40}):\s+(.*)$/.exec(text);
      if (m) {
        speaker = m[1]!.trim();
        text = m[2]!.trim();
      }
    }
    lines.push({ line: textLine, text, timestamp: start, ...(speaker ? { speaker } : {}) });
  }
  return { path, kind: "transcript", lines: mergeSameSpeaker(lines) };
}

const TXT_LINE = /^\s*(?:\[?((?:\d{1,2}:)?\d{1,2}:\d{2})\]?\s*[-–]?\s*)?(?:([A-Z][\w .'-]{1,40}):\s+)?(.*)$/;

/** Parses a plain-text transcript: `[00:03:10] Speaker: text`, `Speaker: text` or bare lines. */
export function parseTextTranscript(path: string, content: string): RawDocument {
  const lines: SourceLine[] = [];
  splitLines(content).forEach((rawLine, idx) => {
    if (!rawLine.trim()) return;
    const m = TXT_LINE.exec(rawLine);
    const text = (m?.[3] ?? rawLine).trim();
    if (!text) return;
    const line: SourceLine = { line: idx + 1, text };
    if (m?.[1]) line.timestamp = normalizeTimestamp(m[1]);
    if (m?.[2]) line.speaker = m[2].trim();
    lines.push(line);
  });
  return { path, kind: "transcript", lines };
}

/** Heuristic: a .txt file is a transcript if most non-empty lines look like `Speaker: ...` or start with a timestamp. */
export function looksLikeTranscript(content: string): boolean {
  const lines = splitLines(content).filter((l) => l.trim());
  if (lines.length === 0) return false;
  const hits = lines.filter((l) => /^\s*\[?\d{1,2}:\d{2}/.test(l) || /^[A-Z][\w .'-]{1,40}:\s+\S/.test(l)).length;
  return hits / lines.length >= 0.5;
}

/** Consecutive cues by the same speaker are merged so quotes are not split mid-sentence. */
function mergeSameSpeaker(lines: SourceLine[]): SourceLine[] {
  const out: SourceLine[] = [];
  for (const l of lines) {
    const prev = out[out.length - 1];
    if (prev && l.speaker && prev.speaker === l.speaker && !/[.!?]["”]?$/.test(prev.text)) {
      prev.text = `${prev.text} ${l.text}`;
    } else {
      out.push({ ...l });
    }
  }
  return out;
}

/** Text form used in chunks: `[00:03:10] Dana Whitfield: ...`. */
export function formatTranscriptLine(l: SourceLine): string {
  const ts = l.timestamp ? `[${l.timestamp}] ` : "";
  const sp = l.speaker ? `${l.speaker}: ` : "";
  return `${ts}${sp}${l.text}`;
}
