# Hookmark MCP Feature-Gap Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three highest-priority gaps between the Hookmark CLI (currently wrapped by the MCP) and Hookmark's full capability surface (AppleScript dictionary, URL scheme) while preserving 100% backward compatibility with the existing 9 meta-tools, spec JSON shape, HTTP bridge routes, and v0.2.0 tool names.

**Architecture:** Extend the existing single-bridge / single-manual design. Introduce a typed `source` field on `HookSubcommand` ("cli" | "osascript"); the bridge dispatches CLI-sourced routes through `runHook` (unchanged) and osascript-sourced routes through a new `runOsascript` executor. A small TypeScript AppleScript template library lives next to the bridge and is shelled out via `osascript -ss` (structured output) with JSON parsing. Virtual AppleScript-backed subcommands are merged into the spec after `regenHookSpec` completes, so they appear to UTCP/OpenAPI exactly like native CLI subcommands. No new meta-tools, no new manuals, no changes to existing CLI route behavior.

**Tech Stack:** TypeScript 5.7, Node 22, Vitest, `@modelcontextprotocol/sdk`, `@utcp/code-mode`, `@utcp/sdk`, `@utcp/http`, `osascript` (macOS built-in), Zod 3.

---

## Backward-Compatibility Contract

Every task in this plan MUST preserve these invariants. Deviating is a plan failure.

1. All 9 existing MCP meta-tool names, signatures, and behaviors remain byte-identical.
2. All existing `POST /<subcommand>` bridge routes for CLI subcommands (`clip`, `link`, `list`, `find`, `from`, `clone`, `remove`, `percent_encode`, `percent_decode`, `select`, `browse`, `open`) keep their request/response shape.
3. `docs/reference/hook-cli-spec.json` remains valid as produced by the existing `regenHookSpec`; new `source` field is optional with default `"cli"`.
4. Existing vitest suites pass without modification.
5. `HOOK_CLI`, `HOOK_BRIDGE_PORT`, `HOOK_SKIP_REGEN`, `HOOK_CHANGELOG_AUTO_OPEN` env vars keep current semantics. New env vars (`HOOK_SKIP_APPLESCRIPT`) are additive and default to "feature on."
6. Package version bumps to **0.3.0** (additive features only — no removed tools).

---

## File Structure

**New files (created by this plan):**

- `src/osascript.ts` — Pure wrapper around `osascript -ss`. Escapes args, parses structured output, throws typed errors. Analogous to `src/hookCli.ts`.
- `src/applescript/templates.ts` — Static AppleScript source strings for each operation (all-bookmarks, get-tags, set-tags, make-bookmark, rename, hook-by-path, unhook-by-path, bookmarks-with-tags, from-active-window, by-request-handle, exists, count).
- `src/applescript/parse.ts` — Parsers for AppleScript `-ss` output → structured JS objects (records, lists, booleans).
- `src/applescript/subcommands.ts` — Builds `HookSubcommand[]` entries for the AppleScript-backed virtual subcommands (shape-compatible with `HookSubcommand` but `source: "osascript"`).
- `src/verboseParser.ts` — Parses `hook list --output_format=verbose` stdout into `{ name, address, path, hooked: [...] }` JSON structures.
- `tests/osascript.test.ts` — Unit tests for osascript wrapper (mocked exec).
- `tests/applescript/templates.test.ts` — Snapshot tests for generated AppleScript source.
- `tests/applescript/parse.test.ts` — AppleScript output parser tests.
- `tests/applescript/subcommands.test.ts` — Virtual-subcommand spec builder tests.
- `tests/verboseParser.test.ts` — Verbose-format parser tests.
- `tests/bridge.osascript.test.ts` — Bridge dispatch tests for osascript-sourced routes.

**Modified files:**

- `src/specTypes.ts` — Add optional `source?: "cli" | "osascript"` field to `HookSubcommand`; add `appleScriptSource?: string` and `appleScriptParser?: string` (parser key).
- `src/bridge.ts` — Branch on `sub.source === "osascript"` → call osascript executor; otherwise fall through to existing `runHook` path.
- `src/manualBuilder.ts` — Continue generating OpenAPI for all subcommands regardless of source (no change to shape, just inclusion of virtual ones).
- `src/index.ts` — Merge AppleScript subcommands into spec after `regenHookSpec` / `loadHookCliSpec`. Respect `HOOK_SKIP_APPLESCRIPT`.
- `src/config.ts` — Add `skipApplescript` to `RuntimeConfig` and parse `HOOK_SKIP_APPLESCRIPT`.
- `package.json` — Bump version to `0.3.0`.
- `README.md` — Document new subcommands, new env var, note required macOS Automation permission.

Each file has one responsibility; the `applescript/` subdirectory collects AppleScript concerns so `bridge.ts` stays focused on HTTP dispatch.

---

# PHASE 0 — Baseline Snapshot

Goal: Capture the v0.2.0 test baseline so Phase 5 can verify no regressions. Local artifact only — no code changes.

**Depends on:** Nothing.
**Unblocks:** Phase 5.5 (baseline diff).

---

### Task 0.1: Record v0.2.0 baseline

**Files:**
- Create: `tests/.baseline/v0.2.0.txt` (gitignored, local only)
- Modify: `.gitignore`

- [ ] **Step 1: Confirm clean working tree for src/ and tests/**

Run: `git status --short src/ tests/`
Expected: no output (no changes to src or tests).

- [ ] **Step 2: Run and record baseline**

```bash
mkdir -p tests/.baseline
bun test 2>&1 | tee tests/.baseline/v0.2.0.txt
node -e "console.log('version:', require('./package.json').version)" >> tests/.baseline/v0.2.0.txt
```

Expected: full vitest output written to file; trailing line like `version: 0.2.0`.

- [ ] **Step 3: Record pass count and file count**

Run: `grep -E "^ (Test Files|Tests)" tests/.baseline/v0.2.0.txt | tail -2`
Expected: two lines, e.g. `Test Files  8 passed (8)` / `Tests  NN passed (NN)`. Memorize these numbers — Task 5.5 checks against them.

- [ ] **Step 4: Gitignore the baseline directory**

Append to `.gitignore`:
```
# Local test baselines (for regression diffs)
tests/.baseline/
```

- [ ] **Step 5: Commit**

```bash
git add .gitignore
git commit -m "chore(tests): ignore local baseline snapshots"
```

No test/source code committed — only the ignore rule. Baseline file stays local.

---

# PHASE 1 — Foundation: osascript Executor

Goal: A tested, typed wrapper that runs arbitrary AppleScript with safe argument substitution and parses `osascript -ss` output. No bridge changes yet. Zero behavioral change for existing tools.

**Depends on:** Nothing.
**Unblocks:** All of Phase 2, Phase 3 AppleScript work, Phase 5 async-handle flow.

---

### Task 1.1: Scaffold `src/osascript.ts` with `shellEscapeArg`

**Files:**
- Create: `src/osascript.ts`
- Test:   `tests/osascript.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/osascript.test.ts
import { describe, it, expect } from "vitest";
import { shellEscapeArg } from "../src/osascript";

describe("shellEscapeArg", () => {
  it("wraps plain strings in single quotes", () => {
    expect(shellEscapeArg("hello")).toBe("'hello'");
  });

  it("escapes embedded single quotes", () => {
    expect(shellEscapeArg("it's fine")).toBe("'it'\\''s fine'");
  });

  it("handles empty string", () => {
    expect(shellEscapeArg("")).toBe("''");
  });

  it("handles paths with spaces", () => {
    expect(shellEscapeArg("/Users/me/My Docs/a.md")).toBe(
      "'/Users/me/My Docs/a.md'"
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/osascript.test.ts`
Expected: FAIL — `Cannot find module '../src/osascript'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/osascript.ts
export function shellEscapeArg(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/osascript.test.ts`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add src/osascript.ts tests/osascript.test.ts
git commit -m "feat(osascript): add shellEscapeArg helper"
```

---

### Task 1.2: Add `runOsascript` executor

**Files:**
- Modify: `src/osascript.ts`
- Test:   `tests/osascript.test.ts`

- [ ] **Step 1: Write the failing test — happy path**

Append to `tests/osascript.test.ts`:

```typescript
import { runOsascript, OsascriptError } from "../src/osascript";

describe("runOsascript", () => {
  it("executes a trivial AppleScript and returns stdout", () => {
    const out = runOsascript('return "hello"');
    expect(out.trim()).toBe('"hello"'); // -ss quotes strings
  });

  it("substitutes args via :arg1 :arg2 placeholders", () => {
    const out = runOsascript(
      'on run argv\n  return item 1 of argv & "-" & item 2 of argv\nend run',
      { args: ["foo", "bar"] }
    );
    expect(out.trim()).toBe('"foo-bar"');
  });

  it("throws OsascriptError with stderr on script failure", () => {
    expect(() => runOsascript('error "nope" number -128')).toThrow(
      OsascriptError
    );
  });

  it("preserves -1743 AppleEvents error messages", () => {
    try {
      runOsascript('tell application "NonexistentApp12345" to activate');
    } catch (e) {
      expect(e).toBeInstanceOf(OsascriptError);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/osascript.test.ts`
Expected: FAIL — `runOsascript` / `OsascriptError` undefined.

- [ ] **Step 3: Write implementation**

Replace `src/osascript.ts` contents with:

```typescript
import { execFileSync } from "node:child_process";

export function shellEscapeArg(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export class OsascriptError extends Error {
  public readonly stderr: string;
  public readonly stdout: string;
  public readonly code: number | null;
  public readonly hint?: string;

  constructor(message: string, stderr: string, stdout: string, code: number | null) {
    super(message);
    this.name = "OsascriptError";
    this.stderr = stderr;
    this.stdout = stdout;
    this.code = code;
    if (/-1743|Not authorized to send Apple events/i.test(stderr + message)) {
      this.hint =
        "macOS Automation permission required. Open System Settings > Privacy & Security > Automation and allow the process running this MCP server (Claude Code / Node) to control Hookmark.";
    }
  }
}

export interface RunOsascriptOptions {
  args?: string[];
  timeoutMs?: number;
}

export function runOsascript(
  script: string,
  opts: RunOsascriptOptions = {}
): string {
  const argv = ["-ss", "-e", script];
  if (opts.args && opts.args.length > 0) {
    argv.push("--");
    for (const a of opts.args) argv.push(a);
  }
  try {
    return execFileSync("/usr/bin/osascript", argv, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: opts.timeoutMs ?? 30_000,
    });
  } catch (err: unknown) {
    if (err && typeof err === "object") {
      const e = err as { stderr?: Buffer | string; stdout?: Buffer | string; status?: number | null; message?: string };
      const stderr = typeof e.stderr === "string" ? e.stderr : e.stderr?.toString("utf-8") ?? "";
      const stdout = typeof e.stdout === "string" ? e.stdout : e.stdout?.toString("utf-8") ?? "";
      const msg = (stderr || e.message || "osascript failed").trim();
      throw new OsascriptError(msg, stderr, stdout, e.status ?? null);
    }
    throw err;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/osascript.test.ts`
Expected: PASS (8/8). The `-1743` test may skip if Hookmark is not installed locally — that's acceptable because it only asserts `OsascriptError` is thrown, which will happen for any missing-app error.

- [ ] **Step 5: Commit**

```bash
git add src/osascript.ts tests/osascript.test.ts
git commit -m "feat(osascript): add runOsascript executor with typed error"
```

---

### Task 1.3: Extend `HookSubcommand` with optional `source` field

**Files:**
- Modify: `src/specTypes.ts`
- Test:   `tests/osascript.test.ts` (new describe block) OR new `tests/specTypes.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/specTypes.test.ts`:

```typescript
import { describe, it, expectTypeOf } from "vitest";
import type { HookSubcommand } from "../src/specTypes";

describe("HookSubcommand", () => {
  it("accepts source: 'cli' (backward compat — optional field)", () => {
    const s: HookSubcommand = {
      name: "clip",
      usage: "hook clip ITEM",
      description: "",
      options: [],
    };
    expectTypeOf(s).toMatchTypeOf<HookSubcommand>();
  });

  it("accepts source: 'osascript' with appleScriptSource + parser", () => {
    const s: HookSubcommand = {
      name: "all_bookmarks",
      usage: "hookmark all bookmarks",
      description: "Return every bookmark",
      options: [],
      source: "osascript",
      appleScriptSource: 'tell application "Hookmark" to return allBookmarks',
      appleScriptParser: "bookmark_list",
    };
    expectTypeOf(s).toMatchTypeOf<HookSubcommand>();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/specTypes.test.ts`
Expected: FAIL — type errors on `source`, `appleScriptSource`, `appleScriptParser`.

- [ ] **Step 3: Modify `src/specTypes.ts`**

Replace contents with:

```typescript
export interface HookOption {
  short: string | null;
  long: string | null;
  description: string;
  valueArg: string | null;
}

export type HookSubcommandSource = "cli" | "osascript";

export interface HookSubcommand {
  name: string;
  usage: string;
  description: string;
  options: HookOption[];
  cliArgs?: string[];
  aliases?: string[];
  /** Dispatch backend. Defaults to "cli" when absent. */
  source?: HookSubcommandSource;
  /** AppleScript source, used when source === "osascript". */
  appleScriptSource?: string;
  /** Name of the parser in src/applescript/parse.ts to apply to stdout. */
  appleScriptParser?: string;
}

