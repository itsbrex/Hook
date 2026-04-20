import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export interface RuntimeConfig {
  hookCli: string;
  bridgePort: number;
  skipRegen: boolean;
  changelogAutoOpen: boolean;
}

const DEFAULT_BRIDGE_PORT = 0;

// Fallback when no hook binary is found anywhere. exec will still try this
// via PATH — useful for containers/CI where PATH is populated lazily.
const FALLBACK_HOOK_CLI = "hook";

export interface HookResolverDeps {
  fileExists?: (p: string) => boolean;
  lookupOnPath?: () => string | null;
  candidates?: () => string[];
}

// Ordered list of common `hook` install locations on macOS. First hit wins.
// Covers:
//   - Homebrew Ruby (Apple Silicon at /opt/homebrew, Intel at /usr/local)
//   - macOS system Ruby wrappers in /usr/local/bin, /usr/bin
//   - `gem install --user-install` under ~/.gem
//   - Version managers: rbenv, asdf, chruby
//   - MacPorts
export function defaultCandidateHookPaths(home: string = os.homedir()): string[] {
  return [
    // Homebrew Ruby (Apple Silicon)
    "/opt/homebrew/bin/hook",
    "/opt/homebrew/lib/ruby/gems/4.0.0/bin/hook",
    "/opt/homebrew/lib/ruby/gems/3.4.0/bin/hook",
    "/opt/homebrew/lib/ruby/gems/3.3.0/bin/hook",
    "/opt/homebrew/lib/ruby/gems/3.2.0/bin/hook",
    // Homebrew Ruby (Intel) + sudo gem install wrappers
    "/usr/local/bin/hook",
    "/usr/local/lib/ruby/gems/4.0.0/bin/hook",
    "/usr/local/lib/ruby/gems/3.3.0/bin/hook",
    // macOS system Ruby
    "/usr/bin/hook",
    // gem install --user-install
    path.join(home, ".gem/ruby/2.6.0/bin/hook"),
    path.join(home, ".gem/ruby/3.0.0/bin/hook"),
    path.join(home, ".gem/ruby/3.2.0/bin/hook"),
    path.join(home, ".gem/ruby/3.3.0/bin/hook"),
    path.join(home, ".gem/ruby/3.4.0/bin/hook"),
    // Version managers
    path.join(home, ".rbenv/shims/hook"),
    path.join(home, ".asdf/shims/hook"),
    // MacPorts
    "/opt/local/bin/hook",
  ];
}

function defaultLookupOnPath(): string | null {
  try {
    const out = execSync("command -v hook", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      shell: "/bin/sh",
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

export function resolveHookCli(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  deps: HookResolverDeps = {}
): string {
  // 1. Explicit override always wins.
  if (env.HOOK_CLI && env.HOOK_CLI.length > 0) return env.HOOK_CLI;

  const fileExists = deps.fileExists ?? existsSync;
  const lookupOnPath = deps.lookupOnPath ?? defaultLookupOnPath;
  const candidates = deps.candidates ?? defaultCandidateHookPaths;

  // 2. PATH lookup — respects whatever Ruby manager the user has configured.
  const onPath = lookupOnPath();
  if (onPath && fileExists(onPath)) return onPath;

  // 3. Probe known install locations.
  for (const p of candidates()) {
    if (fileExists(p)) return p;
  }

  // 4. Fall back to bare `hook` so a later PATH change can still resolve.
  return FALLBACK_HOOK_CLI;
}

export function getConfig(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  deps: HookResolverDeps = {}
): RuntimeConfig {
  return {
    hookCli: resolveHookCli(env, deps),
    bridgePort: Number(env.HOOK_BRIDGE_PORT ?? DEFAULT_BRIDGE_PORT),
    skipRegen: env.HOOK_SKIP_REGEN === "1",
    changelogAutoOpen: env.HOOK_CHANGELOG_AUTO_OPEN !== "0",
  };
}
