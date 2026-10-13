import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { ProjectConfig } from "./types.js";

export const CONFIG_FILE = "case-study.config.json";

export class ConfigError extends Error {
  override name = "ConfigError";
}

/** Validates a parsed config object and fills defaults. */
export function validateConfig(raw: unknown, origin = "config"): ProjectConfig {
  if (typeof raw !== "object" || raw === null) throw new ConfigError(`${origin}: expected a JSON object`);
  const r = raw as Record<string, unknown>;
  const client = r.client as Record<string, unknown> | undefined;
  const problems: string[] = [];
  if (typeof r.project !== "string" || !r.project.trim()) problems.push(`"project" (string) is required`);
  if (!client || typeof client !== "object") problems.push(`"client" (object) is required`);
  else {
    if (typeof client.name !== "string" || !client.name.trim()) problems.push(`"client.name" (string) is required`);
    if (typeof client.industry !== "string" || !client.industry.trim())
      problems.push(`"client.industry" (string, e.g. "a regional freight carrier") is required`);
    if (client.aliases !== undefined && !isStringArray(client.aliases)) problems.push(`"client.aliases" must be an array of strings`);
  }
  if (r.redact !== undefined && (typeof r.redact !== "object" || r.redact === null || !Object.values(r.redact).every((v) => typeof v === "string")))
    problems.push(`"redact" must map names to replacement strings`);
  if (r.git !== undefined && !isStringArray(r.git)) problems.push(`"git" must be an array of repository paths`);
  if (problems.length) throw new ConfigError(`${origin}:\n  - ${problems.join("\n  - ")}`);
  return raw as ProjectConfig;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/** Loads the config from an explicit path or `<materials>/case-study.config.json`. Git paths are resolved relative to the config file. */
export async function loadConfig(materialsDir: string, explicitPath?: string): Promise<ProjectConfig> {
  const path = resolve(explicitPath ?? join(materialsDir, CONFIG_FILE));
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    throw new ConfigError(
      `Config not found at ${path}. Create ${CONFIG_FILE} with at least {"project": "...", "client": {"name": "...", "industry": "..."}}.`,
    );
  }
  const config = validateConfig(JSON.parse(text), path);
  if (config.git) config.git = config.git.map((g) => resolve(dirname(path), g));
  return config;
}
