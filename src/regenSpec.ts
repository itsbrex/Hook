import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { HookCliSpec, HookOption, HookSubcommand } from "./specTypes.js";

export const SUBCOMMANDS = ["clip", "link", "list", "find", "remove", "clone", "from"] as const;

// hook 2.1.3 emits man-page-style help with flush-left UPPERCASE section
// headers: NAME / SYNOPSIS / DESCRIPTION / COMMAND OPTIONS / EXAMPLES.
// Sections contain indented body lines and are terminated by the next header
// or EOF.
function splitSections(lines: string[]): Record<string, string[]> {
  const sections: Record<string, string[]> = {};
  let current: string | null = null;
  for (const line of lines) {
    const header = line.match(/^([A-Z][A-Z ]{1,30}[A-Z])\s*$/);
    if (header) {
      current = header[1].trim();
      sections[current] = [];
    } else if (current) {
      sections[current].push(line);
    }
  }
  return sections;
}

function extractUsageFromSynopsis(name: string, synopsis: string[]): string {
  const hookLine = synopsis.map((l) => l.trim()).find((l) => /^hook\b/.test(l));
  if (!hookLine) return `hook ${name}`;
  // Strip noise that confuses the positional extractor and clutters the spec.
  return hookLine
    .replace(/\[global options\]\s*/g, "")
    .replace(/\[command options\]\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDescription(desc: string[]): string {
  const text = desc.map((l) => l.trim()).join(" ").trim();
  return text.replace(/\s+/g, " ");
}

// COMMAND OPTIONS lines look like:
//   -m, --markdown     - Copy as Markdown
//   -a, --app=APP_NAME - Copy from application (default: none)
//   --null             - Separate results with NULL separator
//   -s, --[no-]select  - Generate a menu to select hook(s)
// Description text can wrap onto further-indented continuation lines.
function extractOptions(optLines: string[]): HookOption[] {
  const options: HookOption[] = [];
  const joined: string[] = [];
  for (const raw of optLines) {
    if (/^\s{4,}-/.test(raw)) {
      joined.push(raw);
    } else if (raw.trim() && joined.length > 0) {
      joined[joined.length - 1] += " " + raw.trim();
    }
  }
  for (const line of joined) {
    const m = line.trim().match(/^(?:(-\w),\s+)?(--\[?[\w-]+?\]?[\w-]*(?:=\S+)?)\s+-\s+(.*)$/);
    if (!m) continue;
    const short = m[1] ?? null;
    const longRaw = m[2];
    const valueMatch = longRaw.match(/=(\S+)$/);
    const valueArg = valueMatch ? valueMatch[1] : null;
    const long = longRaw.replace(/^--\[no-\]/, "--").replace(/=.*$/, "");
    options.push({ short, long, description: m[3].replace(/\s+/g, " ").trim(), valueArg });
  }
  return options;
}

export function parseHookHelpOutput(name: string, help: string): HookSubcommand {
  const sections = splitSections(help.split("\n"));
  return {
    name,
    usage: extractUsageFromSynopsis(name, sections.SYNOPSIS ?? []),
    description: extractDescription(sections.DESCRIPTION ?? []),
    options: extractOptions(sections["COMMAND OPTIONS"] ?? []),
  };
}

export function buildSpecFromHelp(helps: Record<string, string>, hookVersion: string | null = null): HookCliSpec {
  const subcommands = Object.entries(helps).map(([name, help]) => parseHookHelpOutput(name, help));
  return {
    generatedAt: new Date().toISOString(),
    hookVersion,
    subcommands,
  };
}

function runHookHelp(hookCli: string, sub: string): string {
  return execSync(`'${hookCli}' help ${sub}`, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
}

function runHookVersion(hookCli: string): string | null {
  try {
    return execSync(`'${hookCli}' --version`, { encoding: "utf-8" }).trim();
  } catch {
    return null;
  }
}

export interface RegenResult {
  spec: HookCliSpec;
  changed: boolean;
  previousRaw: string | null;
  newRaw: string;
}

export function regenHookSpec(opts: {
  hookCli: string;
  specPath: string;
  previousPath: string;
}): RegenResult {
  const helps: Record<string, string> = {};
  for (const sub of SUBCOMMANDS) {
    helps[sub] = runHookHelp(opts.hookCli, sub);
  }
  const spec = buildSpecFromHelp(helps, runHookVersion(opts.hookCli));
  const newRaw = JSON.stringify(spec, null, 2) + "\n";

  const previousRaw = existsSync(opts.specPath) ? readFileSync(opts.specPath, "utf8") : null;
  const changed = previousRaw !== null && normalizeForDiff(previousRaw) !== normalizeForDiff(newRaw);

  mkdirSync(path.dirname(opts.specPath), { recursive: true });
  if (changed && previousRaw) {
    writeFileSync(opts.previousPath, previousRaw);
  }
  writeFileSync(opts.specPath, newRaw);

  return { spec, changed, previousRaw, newRaw };
}

function normalizeForDiff(raw: string): string {
  try {
    const obj = JSON.parse(raw) as HookCliSpec;
    return JSON.stringify({ ...obj, generatedAt: "" });
  } catch {
    return raw;
  }
}