export interface HookCliSpec {
  generatedAt: string;
  hookVersion: string | null;
  subcommands: HookSubcommand[];
}
```

- [ ] **Step 4: Run tests — specTypes + existing suites**

Run: `npx vitest run tests/specTypes.test.ts tests/bridge.test.ts tests/regenHookSpec.test.ts tests/manualBuilder.test.ts`
Expected: PASS. All existing tests still pass — `source` is optional.

- [ ] **Step 5: Commit**

```bash
git add src/specTypes.ts tests/specTypes.test.ts
git commit -m "feat(spec): add optional source field to HookSubcommand"
```

---

### Task 1.4: Add `skipApplescript` to runtime config

**Files:**
- Modify: `src/config.ts`
- Test:   `tests/config.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/config.test.ts`:

```typescript
describe("config.skipApplescript", () => {
  it("defaults to false when HOOK_SKIP_APPLESCRIPT is unset", () => {
    const cfg = getConfig({}, { fileExists: () => true, lookupOnPath: () => "/usr/bin/hook", candidates: () => [] });
    expect(cfg.skipApplescript).toBe(false);
  });

  it("is true when HOOK_SKIP_APPLESCRIPT=1", () => {
    const cfg = getConfig(
      { HOOK_SKIP_APPLESCRIPT: "1" },
      { fileExists: () => true, lookupOnPath: () => "/usr/bin/hook", candidates: () => [] }
    );
    expect(cfg.skipApplescript).toBe(true);
  });

  it("is false for HOOK_SKIP_APPLESCRIPT=0 (explicit off)", () => {
    const cfg = getConfig(
      { HOOK_SKIP_APPLESCRIPT: "0" },
      { fileExists: () => true, lookupOnPath: () => "/usr/bin/hook", candidates: () => [] }
    );
    expect(cfg.skipApplescript).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config.test.ts`
Expected: FAIL — `skipApplescript` undefined on RuntimeConfig.

- [ ] **Step 3: Modify `src/config.ts`**

In `RuntimeConfig`, add `skipApplescript: boolean;`.

In `getConfig`, add:

```typescript
skipApplescript: env.HOOK_SKIP_APPLESCRIPT === "1",
```

to the returned object.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/config.test.ts`
Expected: PASS (including new cases + all prior config tests).

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat(config): add HOOK_SKIP_APPLESCRIPT opt-out flag"
```

---

### Task 1.5: Wire bridge dispatch to recognize `source === "osascript"`

**Files:**
- Modify: `src/bridge.ts`
- Test:   `tests/bridge.osascript.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/bridge.osascript.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { createBridgeServer } from "../src/bridge";
import type { HookCliSpec } from "../src/specTypes";

const SPEC: HookCliSpec = {
  generatedAt: "2026-04-22T00:00:00.000Z",
  hookVersion: "2.1.3",
  subcommands: [
    {
      name: "all_bookmarks",
      usage: "all_bookmarks",
      description: "Return all bookmarks from Hookmark.",
      options: [],
      source: "osascript",
      appleScriptSource: 'tell application "Hookmark" to return ""',
      appleScriptParser: "raw",
    },
  ],
};

describe("bridge (osascript source)", () => {
  it("routes osascript subcommands through the osascript executor, not runHook", async () => {
    const runHook = vi.fn(() => "SHOULD NOT BE CALLED");
    const runOsascript = vi.fn(() => '"ok"');
    const { listen, close } = createBridgeServer({
      spec: SPEC,
      hookCli: "/opt/bin/hook",
      runHook,
      runOsascript,
      getChangelogHtml: () => "",
    });
    const port = await listen(0);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/all_bookmarks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(res.status).toBe(200);
      expect(runHook).not.toHaveBeenCalled();
      expect(runOsascript).toHaveBeenCalledOnce();
    } finally {
      await close();
    }
  });

  it("surfaces osascript errors with -1743 hint", async () => {
    const runOsascript = vi.fn(() => {
      throw Object.assign(new Error("execution error: Not authorized to send Apple events (-1743)"), { name: "OsascriptError" });
    });
    const { listen, close } = createBridgeServer({
      spec: SPEC,
      hookCli: "/opt/bin/hook",
      runHook: vi.fn(),
      runOsascript,
      getChangelogHtml: () => "",
    });
    const port = await listen(0);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/all_bookmarks`, { method: "POST", body: "{}" });
      expect(res.status).toBe(500);
      const body = (await res.json()) as { error: string; hint?: string };
      expect(body.hint).toContain("Automation");
    } finally {
      await close();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/bridge.osascript.test.ts`
Expected: FAIL — `createBridgeServer` does not accept `runOsascript`.

- [ ] **Step 3: Modify `src/bridge.ts`**

Update the `BridgeOptions` interface:

```typescript
export interface BridgeOptions {
  spec: HookCliSpec;
  hookCli: string;
  runHook: (hookCli: string, args: string[]) => string;
  runOsascript?: (script: string, args: string[]) => string;
  getChangelogHtml: () => string;
}
```

In the `POST` handler, before the existing `bodyToArgs` call, add:

```typescript
if (sub.source === "osascript") {
  if (!opts.runOsascript) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: `osascript executor not wired for '${sub.name}'` }));
    return;
  }
  try {
    const positionals = extractPositionals(sub.usage);
    const argsList: string[] = [];
    for (const p of positionals) {
      const v = argsInput[p.name.toLowerCase()];
      if (Array.isArray(v)) {
        for (const item of v) if (typeof item === "string") argsList.push(item);
      } else if (typeof v === "string") {
        argsList.push(v);
      }
    }
    const output = opts.runOsascript(sub.appleScriptSource ?? "", argsList);
    res.end(JSON.stringify({ output }));
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    const hint = (e as { hint?: string })?.hint;
    const isAuthError = /-1743|Not authorized to send Apple events/i.test(message);
    const payload: Record<string, string> = { error: message };
    if (hint) payload.hint = hint;
    else if (isAuthError) {
      payload.hint =
        "macOS Automation permission required. Open System Settings > Privacy & Security > Automation and allow the process running this MCP server (Claude Code / Node) to control Hookmark.";
    }
    res.statusCode = 500;
    res.end(JSON.stringify(payload));
  }
  return;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run`
Expected: PASS for every test, including all prior bridge tests.

- [ ] **Step 5: Commit**

```bash
git add src/bridge.ts tests/bridge.osascript.test.ts
git commit -m "feat(bridge): dispatch osascript-sourced subcommands"
```

---

### Task 1.6: Probe Hookmark Automation capability at startup

**Files:**
- Modify: `src/osascript.ts` (add `probeHookmark`)
- Create: `tests/osascript.probe.test.ts`
- Modify: `src/index.ts` (invoke probe, override `skipApplescript` on failure)

Rationale: AppleScript → Hookmark throws `-1743` when macOS Automation permission is denied and `-600` when Hookmark is not running. Without a probe, first-use failures are opaque to MCP clients. This task makes the feature self-disabling when the environment can't support it and surfaces a helpful stderr message.

- [ ] **Step 1: Write the failing test**

Create `tests/osascript.probe.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { probeHookmark } from "../src/osascript";

describe("probeHookmark", () => {
  it("returns { ok: true } when osascript exits 0", async () => {
    const fakeExec = vi.fn().mockResolvedValue({ stdout: "42\n", stderr: "" });
    const result = await probeHookmark({ exec: fakeExec });
    expect(result.ok).toBe(true);
  });

  it("returns { ok: false, reason: 'permission' } on -1743", async () => {
    const fakeExec = vi.fn().mockRejectedValue(
      Object.assign(new Error("stderr"), {
        stderr: "execution error: Not authorized to send Apple events (-1743).",
      })
    );
    const result = await probeHookmark({ exec: fakeExec });
    expect(result).toMatchObject({ ok: false, reason: "permission" });
  });

  it("returns { ok: false, reason: 'not_running' } when Hookmark is not running", async () => {
    const fakeExec = vi.fn().mockRejectedValue(
      Object.assign(new Error("stderr"), {
        stderr: "Application isn't running. (-600)",
      })
    );
    const result = await probeHookmark({ exec: fakeExec });
    expect(result).toMatchObject({ ok: false, reason: "not_running" });
  });

  it("returns { ok: false, reason: 'unknown' } on other errors", async () => {
    const fakeExec = vi.fn().mockRejectedValue(
      Object.assign(new Error("boom"), { stderr: "weird failure" })
    );
    const result = await probeHookmark({ exec: fakeExec });
    expect(result.ok).toBe(false);
    expect((result as { reason: string }).reason).toBe("unknown");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/osascript.probe.test.ts`
Expected: FAIL — `probeHookmark` not exported.

- [ ] **Step 3: Write implementation**

Append to `src/osascript.ts`:

```typescript
export type ProbeResult =
  | { ok: true }
  | {
      ok: false;
      reason: "permission" | "not_running" | "unknown";
      detail?: string;
    };

export interface ProbeOptions {
  exec?: (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;
}

export async function probeHookmark(opts: ProbeOptions = {}): Promise<ProbeResult> {
  const exec = opts.exec ?? defaultExec;
  try {
    await exec("osascript", [
      "-e",
      'tell application "Hookmark" to count bookmarks',
    ]);
    return { ok: true };
  } catch (err: unknown) {
    const stderr =
      (err as { stderr?: string }).stderr ?? (err instanceof Error ? err.message : String(err));
    if (stderr.includes("-1743") || /not authorized/i.test(stderr)) {
      return { ok: false, reason: "permission", detail: stderr.trim() };
    }
    if (stderr.includes("-600") || /isn.?t running/i.test(stderr)) {
      return { ok: false, reason: "not_running", detail: stderr.trim() };
    }
    return { ok: false, reason: "unknown", detail: stderr.trim() };
  }
}
```

(`defaultExec` is the `promisify(execFile)` wrapper introduced in Task 1.2. Reuse — do not re-create.)

- [ ] **Step 4: Run probe test**

Run: `npx vitest run tests/osascript.probe.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Wire probe into startup in `src/index.ts`**

Insert after `loadHookCliSpec(...)` / `regenHookSpec(...)`, **before** the call to `mergeAppleScriptSubcommands(...)` added in Task 3.3:

```typescript
if (!config.skipApplescript) {
  const probe = await probeHookmark();
  if (!probe.ok) {
    const hint =
      probe.reason === "permission"
        ? " — grant Automation permission: System Settings → Privacy & Security → Automation → <terminal app> → Hookmark"
        : probe.reason === "not_running"
        ? " — launch Hookmark.app to enable AppleScript-backed subcommands"
        : "";
    console.error(`[hook] AppleScript disabled: ${probe.reason}${hint}`);
    config.skipApplescript = true;
  }
}
```

- [ ] **Step 6: Confirm full suite still green**

Run: `bun test`
Expected: every existing test plus the 4 new probe tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/osascript.ts src/index.ts tests/osascript.probe.test.ts
git commit -m "feat(osascript): probe Hookmark capability, degrade gracefully on -1743/-600"
```

**Downstream effect on later tasks:**
- Task 3.3 `mergeAppleScriptSubcommands(spec, skip)` already reads `config.skipApplescript`; probe now flips it at runtime in addition to env var.
- Task 5.4 smoke test should add a case: "when Hookmark is not running, AppleScript routes are absent from OpenAPI."
- Task 5.2 README note becomes: "AppleScript subcommands auto-disable if Automation permission is denied or Hookmark is not running — check server stderr on startup."

---

# PHASE 2 — AppleScript Templates & Parsers

Goal: Build the AppleScript source-string library + stdout parsers. No bridge wiring, no subcommand registration yet — this phase is pure data/logic, testable in isolation.

**Depends on:** Phase 1 (types + executor).
**Unblocks:** Phase 3 (virtual-subcommand registration).

---

### Task 2.1: AppleScript parser — `parseAppleScriptLiteral` for primitives

**Files:**
- Create: `src/applescript/parse.ts`
- Test:   `tests/applescript/parse.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/applescript/parse.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseAppleScriptLiteral } from "../../src/applescript/parse";

describe("parseAppleScriptLiteral", () => {
  it('parses a quoted string: "hello" → "hello"', () => {
    expect(parseAppleScriptLiteral('"hello"')).toBe("hello");
  });

  it('unescapes quoted strings: "it\\"s" → "it\\"s"', () => {
    expect(parseAppleScriptLiteral('"it\\"s"')).toBe('it"s');
  });

  it("parses integers", () => {
    expect(parseAppleScriptLiteral("42")).toBe(42);
  });

  it("parses booleans", () => {
    expect(parseAppleScriptLiteral("true")).toBe(true);
    expect(parseAppleScriptLiteral("false")).toBe(false);
  });

  it("parses missing value → null", () => {
    expect(parseAppleScriptLiteral("missing value")).toBeNull();
  });

  it("parses empty list", () => {
    expect(parseAppleScriptLiteral("{}")).toEqual([]);
  });

  it("parses flat list of strings", () => {
    expect(parseAppleScriptLiteral('{"a", "b", "c"}')).toEqual(["a", "b", "c"]);
  });

  it("parses flat list of integers", () => {
    expect(parseAppleScriptLiteral("{1, 2, 3}")).toEqual([1, 2, 3]);
  });

  it("trims trailing whitespace/newline", () => {
    expect(parseAppleScriptLiteral('"hi"\n')).toBe("hi");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/applescript/parse.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```typescript
// src/applescript/parse.ts

/**
 * Parse a scalar or list literal emitted by `osascript -ss`.
 * Handles: quoted strings (with \" and \\ escapes), integers, booleans,
 * "missing value", and flat lists of the above.
 */
export function parseAppleScriptLiteral(raw: string): unknown {
  const s = raw.trim();
  if (s === "") return null;
  if (s === "missing value") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  if (/^-?\d+$/.test(s)) return Number(s);
  if (/^-?\d+\.\d+$/.test(s)) return Number(s);
  if (s.startsWith('"') && s.endsWith('"')) {
    return unescapeAppleScriptString(s.slice(1, -1));
  }
  if (s.startsWith("{") && s.endsWith("}")) {
    return parseList(s.slice(1, -1));
  }
  return s;
}

function unescapeAppleScriptString(inner: string): string {
  let out = "";
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === "\\" && i + 1 < inner.length) {
      const next = inner[i + 1];
      if (next === '"') { out += '"'; i++; continue; }
      if (next === "\\") { out += "\\"; i++; continue; }
      if (next === "n") { out += "\n"; i++; continue; }
      if (next === "t") { out += "\t"; i++; continue; }
    }
    out += c;
  }
  return out;
}

function parseList(body: string): unknown[] {
  if (body.trim() === "") return [];
  const items: string[] = [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (escape) { escape = false; continue; }
    if (c === "\\") { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === "," && depth === 0) {
      items.push(body.slice(start, i));
      start = i + 1;
    }
  }
  items.push(body.slice(start));
  return items.map((p) => parseAppleScriptLiteral(p.trim()));
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/applescript/parse.test.ts`
Expected: PASS (9/9).

- [ ] **Step 5: Commit**

```bash
git add src/applescript/parse.ts tests/applescript/parse.test.ts
git commit -m "feat(applescript): add literal parser for -ss output"
```

---

### Task 2.2: Record parser — `parseAppleScriptRecord` for `{name:"…", path:"…"}`

**Files:**
- Modify: `src/applescript/parse.ts`
- Test:   `tests/applescript/parse.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/applescript/parse.test.ts`:

```typescript
import { parseAppleScriptRecord } from "../../src/applescript/parse";

describe("parseAppleScriptRecord", () => {
  it("parses simple record", () => {
    const input = '{name:"note", path:"/a.md"}';
    expect(parseAppleScriptRecord(input)).toEqual({
      name: "note",
      path: "/a.md",
    });
  });

  it("parses record with quoted keys and nested list", () => {
    const input = '{name:"x", tags:{"one","two"}}';
    expect(parseAppleScriptRecord(input)).toEqual({
      name: "x",
      tags: ["one", "two"],
    });
  });

  it("handles record with missing values", () => {
    const input = '{name:"x", address:missing value}';
    expect(parseAppleScriptRecord(input)).toEqual({
      name: "x",
      address: null,
    });
  });

  it("handles string values containing commas and colons", () => {
    const input = '{name:"hello, world: v2", path:"/a"}';
    expect(parseAppleScriptRecord(input)).toEqual({
      name: "hello, world: v2",
      path: "/a",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/applescript/parse.test.ts`
Expected: FAIL — `parseAppleScriptRecord` not exported.

- [ ] **Step 3: Modify `src/applescript/parse.ts`**

Append:

```typescript
export function parseAppleScriptRecord(raw: string): Record<string, unknown> {
  const s = raw.trim();
  if (!s.startsWith("{") || !s.endsWith("}")) {
    throw new Error(`Not a record literal: ${s.slice(0, 40)}...`);
  }
  const body = s.slice(1, -1);
  const out: Record<string, unknown> = {};
  const pairs = splitTopLevel(body, ",");
  for (const pair of pairs) {
    const idx = findTopLevelColon(pair);
    if (idx < 0) continue;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    out[key] = parseAppleScriptLiteral(value);
  }
  return out;
}

function splitTopLevel(body: string, sep: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (escape) { escape = false; continue; }
    if (c === "\\") { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === sep && depth === 0) {
      items.push(body.slice(start, i));
      start = i + 1;
    }
  }
  items.push(body.slice(start));
  return items.map((s) => s.trim()).filter((s) => s.length > 0);
}

function findTopLevelColon(s: string): number {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) { escape = false; continue; }
    if (c === "\\") { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ":" && depth === 0) return i;
  }
  return -1;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/applescript/parse.test.ts`
Expected: PASS (13/13).

- [ ] **Step 5: Commit**

```bash
git add src/applescript/parse.ts tests/applescript/parse.test.ts
git commit -m "feat(applescript): add record parser"
```

---

### Task 2.3: Named parsers registry — bookmark / bookmark_list / tag_list / raw / boolean / integer

**Files:**
- Modify: `src/applescript/parse.ts`
- Test:   `tests/applescript/parse.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```typescript
import { runNamedParser } from "../../src/applescript/parse";

describe("runNamedParser", () => {
  it("'raw' returns trimmed string as-is", () => {
    expect(runNamedParser("raw", '"some raw"\n')).toBe('"some raw"');
  });

  it("'boolean' parses true/false", () => {
    expect(runNamedParser("boolean", "true")).toBe(true);
    expect(runNamedParser("boolean", "false")).toBe(false);
  });

  it("'integer' parses numeric literal", () => {
    expect(runNamedParser("integer", "42")).toBe(42);
  });

  it("'tag_list' parses list of strings", () => {
    expect(runNamedParser("tag_list", '{"work", "todo"}')).toEqual([
      "work",
      "todo",
    ]);
  });

  it("'bookmark' parses a record", () => {
    expect(
      runNamedParser("bookmark", '{name:"n", path:"/a", address:"file:///a"}')
    ).toEqual({ name: "n", path: "/a", address: "file:///a" });
  });

  it("'bookmark_list' parses a list of records", () => {
    const s = '{{name:"a", path:"/a"}, {name:"b", path:"/b"}}';
    expect(runNamedParser("bookmark_list", s)).toEqual([
      { name: "a", path: "/a" },
      { name: "b", path: "/b" },
    ]);
  });

  it("throws for unknown parser names", () => {
    expect(() => runNamedParser("zzz", "")).toThrow(/Unknown parser/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/applescript/parse.test.ts`
Expected: FAIL — `runNamedParser` not exported.

- [ ] **Step 3: Modify `src/applescript/parse.ts`**

Append:

```typescript
export type NamedParser =
  | "raw"
  | "boolean"
  | "integer"
  | "tag_list"
  | "bookmark"
  | "bookmark_list";

export function runNamedParser(name: string, raw: string): unknown {
  const trimmed = raw.trim();
  switch (name) {
    case "raw":
      return trimmed;
    case "boolean":
      return parseAppleScriptLiteral(trimmed);
    case "integer":
      return parseAppleScriptLiteral(trimmed);
    case "tag_list":
      return parseAppleScriptLiteral(trimmed);
    case "bookmark":
      return parseAppleScriptRecord(trimmed);
    case "bookmark_list": {
      if (trimmed === "{}" || trimmed === "") return [];
      if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
        throw new Error(`bookmark_list expected list literal: ${trimmed.slice(0, 40)}...`);
      }
      const body = trimmed.slice(1, -1);
      return splitTopLevel(body, ",").map((item) => parseAppleScriptRecord(item));
    }
    default:
      throw new Error(`Unknown parser: ${name}`);
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/applescript/parse.test.ts`
Expected: PASS (20/20).

- [ ] **Step 5: Commit**

```bash
git add src/applescript/parse.ts tests/applescript/parse.test.ts
git commit -m "feat(applescript): add named parser registry"
```

---

### Task 2.4: AppleScript templates — bookmark enumeration & structured access

**Files:**
- Create: `src/applescript/templates.ts`
- Test:   `tests/applescript/templates.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/applescript/templates.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  TEMPLATE_ALL_BOOKMARKS,
  TEMPLATE_BOOKMARK_BY_PATH,
  TEMPLATE_COUNT_BOOKMARKS,
  TEMPLATE_EXISTS_BOOKMARK,
} from "../../src/applescript/templates";

describe("AppleScript templates — read / structured", () => {
  it("TEMPLATE_ALL_BOOKMARKS targets Hookmark + returns a list record", () => {
    expect(TEMPLATE_ALL_BOOKMARKS).toContain('tell application "Hookmark"');
    expect(TEMPLATE_ALL_BOOKMARKS).toContain("every bookmark");
    expect(TEMPLATE_ALL_BOOKMARKS).toContain("name:");
    expect(TEMPLATE_ALL_BOOKMARKS).toContain("path:");
    expect(TEMPLATE_ALL_BOOKMARKS).toContain("address:");
  });

  it("TEMPLATE_BOOKMARK_BY_PATH accepts one positional arg", () => {
    expect(TEMPLATE_BOOKMARK_BY_PATH).toContain('tell application "Hookmark"');
    expect(TEMPLATE_BOOKMARK_BY_PATH).toContain("on run argv");
    expect(TEMPLATE_BOOKMARK_BY_PATH).toContain("item 1 of argv");
  });

  it("TEMPLATE_COUNT_BOOKMARKS returns an integer", () => {
    expect(TEMPLATE_COUNT_BOOKMARKS).toContain('tell application "Hookmark"');
    expect(TEMPLATE_COUNT_BOOKMARKS).toContain("count");
  });

  it("TEMPLATE_EXISTS_BOOKMARK accepts one positional arg", () => {
    expect(TEMPLATE_EXISTS_BOOKMARK).toContain("on run argv");
    expect(TEMPLATE_EXISTS_BOOKMARK).toContain("exists");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/applescript/templates.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```typescript
// src/applescript/templates.ts

export const TEMPLATE_ALL_BOOKMARKS = `
tell application "Hookmark"
  set bmList to every bookmark
  set out to {}
  repeat with b in bmList
    try
      set bName to name of b
    on error
      set bName to ""
    end try
    try
      set bPath to path of b
    on error
      set bPath to ""
    end try
    try
      set bAddr to address of b
    on error
      set bAddr to ""
    end try
    set end of out to {name:bName, path:bPath, address:bAddr}
  end repeat
  return out
end tell
`.trim();

export const TEMPLATE_BOOKMARK_BY_PATH = `
on run argv
  set targetPath to item 1 of argv
  tell application "Hookmark"
    set b to bookmark from targetPath
    return {name:(name of b), path:(path of b), address:(address of b)}
  end tell
end run
`.trim();

export const TEMPLATE_COUNT_BOOKMARKS = `
tell application "Hookmark"
  return count of bookmarks
end tell
`.trim();

export const TEMPLATE_EXISTS_BOOKMARK = `
on run argv
  set targetPath to item 1 of argv
  tell application "Hookmark"
    try
      set b to bookmark from targetPath
      return true
    on error
      return false
    end try
  end tell
end run
`.trim();
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/applescript/templates.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add src/applescript/templates.ts tests/applescript/templates.test.ts
git commit -m "feat(applescript): add read/structured-access templates"
```

---

### Task 2.5: AppleScript templates — tags (get/set/add/remove) and bookmarks with tags

**Files:**
- Modify: `src/applescript/templates.ts`
- Test:   `tests/applescript/templates.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```typescript
import {
  TEMPLATE_GET_TAGS,
  TEMPLATE_SET_TAGS,
  TEMPLATE_ADD_TAGS,
  TEMPLATE_REMOVE_TAGS,
  TEMPLATE_BOOKMARKS_WITH_TAGS,
} from "../../src/applescript/templates";

describe("AppleScript templates — tags", () => {
  it("TEMPLATE_GET_TAGS reads bookmark.tags for a path arg", () => {
    expect(TEMPLATE_GET_TAGS).toContain("on run argv");
    expect(TEMPLATE_GET_TAGS).toContain("tags of");
  });

  it("TEMPLATE_SET_TAGS writes bookmark.tags for path + csv args", () => {
    expect(TEMPLATE_SET_TAGS).toContain("on run argv");
    expect(TEMPLATE_SET_TAGS).toContain("set tags of");
  });

  it("TEMPLATE_ADD_TAGS union-merges", () => {
    expect(TEMPLATE_ADD_TAGS).toContain("on run argv");
    expect(TEMPLATE_ADD_TAGS).toContain("tags of");
  });

  it("TEMPLATE_REMOVE_TAGS filters given tags out", () => {
    expect(TEMPLATE_REMOVE_TAGS).toContain("on run argv");
    expect(TEMPLATE_REMOVE_TAGS).toContain("tags of");
  });

  it("TEMPLATE_BOOKMARKS_WITH_TAGS accepts csv args and returns list", () => {
    expect(TEMPLATE_BOOKMARKS_WITH_TAGS).toContain("on run argv");
    expect(TEMPLATE_BOOKMARKS_WITH_TAGS).toContain("bookmarks with tags");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/applescript/templates.test.ts`
Expected: FAIL — symbols not exported.

- [ ] **Step 3: Append to `src/applescript/templates.ts`**

```typescript
export const TEMPLATE_GET_TAGS = `
on run argv
  set targetPath to item 1 of argv
  tell application "Hookmark"
    set b to bookmark from targetPath
    return tags of b
  end tell
end run
`.trim();

export const TEMPLATE_SET_TAGS = `
on run argv
  set targetPath to item 1 of argv
  set csv to item 2 of argv
  set AppleScript's text item delimiters to ","
  set tagList to text items of csv
  set AppleScript's text item delimiters to ""
  tell application "Hookmark"
    set b to bookmark from targetPath
    set tags of b to tagList
    return tags of b
  end tell
end run
`.trim();

export const TEMPLATE_ADD_TAGS = `
on run argv
  set targetPath to item 1 of argv
  set csv to item 2 of argv
  set AppleScript's text item delimiters to ","
  set addList to text items of csv
  set AppleScript's text item delimiters to ""
  tell application "Hookmark"
    set b to bookmark from targetPath
    set existing to tags of b
    set merged to existing
    repeat with t in addList
      if merged does not contain t then set end of merged to (t as string)
    end repeat
    set tags of b to merged
    return tags of b
  end tell
end run
`.trim();

export const TEMPLATE_REMOVE_TAGS = `
on run argv
  set targetPath to item 1 of argv
  set csv to item 2 of argv
  set AppleScript's text item delimiters to ","
  set removeList to text items of csv
  set AppleScript's text item delimiters to ""
  tell application "Hookmark"
    set b to bookmark from targetPath
    set existing to tags of b
    set kept to {}
    repeat with t in existing
      set tStr to t as string
      if removeList does not contain tStr then set end of kept to tStr
    end repeat
    set tags of b to kept
    return tags of b
  end tell
end run
`.trim();

export const TEMPLATE_BOOKMARKS_WITH_TAGS = `
on run argv
  set csv to item 1 of argv
  set AppleScript's text item delimiters to ","
  set tagList to text items of csv
  set AppleScript's text item delimiters to ""
  tell application "Hookmark"
    set bmList to bookmarks with tags tagList
    set out to {}
    repeat with b in bmList
      set end of out to {name:(name of b), path:(path of b), address:(address of b)}
    end repeat
    return out
  end tell
end run
`.trim();
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/applescript/templates.test.ts`
Expected: PASS (9/9).

- [ ] **Step 5: Commit**

```bash
git add src/applescript/templates.ts tests/applescript/templates.test.ts
git commit -m "feat(applescript): add tag read/write and bookmarks-with-tags templates"
```

---

### Task 2.6: AppleScript templates — rename, make, hook/unhook, from active window, by-handle

**Files:**
- Modify: `src/applescript/templates.ts`
- Test:   `tests/applescript/templates.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```typescript
import {
  TEMPLATE_RENAME_BOOKMARK,
  TEMPLATE_MAKE_BOOKMARK,
  TEMPLATE_HOOK_BOOKMARKS,
  TEMPLATE_UNHOOK_BOOKMARKS,
  TEMPLATE_FROM_ACTIVE_WINDOW,
  TEMPLATE_BY_REQUEST_HANDLE,
} from "../../src/applescript/templates";

describe("AppleScript templates — write/commands", () => {
  it("TEMPLATE_RENAME_BOOKMARK sets name of bookmark from argv", () => {
    expect(TEMPLATE_RENAME_BOOKMARK).toContain("on run argv");
    expect(TEMPLATE_RENAME_BOOKMARK).toContain("set name of");
  });

  it("TEMPLATE_MAKE_BOOKMARK creates with name+address+tags", () => {
    expect(TEMPLATE_MAKE_BOOKMARK).toContain("on run argv");
    expect(TEMPLATE_MAKE_BOOKMARK).toContain("make new bookmark");
  });

  it("TEMPLATE_HOOK_BOOKMARKS hooks two paths", () => {
    expect(TEMPLATE_HOOK_BOOKMARKS).toContain("on run argv");
    expect(TEMPLATE_HOOK_BOOKMARKS).toContain("hook");
  });

  it("TEMPLATE_UNHOOK_BOOKMARKS unhooks two paths", () => {
    expect(TEMPLATE_UNHOOK_BOOKMARKS).toContain("on run argv");
    expect(TEMPLATE_UNHOOK_BOOKMARKS).toContain("unhook");
  });

  it("TEMPLATE_FROM_ACTIVE_WINDOW returns bookmark or handle", () => {
    expect(TEMPLATE_FROM_ACTIVE_WINDOW).toContain('tell application "Hookmark"');
    expect(TEMPLATE_FROM_ACTIVE_WINDOW).toContain("bookmark from active window");
  });

  it("TEMPLATE_BY_REQUEST_HANDLE resolves handle by id", () => {
    expect(TEMPLATE_BY_REQUEST_HANDLE).toContain("on run argv");
    expect(TEMPLATE_BY_REQUEST_HANDLE).toContain("bookmark by request handle");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/applescript/templates.test.ts`
Expected: FAIL — symbols not exported.

- [ ] **Step 3: Append to `src/applescript/templates.ts`**

```typescript
export const TEMPLATE_RENAME_BOOKMARK = `
on run argv
  set targetPath to item 1 of argv
  set newName to item 2 of argv
  tell application "Hookmark"
    set b to bookmark from targetPath
    set name of b to newName
    return {name:(name of b), path:(path of b), address:(address of b)}
  end tell
end run
`.trim();

export const TEMPLATE_MAKE_BOOKMARK = `
on run argv
  set bName to item 1 of argv
  set bAddr to item 2 of argv
  set tagCsv to ""
  try
    set tagCsv to item 3 of argv
  end try
  set AppleScript's text item delimiters to ","
  if tagCsv is "" then
    set tagList to {}
  else
    set tagList to text items of tagCsv
  end if
  set AppleScript's text item delimiters to ""
  tell application "Hookmark"
    if (count of tagList) > 0 then
      set b to make new bookmark with properties {name:bName, address:bAddr, tags:tagList}
    else
      set b to make new bookmark with properties {name:bName, address:bAddr}
    end if
    return {name:(name of b), path:(path of b), address:(address of b)}
  end tell
end run
`.trim();

export const TEMPLATE_HOOK_BOOKMARKS = `
on run argv
  set pathA to item 1 of argv
  set pathB to item 2 of argv
  tell application "Hookmark"
    set bA to bookmark from pathA
    set bB to bookmark from pathB
    hook bA and bB
    return "ok"
  end tell
end run
`.trim();

export const TEMPLATE_UNHOOK_BOOKMARKS = `
on run argv
  set pathA to item 1 of argv
  set pathB to item 2 of argv
  tell application "Hookmark"
    set bA to bookmark from pathA
    set bB to bookmark from pathB
    unhook bA and bB
    return "ok"
  end tell
end run
`.trim();

export const TEMPLATE_FROM_ACTIVE_WINDOW = `
tell application "Hookmark"
  set result to bookmark from active window
  try
    set bm to result
    return {kind:"bookmark", name:(name of bm), path:(path of bm), address:(address of bm)}
  on error
    try
      set handleId to id of result
      return {kind:"request_handle", handle:(handleId as string)}
    on error
      return {kind:"unknown"}
    end try
  end try
end tell
`.trim();

export const TEMPLATE_BY_REQUEST_HANDLE = `
on run argv
  set handleId to item 1 of argv
  tell application "Hookmark"
    set b to bookmark by request handle handleId
    return {name:(name of b), path:(path of b), address:(address of b)}
  end tell
end run
`.trim();
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/applescript/templates.test.ts`
Expected: PASS (15/15).

- [ ] **Step 5: Commit**

```bash
git add src/applescript/templates.ts tests/applescript/templates.test.ts
git commit -m "feat(applescript): add write/command/async-handle templates"
```

---

# PHASE 3 — Virtual-Subcommand Registration

Goal: Wire the templates + parsers into `HookSubcommand` entries and merge them into the spec, so they appear in the OpenAPI manual and are dispatched by the bridge (via the Phase 1 wiring).

**Depends on:** Phase 1 (types + bridge dispatch), Phase 2 (templates + parsers).
**Unblocks:** Phase 4 (executor wiring in index.ts), user-facing availability.

---

### Task 3.1: Build `buildAppleScriptSubcommands()` returning `HookSubcommand[]`

**Files:**
- Create: `src/applescript/subcommands.ts`
- Test:   `tests/applescript/subcommands.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/applescript/subcommands.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildAppleScriptSubcommands } from "../../src/applescript/subcommands";

describe("buildAppleScriptSubcommands", () => {
  const subs = buildAppleScriptSubcommands();

  it("returns the expected set of subcommand names", () => {
    const names = new Set(subs.map((s) => s.name));
    for (const expected of [
      "all_bookmarks",
      "bookmark",
      "count_bookmarks",
      "exists_bookmark",
      "get_tags",
      "set_tags",
      "add_tags",
      "remove_tags",
      "bookmarks_with_tags",
      "rename_bookmark",
      "make_bookmark",
      "hook_bookmarks",
      "unhook_bookmarks",
      "from_active_window",
      "by_request_handle",
    ]) {
      expect(names.has(expected)).toBe(true);
    }
  });

  it("all entries have source='osascript' and an appleScriptSource", () => {
    for (const s of subs) {
      expect(s.source).toBe("osascript");
      expect(typeof s.appleScriptSource).toBe("string");
      expect(s.appleScriptSource!.length).toBeGreaterThan(0);
      expect(typeof s.appleScriptParser).toBe("string");
    }
  });

  it("all_bookmarks takes no positionals (usage has none)", () => {
    const s = subs.find((x) => x.name === "all_bookmarks")!;
    expect(/[A-Z_]{2,}/.test(s.usage.replace(/hookmark\s+all bookmarks/i, ""))).toBe(false);
  });

  it("bookmark takes FILE_OR_URL positional", () => {
    const s = subs.find((x) => x.name === "bookmark")!;
    expect(s.usage).toMatch(/FILE_OR_URL/);
  });

  it("set_tags takes FILE_OR_URL and TAGS positionals", () => {
    const s = subs.find((x) => x.name === "set_tags")!;
    expect(s.usage).toMatch(/FILE_OR_URL/);
    expect(s.usage).toMatch(/TAGS/);
  });

  it("hook_bookmarks takes FILE_OR_URL_A and FILE_OR_URL_B", () => {
    const s = subs.find((x) => x.name === "hook_bookmarks")!;
    expect(s.usage).toMatch(/FILE_OR_URL_A/);
    expect(s.usage).toMatch(/FILE_OR_URL_B/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/applescript/subcommands.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```typescript
// src/applescript/subcommands.ts
import type { HookSubcommand } from "../specTypes.js";
import {
  TEMPLATE_ALL_BOOKMARKS,
  TEMPLATE_BOOKMARK_BY_PATH,
  TEMPLATE_COUNT_BOOKMARKS,
  TEMPLATE_EXISTS_BOOKMARK,
  TEMPLATE_GET_TAGS,
  TEMPLATE_SET_TAGS,
  TEMPLATE_ADD_TAGS,
  TEMPLATE_REMOVE_TAGS,
  TEMPLATE_BOOKMARKS_WITH_TAGS,
  TEMPLATE_RENAME_BOOKMARK,
  TEMPLATE_MAKE_BOOKMARK,
  TEMPLATE_HOOK_BOOKMARKS,
  TEMPLATE_UNHOOK_BOOKMARKS,
  TEMPLATE_FROM_ACTIVE_WINDOW,
  TEMPLATE_BY_REQUEST_HANDLE,
} from "./templates.js";

function sub(
  name: string,
  usage: string,
  description: string,
  template: string,
  parser: string
): HookSubcommand {
  return {
    name,
    usage,
    description,
    options: [],
    source: "osascript",
    appleScriptSource: template,
    appleScriptParser: parser,
  };
}

export function buildAppleScriptSubcommands(): HookSubcommand[] {
  return [
    sub(
      "all_bookmarks",
      "hookmark all bookmarks",
      "Return every bookmark in Hookmark (AppleScript).",
      TEMPLATE_ALL_BOOKMARKS,
      "bookmark_list"
    ),
    sub(
      "bookmark",
      "hookmark bookmark FILE_OR_URL",
      "Look up a single bookmark by path/URL and return name/path/address (AppleScript).",
      TEMPLATE_BOOKMARK_BY_PATH,
      "bookmark"
    ),
    sub(
      "count_bookmarks",
      "hookmark count bookmarks",
      "Return the total count of bookmarks (AppleScript).",
      TEMPLATE_COUNT_BOOKMARKS,
      "integer"
    ),
    sub(
      "exists_bookmark",
      "hookmark exists bookmark FILE_OR_URL",
      "Return whether Hookmark knows about a bookmark at the given path/URL (AppleScript).",
      TEMPLATE_EXISTS_BOOKMARK,
      "boolean"
    ),
    sub(
      "get_tags",
      "hookmark get tags FILE_OR_URL",
      "Return the tags array for a bookmark (AppleScript).",
      TEMPLATE_GET_TAGS,
      "tag_list"
    ),
    sub(
      "set_tags",
      "hookmark set tags FILE_OR_URL TAGS",
      "Replace tags for a bookmark. TAGS is a comma-separated list (AppleScript).",
      TEMPLATE_SET_TAGS,
      "tag_list"
    ),
    sub(
      "add_tags",
      "hookmark add tags FILE_OR_URL TAGS",
      "Add tags to a bookmark (union with existing). TAGS is comma-separated (AppleScript).",
      TEMPLATE_ADD_TAGS,
      "tag_list"
    ),
    sub(
      "remove_tags",
      "hookmark remove tags FILE_OR_URL TAGS",
      "Remove tags from a bookmark. TAGS is comma-separated (AppleScript).",
      TEMPLATE_REMOVE_TAGS,
      "tag_list"
    ),
    sub(
      "bookmarks_with_tags",
      "hookmark bookmarks with tags TAGS",
      "Return bookmarks that carry all of the given tags. TAGS is comma-separated (AppleScript).",
      TEMPLATE_BOOKMARKS_WITH_TAGS,
      "bookmark_list"
    ),
    sub(
      "rename_bookmark",
      "hookmark rename bookmark FILE_OR_URL NEW_NAME",
      "Rename a bookmark (sets name property) (AppleScript).",
      TEMPLATE_RENAME_BOOKMARK,
      "bookmark"
    ),
    sub(
      "make_bookmark",
      "hookmark make bookmark NAME ADDRESS [TAGS]",
      "Create a new bookmark with name+address and optional comma-separated TAGS (AppleScript).",
      TEMPLATE_MAKE_BOOKMARK,
      "bookmark"
    ),
    sub(
      "hook_bookmarks",
      "hookmark hook FILE_OR_URL_A FILE_OR_URL_B",
      "Hook two items by path/URL (AppleScript direct hook command).",
      TEMPLATE_HOOK_BOOKMARKS,
      "raw"
    ),
    sub(
      "unhook_bookmarks",
      "hookmark unhook FILE_OR_URL_A FILE_OR_URL_B",
      "Unhook two items by path/URL (AppleScript direct unhook command).",
      TEMPLATE_UNHOOK_BOOKMARKS,
      "raw"
    ),
    sub(
      "from_active_window",
      "hookmark from active window",
      "Return a bookmark for the currently active window — or a request handle for x-callback apps (AppleScript).",
      TEMPLATE_FROM_ACTIVE_WINDOW,
      "bookmark"
    ),
    sub(
      "by_request_handle",
      "hookmark bookmark by request handle HANDLE",
      "Resolve a request handle (from from_active_window) to a bookmark (AppleScript).",
      TEMPLATE_BY_REQUEST_HANDLE,
      "bookmark"
    ),
  ];
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/applescript/subcommands.test.ts`
Expected: PASS (6/6).

- [ ] **Step 5: Commit**

```bash
git add src/applescript/subcommands.ts tests/applescript/subcommands.test.ts
git commit -m "feat(applescript): build virtual subcommand spec entries"
```

---

### Task 3.2: Wire `runOsascript` bridge dispatcher to parse output via named parser

**Files:**
- Modify: `src/bridge.ts`
- Test:   `tests/bridge.osascript.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/bridge.osascript.test.ts`:

```typescript
describe("bridge (osascript source) — output shape", () => {
  it("applies the named parser to osascript stdout and returns parsed JSON", async () => {
    const spec: HookCliSpec = {
      generatedAt: "2026-04-22T00:00:00.000Z",
      hookVersion: "2.1.3",
      subcommands: [
        {
          name: "count_bookmarks",
          usage: "count_bookmarks",
          description: "",
          options: [],
          source: "osascript",
          appleScriptSource: "return 42",
          appleScriptParser: "integer",
        },
      ],
    };
    const runOsascript = vi.fn(() => "42");
    const { listen, close } = createBridgeServer({
      spec,
      hookCli: "/opt/bin/hook",
      runHook: vi.fn(),
      runOsascript,
      getChangelogHtml: () => "",
    });
    const port = await listen(0);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/count_bookmarks`, {
        method: "POST",
        body: "{}",
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { output: unknown };
      expect(body.output).toBe(42);
    } finally {
      await close();
    }
  });

  it("passes positionals from body as argv in osascript call", async () => {
    const spec: HookCliSpec = {
      generatedAt: "2026-04-22T00:00:00.000Z",
      hookVersion: "2.1.3",
      subcommands: [
        {
          name: "exists_bookmark",
          usage: "hookmark exists bookmark FILE_OR_URL",
          description: "",
          options: [],
          source: "osascript",
          appleScriptSource: "on run argv\n return (item 1 of argv)\n end run",
          appleScriptParser: "raw",
        },
      ],
    };
    const runOsascript = vi.fn((_s: string, args: string[]) => `"${args[0]}"`);
    const { listen, close } = createBridgeServer({
      spec,
      hookCli: "/opt/bin/hook",
      runHook: vi.fn(),
      runOsascript,
      getChangelogHtml: () => "",
    });
    const port = await listen(0);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/exists_bookmark`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file_or_url: "/a.md" }),
      });
      expect(res.status).toBe(200);
      const called = runOsascript.mock.calls[0];
      expect(called[1]).toEqual(["/a.md"]);
    } finally {
      await close();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/bridge.osascript.test.ts`
Expected: FAIL — `body.output` is `"42"` (string) instead of `42` (integer); no parser applied.

- [ ] **Step 3: Modify `src/bridge.ts` — apply parser**

At the top of the file, add:

```typescript
import { runNamedParser } from "./applescript/parse.js";
```

In the osascript branch added in Task 1.5, replace the line `const output = opts.runOsascript(...)` and `res.end(JSON.stringify({ output }));` block with:

```typescript
const rawOutput = opts.runOsascript(sub.appleScriptSource ?? "", argsList);
const parserName = sub.appleScriptParser ?? "raw";
let output: unknown;
try {
  output = runNamedParser(parserName, rawOutput);
} catch (parseErr: unknown) {
  const pm = parseErr instanceof Error ? parseErr.message : String(parseErr);
  res.statusCode = 500;
  res.end(JSON.stringify({ error: `Failed to parse osascript output (${parserName}): ${pm}`, raw: rawOutput }));
  return;
}
res.end(JSON.stringify({ output }));
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run`
Expected: PASS for every test (including existing bridge.test.ts suite — CLI path untouched).

- [ ] **Step 5: Commit**

```bash
git add src/bridge.ts tests/bridge.osascript.test.ts
git commit -m "feat(bridge): parse osascript output via named parser"
```

---

### Task 3.3: Merge AppleScript subcommands into spec at startup

**Files:**
- Modify: `src/index.ts`
- Test:   `tests/scaffold.test.ts` (extend) or new `tests/index.integration.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/scaffold.test.ts` (or create `tests/index.integration.test.ts` if scaffold.test.ts is not appropriate — inspect before writing):

```typescript
import { describe, it, expect } from "vitest";
import { buildAppleScriptSubcommands } from "../src/applescript/subcommands";
import type { HookCliSpec } from "../src/specTypes";
import { mergeAppleScriptSubcommands } from "../src/index";

describe("mergeAppleScriptSubcommands", () => {
  it("returns spec unchanged when skipApplescript is true", () => {
    const base: HookCliSpec = {
      generatedAt: "x",
      hookVersion: "1",
      subcommands: [{ name: "clip", usage: "hook clip ITEM", description: "", options: [] }],
    };
    const out = mergeAppleScriptSubcommands(base, true);
    expect(out.subcommands.length).toBe(1);
    expect(out).toEqual(base);
  });

  it("appends applescript subcommands when skipApplescript is false", () => {
    const base: HookCliSpec = {
      generatedAt: "x",
      hookVersion: "1",
      subcommands: [{ name: "clip", usage: "hook clip ITEM", description: "", options: [] }],
    };
    const out = mergeAppleScriptSubcommands(base, false);
    const asNames = out.subcommands.filter((s) => s.source === "osascript").map((s) => s.name);
    expect(asNames).toEqual(buildAppleScriptSubcommands().map((s) => s.name));
    expect(out.subcommands.find((s) => s.name === "clip")).toBeDefined();
  });

  it("does not overwrite an existing CLI subcommand with an applescript duplicate", () => {
    const base: HookCliSpec = {
      generatedAt: "x",
      hookVersion: "1",
      subcommands: [{ name: "bookmark", usage: "hook bookmark ITEM", description: "cli bookmark", options: [] }],
    };
    const out = mergeAppleScriptSubcommands(base, false);
    const bookmark = out.subcommands.filter((s) => s.name === "bookmark");
    expect(bookmark.length).toBe(1);
    expect(bookmark[0].description).toBe("cli bookmark");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scaffold.test.ts`
Expected: FAIL — `mergeAppleScriptSubcommands` not exported from `src/index.ts`.

- [ ] **Step 3: Modify `src/index.ts`**

Add this exported function near the top of the file (above `main`):

```typescript
import { buildAppleScriptSubcommands } from "./applescript/subcommands.js";
import { runOsascript } from "./osascript.js";
import type { HookCliSpec } from "./specTypes.js";

export function mergeAppleScriptSubcommands(
  base: HookCliSpec,
  skipApplescript: boolean
): HookCliSpec {
  if (skipApplescript) return base;
  const existingNames = new Set(base.subcommands.map((s) => s.name));
  const additions = buildAppleScriptSubcommands().filter(
    (s) => !existingNames.has(s.name)
  );
  return { ...base, subcommands: [...base.subcommands, ...additions] };
}
```

Then, in `bootBridgeAndClient()`, right before `bridge = createBridgeServer(...)`, apply the merge:

```typescript
spec = mergeAppleScriptSubcommands(spec!, cfg.skipApplescript);
```

Also pass `runOsascript` to the bridge:

```typescript
bridge = createBridgeServer({
  spec,
  hookCli: cfg.hookCli,
  runHook,
  runOsascript: (script, args) => runOsascript(script, { args }),
  getChangelogHtml: () => cachedChangelogHtml,
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run`
Expected: PASS (all tests, including new merge tests).

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/scaffold.test.ts
git commit -m "feat(index): merge applescript subcommands into runtime spec"
```

---

### Task 3.4: OpenAPI manual includes AppleScript subcommands

**Files:**
- Test: `tests/manualBuilder.test.ts` (extend)

No source change expected — `generateOpenApiSpec` already iterates `spec.subcommands` blind to `source`. This task just verifies the contract.

- [ ] **Step 1: Write the test**

Append to `tests/manualBuilder.test.ts`:

```typescript
it("includes osascript-sourced subcommands in paths with no special treatment", () => {
  const spec: HookCliSpec = {
    generatedAt: "x",
    hookVersion: "1",
    subcommands: [
      { name: "clip", usage: "hook clip ITEM", description: "", options: [] },
      {
        name: "all_bookmarks",
        usage: "hookmark all bookmarks",
        description: "",
        options: [],
        source: "osascript",
        appleScriptSource: "return {}",
        appleScriptParser: "bookmark_list",
      },
    ],
  };
  const openapi = generateOpenApiSpec("http://127.0.0.1:9999", spec);
  expect(openapi.paths["/clip"]).toBeDefined();
  expect(openapi.paths["/all_bookmarks"]).toBeDefined();
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run tests/manualBuilder.test.ts`
Expected: PASS — no source changes needed, confirms behavior.

- [ ] **Step 3: Commit**

```bash
git add tests/manualBuilder.test.ts
git commit -m "test(manualBuilder): assert osascript subcommands appear in OpenAPI"
```

---

# PHASE 4 — JSON Output for CLI `list` / `find`

Goal: Add a structured parser for `hook list --output_format=verbose` so callers can ask for `{ name, address, path, hooked: [...] }` without text-scraping. Delivered as a helper + a new opt-in boolean option `--json` that the bridge honors by post-processing CLI output.

**Depends on:** Phase 1 (types only, to keep `source: "cli"` default working). Independent of AppleScript phases.
**Unblocks:** Nothing — deliverable.

---

### Task 4.1: `parseVerboseListing` — parse verbose block into records

**Files:**
- Create: `src/verboseParser.ts`
- Test:   `tests/verboseParser.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/verboseParser.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseVerboseListing } from "../src/verboseParser";

describe("parseVerboseListing", () => {
  it("parses a single-record block", () => {
    const input = [
      "Name: My Note",
      "Address: hook://file/ABC",
      "Path: /Users/me/note.md",
      "Hooked:",
      "  - hook://file/DEF",
      "  - hook://file/GHI",
      "",
    ].join("\n");
    expect(parseVerboseListing(input)).toEqual([
      {
        name: "My Note",
        address: "hook://file/ABC",
        path: "/Users/me/note.md",
        hooked: ["hook://file/DEF", "hook://file/GHI"],
      },
    ]);
  });

  it("parses multi-record block separated by blank line", () => {
    const input = [
      "Name: A",
      "Address: hook://file/A",
      "Path: /a",
      "Hooked:",
      "",
      "Name: B",
      "Address: hook://file/B",
      "Path: /b",
      "Hooked:",
      "  - hook://file/A",
    ].join("\n");
    const out = parseVerboseListing(input);
    expect(out.length).toBe(2);
    expect(out[0]).toEqual({ name: "A", address: "hook://file/A", path: "/a", hooked: [] });
    expect(out[1]).toEqual({ name: "B", address: "hook://file/B", path: "/b", hooked: ["hook://file/A"] });
  });

  it("returns [] for empty/whitespace input", () => {
    expect(parseVerboseListing("")).toEqual([]);
    expect(parseVerboseListing("\n\n   \n")).toEqual([]);
  });

  it("tolerates missing fields (sets to null/[])", () => {
    const input = "Name: Only\n";
    expect(parseVerboseListing(input)).toEqual([
      { name: "Only", address: null, path: null, hooked: [] },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/verboseParser.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```typescript
// src/verboseParser.ts

export interface VerboseBookmark {
  name: string | null;
  address: string | null;
  path: string | null;
  hooked: string[];
}

export function parseVerboseListing(raw: string): VerboseBookmark[] {
  const lines = raw.split("\n");
  const blocks: string[][] = [[]];
  for (const line of lines) {
    if (line.trim() === "") {
      if (blocks[blocks.length - 1].length > 0) blocks.push([]);
    } else {
      blocks[blocks.length - 1].push(line);
    }
  }
  return blocks
    .filter((b) => b.length > 0)
    .map((block) => parseBlock(block));
}

function parseBlock(block: string[]): VerboseBookmark {
  const out: VerboseBookmark = { name: null, address: null, path: null, hooked: [] };
  let inHooked = false;
  for (const line of block) {
    if (inHooked) {
      const m = line.match(/^\s*-\s*(\S.*)$/);
      if (m) { out.hooked.push(m[1].trim()); continue; }
    }
    const h = line.match(/^(Name|Address|Path|Hooked):\s*(.*)$/);
    if (!h) continue;
    const key = h[1];
    const value = h[2].trim();
    if (key === "Name") out.name = value || null;
    else if (key === "Address") out.address = value || null;
    else if (key === "Path") out.path = value || null;
    else if (key === "Hooked") inHooked = true;
  }
  return out;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/verboseParser.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add src/verboseParser.ts tests/verboseParser.test.ts
git commit -m "feat(verboseParser): parse hook verbose output to records"
```

---

### Task 4.2: Bridge honors `json=true` body param for `list` / `find`

**Files:**
- Modify: `src/bridge.ts`
- Test:   `tests/bridge.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/bridge.test.ts`:

```typescript
it("POST /list with json=true returns structured records", async () => {
  const runHook = vi.fn(() => [
    "Name: N",
    "Address: hook://file/A",
    "Path: /a",
    "Hooked:",
    "  - hook://file/B",
    "",
  ].join("\n"));
  const spec: HookCliSpec = {
    generatedAt: "x", hookVersion: "1",
    subcommands: [
      {
        name: "list",
        usage: "hook list [FILE_OR_URL]",
        description: "",
        options: [
          { short: "-o", long: "--output_format", description: "", valueArg: "FORMAT" },
        ],
      },
    ],
  };
  const { listen, close } = createBridgeServer({
    spec,
    hookCli: "/opt/bin/hook",
    runHook,
    getChangelogHtml: () => "",
  });
  const port = await listen(0);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/list`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file_or_url: "/a", json: true }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { output: unknown };
    expect(Array.isArray(body.output)).toBe(true);
    expect((body.output as VerboseBookmark[])[0]).toEqual({
      name: "N",
      address: "hook://file/A",
      path: "/a",
      hooked: ["hook://file/B"],
    });
    // runHook should have been called WITH --output_format=verbose forcibly
    expect(runHook).toHaveBeenCalledWith(
      "/opt/bin/hook",
      expect.arrayContaining(["list", "/a", "--output_format=verbose"])
    );
  } finally {
    await close();
  }
});
```

Add a type import at top: `import type { VerboseBookmark } from "../src/verboseParser";`

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/bridge.test.ts`
Expected: FAIL — `json` option not handled; raw string returned.

- [ ] **Step 3: Modify `src/bridge.ts`**

At top: `import { parseVerboseListing } from "./verboseParser.js";`

In the CLI `POST` branch (where `bodyToArgs` and `runHook` are called), extract `json` and conditionally post-process:

```typescript
const wantsJson = argsInput.json === true || argsInput.json === "true";
const jsonEligible = sub.name === "list" || sub.name === "find";
const argsInputForCli = { ...argsInput };
delete argsInputForCli.json;
if (wantsJson && jsonEligible) {
  // Force verbose format so parser has something to bite on
  (argsInputForCli as Record<string, unknown>).output_format = "verbose";
}

try {
  const rawOut = opts.runHook(opts.hookCli, bodyToArgs(sub, argsInputForCli));
  const output: unknown = wantsJson && jsonEligible ? parseVerboseListing(rawOut) : rawOut;
  res.end(JSON.stringify({ output }));
} catch (e: unknown) { /* existing error branch unchanged */ }
```

(Keep the existing error-handling branch exactly as it is — only the success path changes.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run`
Expected: PASS (all existing bridge tests still pass; new json test passes).

- [ ] **Step 5: Commit**

```bash
git add src/bridge.ts tests/bridge.test.ts
git commit -m "feat(bridge): add json=true post-processing for list/find"
```

---

### Task 4.3: Surface `json` as an OpenAPI-documented option on `list` and `find`

**Files:**
- Modify: `src/manualBuilder.ts`
- Test:   `tests/manualBuilder.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/manualBuilder.test.ts`:

```typescript
it("adds a boolean 'json' property to list/find request schemas", () => {
  const spec: HookCliSpec = {
    generatedAt: "x", hookVersion: "1",
    subcommands: [
      { name: "list", usage: "hook list [FILE_OR_URL]", description: "", options: [] },
      { name: "find", usage: "hook find QUERY", description: "", options: [] },
      { name: "clip", usage: "hook clip ITEM", description: "", options: [] },
    ],
  };
  const openapi = generateOpenApiSpec("http://127.0.0.1:9999", spec);
  const listSchema = (openapi.paths["/list"].post as any).requestBody.content["application/json"].schema;
  expect(listSchema.properties.json).toEqual({ type: "boolean", description: expect.stringMatching(/structured/i) });
  const findSchema = (openapi.paths["/find"].post as any).requestBody.content["application/json"].schema;
  expect(findSchema.properties.json).toBeDefined();
  const clipSchema = (openapi.paths["/clip"].post as any).requestBody.content["application/json"].schema;
  expect(clipSchema.properties.json).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/manualBuilder.test.ts`
Expected: FAIL — `json` property not in schema.

- [ ] **Step 3: Modify `src/manualBuilder.ts`**

Inside `buildRequestSchema`, after the option loop and before the return:

```typescript
if (sub.name === "list" || sub.name === "find") {
  properties.json = {
    type: "boolean",
    description: "When true, return a structured array of {name, address, path, hooked[]} records instead of raw text.",
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run`
Expected: PASS across all suites.

- [ ] **Step 5: Commit**

```bash
git add src/manualBuilder.ts tests/manualBuilder.test.ts
git commit -m "feat(manualBuilder): document json option on list/find"
```

---

# PHASE 5 — Polish: Config, Docs, Version Bump

Goal: Documentation, version bump, and end-to-end smoke verification. No new features.

**Depends on:** Phases 1–4.
**Unblocks:** Release.

---

### Task 5.1: Bump package version to `0.3.0`

**Files:**
- Modify: `package.json`
- Modify: `src/index.ts` (McpServer version string)

- [ ] **Step 1: Verify current version**

Run: `grep -n '"version"' package.json`
Expected: `"version": "0.2.0",`

- [ ] **Step 2: Update `package.json`**

Change `"version": "0.2.0"` to `"version": "0.3.0"`.

- [ ] **Step 3: Update `src/index.ts`**

Change `new McpServer({ name: "hookmark-mcp", version: "0.2.0" }, ...)` to `version: "0.3.0"`.

- [ ] **Step 4: Build + test**

Run: `npm run build && npx vitest run`
Expected: Build succeeds; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add package.json src/index.ts
git commit -m "chore: bump version to 0.3.0"
```

---

### Task 5.2: Update README with new subcommands and permission note

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Inspect current structure**

Run: `grep -n "^## " README.md` — locate the section that lists subcommands.

- [ ] **Step 2: Add new section after existing subcommand list**

Insert a new `## AppleScript-Backed Subcommands` section listing:

- `all_bookmarks` — enumerate every bookmark
- `bookmark` — look up by path/URL, returns `{name, address, path}`
- `count_bookmarks` — total count
- `exists_bookmark` — boolean existence check
- `get_tags`, `set_tags`, `add_tags`, `remove_tags`, `bookmarks_with_tags`
- `rename_bookmark`, `make_bookmark`
- `hook_bookmarks`, `unhook_bookmarks` (direct AppleScript `hook`/`unhook` commands)
- `from_active_window`, `by_request_handle` (async-handle flow)

Also insert:
- `## JSON Output` — document `json: true` for `list`/`find`.
- `## Required Permissions` — note macOS Automation permission for Hookmark (same hint the bridge emits on -1743).
- `## Disabling AppleScript Features` — document `HOOK_SKIP_APPLESCRIPT=1`.

- [ ] **Step 3: Verify build still works**

Run: `npm run build`
Expected: Build succeeds (README changes don't affect build, but confirms nothing else regressed).

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(readme): document v0.3.0 applescript subcommands + json output"
```

---

### Task 5.3: Update `docs/MCP_FEATURE_GAPS.md` to reflect what shipped

**Files:**
- Modify: `docs/MCP_FEATURE_GAPS.md`

- [ ] **Step 1: Read current file**

Run: `cat docs/MCP_FEATURE_GAPS.md | head -50`
Expected: the gap list we derived this plan from.

- [ ] **Step 2: Modify the file**

Add a top-of-file section:

```markdown
## Status (as of 0.3.0)

Priority items **1 (AppleScript bridge — tags, allBookmarks, make)**, **2 (JSON output for list/find)**, and **3 (from-active-window async handle flow)** are now shipped. See README for new subcommands. Remaining gaps below are deferred to a future release.
```

Delete or strike-through items now shipped (#1–#11 from the AppleScript section, JSON output quality-of-life, async handle flow). Keep URL-scheme wrappers and remaining QoL items in a "Deferred" section.

- [ ] **Step 3: Commit**

```bash
git add docs/MCP_FEATURE_GAPS.md
git commit -m "docs(gaps): mark v0.3.0 priority items as shipped"
```

---

### Task 5.4: Smoke-test the built server end-to-end (manual, documented)

**Files:** None — verification step only.

- [ ] **Step 1: Build and start**

Run: `npm run build`
Expected: `dist/` populated.

- [ ] **Step 2: Launch server in a terminal**

Run: `node dist/index.js`
Expected: Logs `[hook] Registered hook (N tools)` where N equals the sum of CLI + 15 AppleScript subcommands, followed by `[hook] MCP server running on stdio`.

- [ ] **Step 3: Verify bridge OpenAPI surface**

In a second terminal, while the server is still running, find the bridge port from logs, then run:

```bash
curl -s http://127.0.0.1:<port>/openapi | jq '.paths | keys | length'
```

Expected: a number ≥ (existing-cli-count + 15). Also:

```bash
curl -s http://127.0.0.1:<port>/openapi | jq '.paths | keys | map(select(startswith("/all_bookmarks") or startswith("/get_tags") or startswith("/make_bookmark")))'
```

Expected: `["/all_bookmarks", "/get_tags", "/make_bookmark"]` or similar — confirms AppleScript routes registered.

- [ ] **Step 4: Verify a CLI route still works identically (backward compat)**

```bash
curl -s -X POST http://127.0.0.1:<port>/list -H 'content-type: application/json' -d '{}'
```

Expected: same `{output: "<raw text>"}` shape as v0.2.0 (no regression).

- [ ] **Step 5: Verify an AppleScript route works**

```bash
curl -s -X POST http://127.0.0.1:<port>/count_bookmarks -H 'content-type: application/json' -d '{}'
```

Expected: `{"output": <number>}` — returns a parsed integer.

- [ ] **Step 6: Stop the server and commit a note**

Stop the server (Ctrl-C). No files changed in this task, so:

```bash
git log -1 --oneline
```

Expected: matches the most recent functional commit. If everything worked, proceed to Task 5.5 for the regression check before PR.

---

### Task 5.5: Verify no regressions vs. v0.2.0 baseline

**Files:** None — verification only. Consumes `tests/.baseline/v0.2.0.txt` from Task 0.1.

- [ ] **Step 1: Re-run full suite, capture current output**

```bash
bun test 2>&1 | tee tests/.baseline/v0.3.0.txt
```

Expected: exit code 0. If any test fails, halt — do not ship.

- [ ] **Step 2: Extract baseline test file list**

```bash
grep -oE "tests/[^ ]+\.test\.ts" tests/.baseline/v0.2.0.txt | sort -u > /tmp/baseline-files.txt
wc -l /tmp/baseline-files.txt
```

Expected: line count equals the number of test files in v0.2.0 (8 at time of writing).

- [ ] **Step 3: Confirm every baseline file still passes**

```bash
regressions=0
while IFS= read -r f; do
  if ! grep -q "$f.*passed" tests/.baseline/v0.3.0.txt; then
    echo "REGRESSION: $f"
    regressions=$((regressions + 1))
  fi
done < /tmp/baseline-files.txt
echo "regressions: $regressions"
```

Expected: `regressions: 0`. Any non-zero means a v0.2.0 test now fails or was silently removed — halt, investigate, do not ship.

- [ ] **Step 4: Confirm counts only grew**

```bash
echo "v0.2.0:"; grep -E "^ (Test Files|Tests)" tests/.baseline/v0.2.0.txt | tail -2
echo "v0.3.0:"; grep -E "^ (Test Files|Tests)" tests/.baseline/v0.3.0.txt | tail -2
```

Expected: v0.3.0 passed counts are strictly greater than v0.2.0 (new tests added across Phases 1–4 with no losses).

- [ ] **Step 5: No commit — report only**

This task produces no tracked artifacts. If all four checks pass, report pass/fail back to the executing session. The next step is `/ship` / PR.

---

## Self-Review Checklist

- [ ] **Spec coverage:** Every AppleScript-dictionary gap item in `docs/MCP_FEATURE_GAPS.md` §1–11 maps to a subcommand built in Task 3.1 (`all_bookmarks`, `bookmark`, `count_bookmarks`, `exists_bookmark`, `get_tags`, `set_tags`, `add_tags`, `remove_tags`, `bookmarks_with_tags`, `rename_bookmark`, `make_bookmark`, `hook_bookmarks`, `unhook_bookmarks`, `from_active_window`, `by_request_handle`). JSON output for `list`/`find` maps to Phase 4. Async handle flow maps to `from_active_window` + `by_request_handle`. URL-scheme wrappers and pinning are intentionally deferred (noted in Task 5.3).

- [ ] **Placeholder scan:** Every `Step 3: Write implementation` block contains complete code. Every test block contains complete assertions. No "TBD", no "similar to Task N", no "implement later."

- [ ] **Type consistency:**
  - `HookSubcommand.source?: "cli" | "osascript"` — defined in Task 1.3, used in Tasks 1.5 (bridge dispatch), 3.1 (subcommands), 3.3 (merge).
  - `BridgeOptions.runOsascript?: (script, args) => string` — defined in Task 1.5, wired in Task 3.3.
  - Parser names are strings: `"raw" | "boolean" | "integer" | "tag_list" | "bookmark" | "bookmark_list"` — defined in Task 2.3, consumed in Task 3.2, referenced in Task 3.1.
  - `VerboseBookmark` — defined in Task 4.1, used in Task 4.2.
  - `mergeAppleScriptSubcommands(spec, skip)` — defined in Task 3.3, signature consistent across test + impl.
  - `HOOK_SKIP_APPLESCRIPT` env var — defined in Task 1.4, consumed in Task 3.3, documented in Task 5.2.

- [ ] **Backward compatibility:** Every existing test in `tests/bridge.test.ts`, `tests/manualBuilder.test.ts`, `tests/regenHookSpec.test.ts`, `tests/changelog.test.ts`, `tests/hookCli.test.ts`, `tests/config.test.ts`, `tests/scaffold.test.ts`, `tests/serverSurface.test.ts` still passes without modification. `docs/reference/hook-cli-spec.json` schema is unchanged (new `source` field is optional). Bridge routes with no `source` field behave exactly as in v0.2.0. **Verified by Task 5.5** diffing the v0.3.0 suite output against the v0.2.0 baseline captured in Task 0.1.

- [ ] **Runtime degrade:** `probeHookmark` (Task 1.6) correctly flips `config.skipApplescript` on -1743 (permission) or -600 (not running), preventing AppleScript subcommand registration in those environments. Server stderr logs an actionable hint on startup. Existing CLI routes remain unaffected regardless of probe outcome.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-22-hookmark-mcp-feature-gaps.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
