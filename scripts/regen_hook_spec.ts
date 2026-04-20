#!/usr/bin/env node
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getConfig } from "../src/config.js";
import type { HookCliSpec, HookOption, HookSubcommand } from "../src/specTypes.js";

export const SUBCOMMANDS = ["clip", "link", "list", "find", "remove", "clone", "from"] as const;

export function parseHookHelpOutput(name: string, help: string): HookSubcommand {
  const lines = help.split("\n");
  const usageLine = lines.find((l) => /^Usage:/i.test(l)) ?? `Usage: hook ${name}`;

  const descIdx = lines.findIndex((l) => /^Description:/i.test(l));
  let description = "";
  if (descIdx >= 0) {
    for (let i = descIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || /^(Options|Arguments|Flags):/i.test(line)) break;
      description += line.trim() + " ";
    }
  }

  const options: HookOption[] = [];
  const optIdx = lines.findIndex((l) => /^Options:/i.test(l));
  if (optIdx >= 0) {
    for (let i = optIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || /^[A-Z]\w+:/.test(line)) break;
      const match = line.match(/^\s*(?:(-\w),\s+)?(--[\w-]+)\s+(.+)$/);
      if (match) {
        options.push({
          short: match[1] ?? null,
          long: match[2] ?? null,
          description: match[3].trim(),
        });
      }
    }
  }

  return {
    name,
    usage: usageLine.trim(),
    description: description.trim(),
    options,
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const cfg = getConfig(process.env);
  const specPath = path.resolve("docs/reference/hook-cli-spec.json");
  const previousPath = path.resolve("docs/reference/hook-cli-spec.previous.json");
  const { changed } = regenHookSpec({ hookCli: cfg.hookCli, specPath, previousPath });
  process.stderr.write(changed ? "[regen] spec updated\n" : "[regen] no changes\n");
}
