import { readFileSync } from "node:fs";
import { spawn as nodeSpawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { HookCliSpec, HookSubcommand } from "./specTypes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface SpecDiff {
  addedSubcommands: string[];
  removedSubcommands: string[];
  changedSubcommands: Array<{
    name: string;
    addedOptions: string[];
    removedOptions: string[];
    descriptionChanged: boolean;
  }>;
  hasChanges: boolean;
}

function optionKeys(sub: HookSubcommand): string[] {
  return sub.options.map((o) => o.long ?? o.short ?? "").filter(Boolean);
}

export function diffSpecs(prev: HookCliSpec, next: HookCliSpec): SpecDiff {
  const prevMap = new Map(prev.subcommands.map((s) => [s.name, s]));
  const nextMap = new Map(next.subcommands.map((s) => [s.name, s]));

  const added: string[] = [];
  const removed: string[] = [];
  const changed: SpecDiff["changedSubcommands"] = [];

  for (const name of nextMap.keys()) if (!prevMap.has(name)) added.push(name);
  for (const name of prevMap.keys()) if (!nextMap.has(name)) removed.push(name);

  for (const [name, nsub] of nextMap) {
    const psub = prevMap.get(name);
    if (!psub) continue;
    const prevOpts = new Set(optionKeys(psub));
    const nextOpts = new Set(optionKeys(nsub));
    const addedOpts = [...nextOpts].filter((o) => !prevOpts.has(o));
    const removedOpts = [...prevOpts].filter((o) => !nextOpts.has(o));
    const descChanged = psub.description !== nsub.description;
    if (addedOpts.length || removedOpts.length || descChanged) {
      changed.push({ name, addedOptions: addedOpts, removedOptions: removedOpts, descriptionChanged: descChanged });
    }
  }

  return {
    addedSubcommands: added,
    removedSubcommands: removed,
    changedSubcommands: changed,
    hasChanges: added.length > 0 || removed.length > 0 || changed.length > 0,
  };
}

function section(title: string, items: string[], cls: string): string {
  if (items.length === 0) return "";
  return `<section><h2 class="${cls}">${title}</h2><ul>${items.map((i) => `<li><code>${i}</code></li>`).join("")}</ul></section>`;
}

export function renderChangelogHtml(diff: SpecDiff, spec: HookCliSpec): string {
  const templatePath = path.resolve(__dirname, "assets/changelog-template.html");
  const template = readFileSync(templatePath, "utf8");

  const changedHtml = diff.changedSubcommands
    .map(
      (c) =>
        `<section><h2 class="changed">Changed: <code>${c.name}</code></h2>` +
        (c.addedOptions.length ? `<p>Added options: ${c.addedOptions.map((o) => `<code>${o}</code>`).join(", ")}</p>` : "") +
        (c.removedOptions.length ? `<p>Removed options: ${c.removedOptions.map((o) => `<code>${o}</code>`).join(", ")}</p>` : "") +
        (c.descriptionChanged ? `<p>Description updated.</p>` : "") +
        `</section>`
    )
    .join("\n");

  const body =
    (diff.hasChanges
      ? section("Added subcommands", diff.addedSubcommands, "added") +
        section("Removed subcommands", diff.removedSubcommands, "removed") +
        changedHtml
      : `<p>No changes since last run.</p>`);

  return template
    .replace("{{generatedAt}}", spec.generatedAt)
    .replace("{{hookVersion}}", spec.hookVersion ?? "unknown")
    .replace("{{body}}", body);
}

export interface OpenOptions {
  autoOpen: boolean;
  platform?: NodeJS.Platform;
  spawn?: (cmd: string, args: string[]) => unknown;
}

export async function openInBrowser(url: string, opts: OpenOptions): Promise<void> {
  if (!opts.autoOpen) return;
  const platform = opts.platform ?? process.platform;
  const spawn = opts.spawn ?? ((cmd: string, args: string[]) => nodeSpawn(cmd, args, { detached: true, stdio: "ignore" }).unref());
  if (platform === "darwin") {
    spawn("open", [url]);
  } else if (platform === "win32") {
    spawn("cmd", ["/c", "start", url]);
  } else {
    spawn("xdg-open", [url]);
  }
}
