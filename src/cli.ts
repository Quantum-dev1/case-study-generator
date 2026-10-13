import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadConfig } from "./config.js";
import { RecordingLLM, ReplayLLM } from "./llm/cassette.js";
import { OpenAICompatibleLLM, optionsFromEnv } from "./llm/openai.js";
import type { LLM } from "./llm/types.js";
import { buildBrief, writeCaseStudy, type BriefResult, type WriteResult } from "./pipeline.js";

const HELP = `case-study — turn raw project materials into a cited, fact-checked case study

Usage:
  case-study brief <materials-dir> [options]   collect → chunk → extract facts → brief.md
  case-study write <out-dir> [options]         approved brief → case study (md + html) → fact-check
  case-study run <materials-dir> [options]     brief, then write (needs --approve to skip review)

Options:
  -o, --out <dir>          output folder (default: ./case-study-out)
  -c, --config <file>      config file (default: <materials-dir>/case-study.config.json)
      --approve            treat the brief as approved (skip the human review gate)
      --nda                redact client names; writes case-study.nda.* files
      --record <file>      call the live endpoint and save responses to a cassette
      --replay <file>      run offline from a recorded cassette (no network)
      --concurrency <n>    parallel extraction requests (default: $CSG_CONCURRENCY or 3)
      --max-chunk-chars <n> soft chunk size (default: 1200)
  -h, --help               show help
  -v, --version            show version

Environment (live mode): CSG_BASE_URL, CSG_MODEL, CSG_API_KEY — any OpenAI-compatible endpoint.
`;

function version(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
    return pkg.version;
  } catch {
    return "unknown";
  }
}

async function createLLM(record?: string, replay?: string): Promise<LLM> {
  if (record && replay) throw new Error("Use either --record or --replay, not both.");
  if (replay) return ReplayLLM.fromFile(resolve(replay));
  const live = new OpenAICompatibleLLM(optionsFromEnv());
  return record ? new RecordingLLM(live, resolve(record)) : live;
}

const rel = (p: string) => {
  const r = relative(process.cwd(), p);
  return r === "" ? "." : r.startsWith("..") ? p : r;
};

function printBrief(r: BriefResult): void {
  const approved = r.facts.filter((f) => f.approved).length;
  const flagged = r.facts.filter((f) => f.warnings.length).length;
  console.log(`Collected ${r.documents} documents → ${r.chunks.length} source chunks`);
  console.log(`Extracted ${r.facts.length} facts (${approved} ticked, ${flagged} flagged for review, ${r.dropped.length} dropped without valid sources)`);
  console.log(`Brief: ${rel(r.briefPath)}`);
}

function printWrite(r: WriteResult): void {
  for (const n of r.notices) console.log(`  note: ${n}`);
  const rep = r.report;
  console.log(
    `Fact-check: ${rep.checked} statements, ${rep.numbersChecked} numbers — ${rep.ok} passed, ${rep.recited} citation fixed, ${rep.removed} removed`,
  );
  for (const c of rep.claims.filter((c) => c.status === "removed")) console.log(`  removed (${c.section}): ${c.reason}`);
  for (const f of r.files) console.log(`Wrote ${rel(f)}`);
}

function printUsage(llm: LLM): void {
  const u = llm.usage;
  const tokens = u.promptTokens + u.completionTokens;
  console.log(`LLM: ${u.calls} call${u.calls === 1 ? "" : "s"}${tokens ? `, ${u.promptTokens} prompt + ${u.completionTokens} completion tokens` : ""}`);
  if (llm instanceof ReplayLLM) for (const w of llm.warnings) console.log(`  warning: ${w}`);
}

export async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      out: { type: "string", short: "o" },
      config: { type: "string", short: "c" },
      approve: { type: "boolean", default: false },
      nda: { type: "boolean", default: false },
      record: { type: "string" },
      replay: { type: "string" },
      concurrency: { type: "string" },
      "max-chunk-chars": { type: "string" },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
  });
  if (values.version) {
    console.log(version());
    return 0;
  }
  const [command, target] = positionals;
  if (values.help || !command) {
    console.log(HELP);
    return values.help ? 0 : 1;
  }
  if (!["brief", "write", "run"].includes(command)) {
    console.error(`Unknown command "${command}".\n\n${HELP}`);
    return 1;
  }
  if (!target) {
    console.error(`Missing ${command === "write" ? "<out-dir>" : "<materials-dir>"}.\n\n${HELP}`);
    return 1;
  }

  const llm = await createLLM(values.record, values.replay);
  const concurrency = Number(values.concurrency ?? process.env.CSG_CONCURRENCY ?? 3);
  try {
    if (command === "write") {
      printWrite(await writeCaseStudy({ outDir: resolve(target), llm, approve: values.approve, nda: values.nda }));
    } else {
      const outDir = resolve(values.out ?? "case-study-out");
      const config = await loadConfig(target, values.config);
      const briefOpts: Parameters<typeof buildBrief>[0] = { materialsDir: target, outDir, config, llm, concurrency };
      if (values["max-chunk-chars"]) briefOpts.maxChunkChars = Number(values["max-chunk-chars"]);
      printBrief(await buildBrief(briefOpts));
      if (command === "run") {
        if (!values.approve) {
          console.log("Review the brief, then run: case-study write " + rel(outDir) + " (or re-run with --approve).");
        } else {
          printWrite(await writeCaseStudy({ outDir, llm, approve: true, nda: values.nda }));
        }
      } else {
        console.log(`Next: review the brief, set "approved: true", then run: case-study write ${rel(outDir)}`);
      }
    }
    printUsage(llm);
  } finally {
    await llm.close?.();
  }
  return 0;
}
