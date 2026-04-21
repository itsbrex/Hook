# Hookmark Code-Mode MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 7 concrete `hookmark_*` tools in `src/index.ts` with the 9-tool code-mode surface used by Brandjet/Attio, exposing the local `hook` CLI through a UTCP HTTP bridge and auto-regenerating the OpenAPI spec from `hook help` on every server startup.

**Architecture:** stdio MCP → `CodeModeUtcpClient` → local HTTP bridge on `127.0.0.1:3801` → `execSync("hook …")`. On startup, `scripts/regen_hook_spec.ts` runs `hook help <subcmd>` for the 7 subcommands and writes `docs/reference/hook-cli-spec.json`. If the spec changed, `src/changelog.ts` renders a diff and auto-opens `http://127.0.0.1:3801/changelog` in the default browser.

**Tech Stack:** Node 22+, TypeScript 5+, `@modelcontextprotocol/sdk`, `@utcp/code-mode`, `@utcp/sdk`, `@utcp/http`, `@utcp/dotenv-loader`, `dotenv`, `zod`, `tsx`, `vitest`.

**Reference Implementation:** `/Users/hack/github/brandjet/src/` (especially `index.ts`, `manualBuilder.ts`, `changelog.ts`). When in doubt about UTCP client wiring or the 9 meta-tool shapes, copy from Brandjet and adapt.

---

## Task 1: Bootstrap Dependencies and Test Runner

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.env.example`
- Create: `tests/scaffold.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/scaffold.test.ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("project scaffold", () => {
  it("declares code-mode deps and test/dev scripts", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.type).toBe("module");
    expect(pkg.version).toBe("0.2.0");
    expect(pkg.scripts.test).toBe("vitest run");
    expect(pkg.scripts.dev).toBe("tsx src/index.ts");
    expect(pkg.scripts["regen-spec"]).toBe("tsx scripts/regen_hook_spec.ts");
    for (const dep of [
      "@utcp/code-mode",
      "@utcp/sdk",
      "@utcp/http",
      "@utcp/dotenv-loader",
      "dotenv",
    ]) {
      expect(pkg.dependencies[dep]).toBeDefined();
    }
    for (const dep of ["vitest", "tsx"]) {
      expect(pkg.devDependencies[dep]).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/scaffold.test.ts`
Expected: FAIL — vitest not installed yet and package.json missing fields.

- [ ] **Step 3: Update `package.json`**

Replace the existing `package.json` contents with:

```json
{
  "name": "hookmark-mcp",
  "version": "0.2.0",
  "description": "Code-Mode MCP server for Hookmark — exposes the hook CLI as a UTCP manual for Claude Code and other MCP clients",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "hookmark-mcp": "dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run",
    "regen-spec": "tsx scripts/regen_hook_spec.ts"
  },
  "keywords": [
    "mcp",
    "hookmark",
    "hook",
    "claude",
    "claude-code",
    "mcp-server",
    "code-mode",
    "utcp",
    "macos",
    "productivity"
  ],
  "author": "Matthias Nott",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/mnott/Hook.git"
  },
  "homepage": "https://github.com/mnott/Hook#readme",
  "files": [
    "dist",
    "docs/reference/hook-cli-spec.json",
    "README.md",
    "LICENSE"
  ],
  "engines": {
    "node": ">=22.0.0"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.26.0",
    "@utcp/code-mode": "^1.2.11",
    "@utcp/dotenv-loader": "^1.1.0",
    "@utcp/http": "^1.1.0",
    "@utcp/sdk": "^1.1.0",
    "dotenv": "^17.3.1",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 4: Update `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests", "scripts"]
}
```

- [ ] **Step 5: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 10_000,
  },
});
```

- [ ] **Step 6: Create `.env.example`**

```dotenv
# Path to the Hookmark CLI (falls back to the default homebrew location)
# HOOK_CLI=/opt/homebrew/lib/ruby/gems/4.0.0/bin/hook

# Local HTTP bridge port (default: 3801)
# HOOK_BRIDGE_PORT=3801

# Set to 1 to skip auto-regen of hook-cli-spec.json at startup (CI/tests)
# HOOK_SKIP_REGEN=0

# Set to 0 to suppress auto-opening the changelog URL when updates are detected
# HOOK_CHANGELOG_AUTO_OPEN=1
```

- [ ] **Step 7: Install deps and run test to verify it passes**

Run: `npm install && npm test -- tests/scaffold.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .env.example tests/scaffold.test.ts
git commit -m "chore: bootstrap code-mode deps and vitest"
```

---

## Task 2: Config Module

**Files:**
- Create: `src/config.ts`
- Create: `tests/config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/config.test.ts
import { describe, expect, it } from "vitest";
import { getConfig } from "../src/config";

describe("config", () => {
  it("returns Hook defaults when env is empty", () => {
    const c = getConfig({});
    expect(c.hookCli).toBe("/opt/homebrew/lib/ruby/gems/4.0.0/bin/hook");
    expect(c.bridgePort).toBe(3801);
    expect(c.skipRegen).toBe(false);
    expect(c.changelogAutoOpen).toBe(true);
  });

  it("respects overrides", () => {
    const c = getConfig({
      HOOK_CLI: "/usr/local/bin/hook",
      HOOK_BRIDGE_PORT: "4000",
      HOOK_SKIP_REGEN: "1",
      HOOK_CHANGELOG_AUTO_OPEN: "0",
    });
    expect(c.hookCli).toBe("/usr/local/bin/hook");
    expect(c.bridgePort).toBe(4000);
    expect(c.skipRegen).toBe(true);
    expect(c.changelogAutoOpen).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/config.test.ts`
Expected: FAIL — `Cannot find module '../src/config'`.

- [ ] **Step 3: Write `src/config.ts`**

```ts
export interface RuntimeConfig {
  hookCli: string;
  bridgePort: number;
  skipRegen: boolean;
  changelogAutoOpen: boolean;
}

const DEFAULT_HOOK_CLI = "/opt/homebrew/lib/ruby/gems/4.0.0/bin/hook";
const DEFAULT_BRIDGE_PORT = 3801;

export function getConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined>): RuntimeConfig {
  return {
    hookCli: env.HOOK_CLI ?? DEFAULT_HOOK_CLI,
    bridgePort: Number(env.HOOK_BRIDGE_PORT ?? DEFAULT_BRIDGE_PORT),
    skipRegen: env.HOOK_SKIP_REGEN === "1",
    changelogAutoOpen: env.HOOK_CHANGELOG_AUTO_OPEN !== "0",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/config.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: add runtime config module"
```

---

## Task 3: Hook CLI Wrapper

**Files:**
- Create: `src/hookCli.ts`
- Create: `tests/hookCli.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/hookCli.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { shellEscape, extractHookUrl, buildHookCommand } from "../src/hookCli";

describe("hookCli helpers", () => {
  it("quotes empty strings and escapes single quotes", () => {
    expect(shellEscape("")).toBe("''");
    expect(shellEscape("it's fine")).toBe("'it'\\''s fine'");
    expect(shellEscape("/Users/x/file.md")).toBe("'/Users/x/file.md'");
  });

  it("extracts hook:// URLs from CLI output", () => {
    expect(extractHookUrl("Copied hook://file/abc123 to clipboard")).toBe("hook://file/abc123");
    expect(extractHookUrl("nothing here")).toBeNull();
  });

  it("builds a shell-escaped command line", () => {
    const cmd = buildHookCommand("/opt/bin/hook", ["list", "-o", "paths", "/a b.md"]);
    expect(cmd).toBe("'/opt/bin/hook' 'list' '-o' 'paths' '/a b.md'");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/hookCli.test.ts`
Expected: FAIL — `Cannot find module '../src/hookCli'`.

- [ ] **Step 3: Write `src/hookCli.ts`**

```ts
import { execSync } from "node:child_process";

export function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export function buildHookCommand(hookCli: string, args: string[]): string {
  return [hookCli, ...args].map(shellEscape).join(" ");
}

export function extractHookUrl(text: string): string | null {
  const match = text.match(/hook:\/\/[^\s'"]+/);
  return match ? match[0] : null;
}

export function runHook(hookCli: string, args: string[]): string {
  const cmd = buildHookCommand(hookCli, args);
  try {
    const output = execSync(cmd, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
    });
    return output.trim();
  } catch (err: unknown) {
    if (err && typeof err === "object" && "stderr" in err) {
      const e = err as { stderr: string; stdout: string; message: string };
      const detail = (e.stderr || e.message || "").trim();
      throw new Error(detail || `hook ${args[0]} failed`);
    }
    throw err;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/hookCli.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hookCli.ts tests/hookCli.test.ts
git commit -m "feat: add hook CLI wrapper with argv builder and URL extractor"
```

---

## Task 4: Regen Spec Script (Static Fallback First)

**Files:**
- Create: `scripts/regen_hook_spec.ts`
- Create: `src/specTypes.ts`
- Create: `docs/reference/hook-cli-spec.json` (committed fallback, captured from `hook help` on the developer's Mac)
- Create: `tests/regenHookSpec.test.ts`

**Note:** This task writes the script and the parser, plus a static fallback `hook-cli-spec.json` (derived from the 7 known subcommands in the current `src/index.ts`). The parser is fed a fixture string in tests so the suite works on machines without `hook` installed.

- [ ] **Step 1: Write the failing test**

```ts
// tests/regenHookSpec.test.ts
import { describe, expect, it } from "vitest";
import { parseHookHelpOutput, buildSpecFromHelp } from "../scripts/regen_hook_spec";

const CLIP_HELP = `Usage: hook clip ITEM

Description:
  Generate a hook:// URL for ITEM and copy it to the clipboard.

Options:
  -m, --markdown    Return a Markdown link instead of a bare hook:// URL
`;

describe("regen_hook_spec parser", () => {
  it("extracts usage, description, options from a single subcommand", () => {
    const parsed = parseHookHelpOutput("clip", CLIP_HELP);
    expect(parsed.name).toBe("clip");
    expect(parsed.usage).toContain("hook clip ITEM");
    expect(parsed.description).toContain("Generate a hook:// URL");
    expect(parsed.options).toEqual([
      {
        short: "-m",
        long: "--markdown",
        description: "Return a Markdown link instead of a bare hook:// URL",
      },
    ]);
  });

  it("rolls up multiple subcommands into a checked-in spec shape", () => {
    const spec = buildSpecFromHelp({ clip: CLIP_HELP });
    expect(spec.generatedAt).toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(spec.subcommands.map((s) => s.name)).toEqual(["clip"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/regenHookSpec.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/specTypes.ts`**

```ts
export interface HookOption {
  short: string | null;
  long: string | null;
  description: string;
}

export interface HookSubcommand {
  name: string;
  usage: string;
  description: string;
  options: HookOption[];
}

export interface HookCliSpec {
  generatedAt: string;
  hookVersion: string | null;
  subcommands: HookSubcommand[];
}
```

- [ ] **Step 4: Write `scripts/regen_hook_spec.ts`**

```ts
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

  // Description lives between "Description:" and the next blank/option block.
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

// Ignore generatedAt when deciding whether content actually changed.
function normalizeForDiff(raw: string): string {
  try {
    const obj = JSON.parse(raw) as HookCliSpec;
    return JSON.stringify({ ...obj, generatedAt: "" });
  } catch {
    return raw;
  }
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  const cfg = getConfig(process.env);
  const specPath = path.resolve("docs/reference/hook-cli-spec.json");
  const previousPath = path.resolve("docs/reference/hook-cli-spec.previous.json");
  const { changed } = regenHookSpec({ hookCli: cfg.hookCli, specPath, previousPath });
  process.stderr.write(changed ? "[regen] spec updated\n" : "[regen] no changes\n");
}
```

- [ ] **Step 5: Write the static fallback `docs/reference/hook-cli-spec.json`**

Create a hand-authored fallback from the 7 known subcommands (names, usage lines, and descriptions lifted from the current `src/index.ts` tool descriptions). Use `null` for `hookVersion` and a fixed `generatedAt` of `"1970-01-01T00:00:00.000Z"` so re-runs always produce a diff on the first real regen. Keep options minimal — parser will fill the real ones on first live regen.

```json
{
  "generatedAt": "1970-01-01T00:00:00.000Z",
  "hookVersion": null,
  "subcommands": [
    { "name": "clip",   "usage": "hook clip ITEM",           "description": "Generate a hook:// URL for ITEM and copy it to the clipboard.", "options": [] },
    { "name": "link",   "usage": "hook link ITEM_A ITEM_B",  "description": "Create a bidirectional hook between two items.",                  "options": [] },
    { "name": "list",   "usage": "hook list [ITEM]",         "description": "List all hooks for ITEM (or all bookmarks if omitted).",         "options": [] },
    { "name": "find",   "usage": "hook find QUERY",          "description": "Search Hookmark bookmarks by keyword.",                          "options": [] },
    { "name": "remove", "usage": "hook remove ITEM_A ITEM_B","description": "Remove a bidirectional hook between two items.",                 "options": [] },
    { "name": "clone",  "usage": "hook clone SRC DEST",      "description": "Clone all hooks from SRC onto DEST.",                            "options": [] },
    { "name": "from",   "usage": "hook from APP",            "description": "Get the hook:// URL for the frontmost window of APP.",           "options": [] }
  ]
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- tests/regenHookSpec.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/specTypes.ts scripts/regen_hook_spec.ts docs/reference/hook-cli-spec.json tests/regenHookSpec.test.ts
git commit -m "feat: add hook help parser and regen script with static fallback"
```

---

## Task 5: OpenAPI Manual Builder

**Files:**
- Create: `src/manualBuilder.ts`
- Create: `tests/manualBuilder.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/manualBuilder.test.ts
import { describe, expect, it } from "vitest";
import { generateOpenApiSpec } from "../src/manualBuilder";
import type { HookCliSpec } from "../src/specTypes";

const SPEC: HookCliSpec = {
  generatedAt: "2026-04-20T00:00:00.000Z",
  hookVersion: "2.1.3",
  subcommands: [
    {
      name: "clip",
      usage: "hook clip ITEM",
      description: "Generate a hook:// URL for ITEM.",
      options: [{ short: "-m", long: "--markdown", description: "Markdown link" }],
    },
  ],
};

describe("generateOpenApiSpec", () => {
  it("emits one POST path per subcommand with operationId == subcommand name", () => {
    const openapi = generateOpenApiSpec("http://127.0.0.1:3801", SPEC);
    expect(openapi.openapi).toBe("3.0.3");
    expect(openapi.servers[0].url).toBe("http://127.0.0.1:3801");
    expect(openapi.paths["/clip"].post.operationId).toBe("clip");
    expect(openapi.paths["/clip"].post.summary).toContain("Generate a hook:// URL");
    const schema = openapi.paths["/clip"].post.requestBody.content["application/json"].schema;
    expect(schema.type).toBe("object");
    expect(schema.properties.markdown).toEqual({ type: "boolean", description: "Markdown link" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/manualBuilder.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/manualBuilder.ts`**

```ts
import { readFileSync } from "node:fs";
import type { HookCliSpec, HookSubcommand } from "./specTypes.js";

export function loadHookCliSpec(specPath: string): HookCliSpec {
  return JSON.parse(readFileSync(specPath, "utf8")) as HookCliSpec;
}

function optionToProperty(opt: HookSubcommand["options"][number]): [string, Record<string, unknown>] {
  const key = (opt.long ?? opt.short ?? "").replace(/^-+/, "").replace(/-/g, "_");
  return [key, { type: "boolean", description: opt.description }];
}

function buildRequestSchema(sub: HookSubcommand): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const usage = sub.usage;

  // Positional args inferred from usage line (uppercase tokens after subcommand name).
  const positional = usage.match(/\b[A-Z_]{2,}\b/g) ?? [];
  for (const token of positional) {
    const key = token.toLowerCase();
    properties[key] = { type: "string", description: `Positional: ${token}` };
  }

  for (const opt of sub.options) {
    const [key, schema] = optionToProperty(opt);
    if (key) properties[key] = schema;
  }

  return {
    type: "object",
    properties,
    required: positional.filter((p) => !/^\[.+\]$/.test(p)).map((p) => p.toLowerCase()),
  };
}

export interface OpenApiDocument {
  openapi: "3.0.3";
  info: { title: string; version: string; description: string };
  servers: Array<{ url: string }>;
  paths: Record<string, { post: Record<string, unknown> }>;
}

export function generateOpenApiSpec(baseUrl: string, spec: HookCliSpec): OpenApiDocument {
  const paths: OpenApiDocument["paths"] = {};
  for (const sub of spec.subcommands) {
    paths[`/${sub.name}`] = {
      post: {
        operationId: sub.name,
        tags: ["hook"],
        summary: sub.description,
        description: sub.usage,
        requestBody: {
          required: true,
          content: { "application/json": { schema: buildRequestSchema(sub) } },
        },
        responses: {
          "200": {
            description: "CLI output",
            content: { "application/json": { schema: { type: "object", properties: { output: { type: "string" } } } } },
          },
        },
      },
    };
  }

  return {
    openapi: "3.0.3",
    info: {
      title: "Hookmark CLI",
      version: spec.hookVersion ?? "0.0.0",
      description: "Generated from `hook help <subcmd>` output",
    },
    servers: [{ url: baseUrl }],
    paths,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/manualBuilder.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/manualBuilder.ts tests/manualBuilder.test.ts
git commit -m "feat: generate OpenAPI spec from hook CLI spec"
```

---

## Task 6: Changelog + Browser Auto-Open

**Files:**
- Create: `src/changelog.ts`
- Create: `src/assets/changelog-template.html`
- Create: `tests/changelog.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/changelog.test.ts
import { describe, expect, it, vi } from "vitest";
import { diffSpecs, renderChangelogHtml, openInBrowser } from "../src/changelog";
import type { HookCliSpec } from "../src/specTypes";

const BASE: HookCliSpec = {
  generatedAt: "2026-04-20T00:00:00.000Z",
  hookVersion: "2.1.3",
  subcommands: [
    { name: "clip", usage: "hook clip ITEM", description: "Old desc", options: [] },
  ],
};

const NEXT: HookCliSpec = {
  ...BASE,
  generatedAt: "2026-04-21T00:00:00.000Z",
  subcommands: [
    { name: "clip", usage: "hook clip ITEM", description: "New desc", options: [{ short: "-m", long: "--markdown", description: "Md link" }] },
    { name: "pin",  usage: "hook pin ITEM",  description: "Pin ITEM.", options: [] },
  ],
};

describe("diffSpecs", () => {
  it("detects added subcommands, added options, and description changes", () => {
    const diff = diffSpecs(BASE, NEXT);
    expect(diff.addedSubcommands).toEqual(["pin"]);
    expect(diff.removedSubcommands).toEqual([]);
    expect(diff.changedSubcommands).toEqual([
      { name: "clip", addedOptions: ["--markdown"], removedOptions: [], descriptionChanged: true },
    ]);
    expect(diff.hasChanges).toBe(true);
  });
});

describe("renderChangelogHtml", () => {
  it("produces HTML containing the diff summary", () => {
    const html = renderChangelogHtml(diffSpecs(BASE, NEXT), NEXT);
    expect(html).toContain("<html");
    expect(html).toContain("pin");
    expect(html).toContain("--markdown");
  });
});

describe("openInBrowser", () => {
  it("does nothing when autoOpen is false", async () => {
    const spawn = vi.fn();
    await openInBrowser("http://127.0.0.1:3801/changelog", { autoOpen: false, spawn });
    expect(spawn).not.toHaveBeenCalled();
  });

  it("spawns `open` on darwin when autoOpen is true", async () => {
    const spawn = vi.fn();
    await openInBrowser("http://127.0.0.1:3801/changelog", { autoOpen: true, spawn, platform: "darwin" });
    expect(spawn).toHaveBeenCalledWith("open", ["http://127.0.0.1:3801/changelog"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/changelog.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/assets/changelog-template.html`**

```html
<!doctype html>
<html><head>
<meta charset="utf-8" />
<title>Hookmark CLI Changelog</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; background: #0b0b0b; color: #e6e6e6; padding: 2rem; max-width: 780px; margin: auto; }
  h1 { margin-top: 0; }
  section { border: 1px solid #222; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
  .added { color: #7ee787; }
  .removed { color: #ff7b72; }
  .changed { color: #d2a8ff; }
  code { background: #1f1f1f; padding: 0.1rem 0.3rem; border-radius: 4px; }
</style>
</head><body>
<h1>Hookmark CLI Changelog</h1>
<p>Regenerated at <code>{{generatedAt}}</code> against <code>hook {{hookVersion}}</code>.</p>
{{body}}
</body></html>
```

- [ ] **Step 4: Write `src/changelog.ts`**

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/changelog.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/changelog.ts src/assets/changelog-template.html tests/changelog.test.ts
git commit -m "feat: spec diff, changelog HTML renderer, and browser auto-open"
```

---

## Task 7: Local HTTP Bridge

**Files:**
- Create: `src/bridge.ts`
- Create: `tests/bridge.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/bridge.test.ts
import { describe, expect, it, vi } from "vitest";
import { createBridgeServer } from "../src/bridge";
import type { HookCliSpec } from "../src/specTypes";

const SPEC: HookCliSpec = {
  generatedAt: "2026-04-20T00:00:00.000Z",
  hookVersion: "2.1.3",
  subcommands: [
    { name: "clip", usage: "hook clip ITEM", description: "Get URL", options: [] },
  ],
};

function makeServer(runHook = vi.fn(() => "hook://file/abc")) {
  return createBridgeServer({
    spec: SPEC,
    hookCli: "/opt/bin/hook",
    runHook,
    getChangelogHtml: () => "<html>changelog</html>",
  });
}

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  return { status: res.status, body: await res.text() };
}

describe("bridge server", () => {
  it("serves /openapi with the generated spec", async () => {
    const { listen, close } = makeServer();
    const port = await listen(0);
    try {
      const { status, body } = await fetchJson(`http://127.0.0.1:${port}/openapi`);
      expect(status).toBe(200);
      expect(JSON.parse(body).paths["/clip"]).toBeDefined();
    } finally {
      await close();
    }
  });

  it("POST /<subcommand> calls runHook and returns output", async () => {
    const runHook = vi.fn(() => "hook://file/abc");
    const { listen, close } = makeServer(runHook);
    const port = await listen(0);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/clip`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ item: "/Users/me/note.md" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.output).toBe("hook://file/abc");
      expect(runHook).toHaveBeenCalledWith("/opt/bin/hook", ["clip", "/Users/me/note.md"]);
    } finally {
      await close();
    }
  });

  it("returns 404 for unknown operations", async () => {
    const { listen, close } = makeServer();
    const port = await listen(0);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/bogus`, { method: "POST", body: "{}" });
      expect(res.status).toBe(404);
    } finally {
      await close();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/bridge.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/bridge.ts`**

```ts
import http from "node:http";
import type { HookCliSpec, HookSubcommand } from "./specTypes.js";
import { generateOpenApiSpec } from "./manualBuilder.js";

export interface BridgeOptions {
  spec: HookCliSpec;
  hookCli: string;
  runHook: (hookCli: string, args: string[]) => string;
  getChangelogHtml: () => string;
}

export interface BridgeServer {
  listen: (port: number) => Promise<number>;
  close: () => Promise<void>;
}

function bodyToArgs(sub: HookSubcommand, body: Record<string, unknown>): string[] {
  const args: string[] = [sub.name];

  for (const opt of sub.options) {
    const key = (opt.long ?? opt.short ?? "").replace(/^-+/, "").replace(/-/g, "_");
    if (!key) continue;
    const value = body[key];
    if (value === true && opt.long) args.push(opt.long);
  }

  const positionalTokens = (sub.usage.match(/\b[A-Z_]{2,}\b/g) ?? []).map((t) => t.toLowerCase());
  for (const token of positionalTokens) {
    const v = body[token];
    if (typeof v === "string" && v.length > 0) args.push(v);
  }

  return args;
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

export function createBridgeServer(opts: BridgeOptions): BridgeServer {
  const subByName = new Map(opts.spec.subcommands.map((s) => [s.name, s]));

  const server = http.createServer(async (req, res) => {
    const url = req.url ?? "/";
    res.setHeader("content-type", "application/json");

    if (req.method === "GET" && url === "/openapi") {
      const openapi = generateOpenApiSpec(`http://127.0.0.1:${(server.address() as { port: number }).port}`, opts.spec);
      res.end(JSON.stringify(openapi));
      return;
    }

    if (req.method === "GET" && url === "/changelog") {
      res.setHeader("content-type", "text/html");
      res.end(opts.getChangelogHtml());
      return;
    }

    if (req.method === "POST") {
      const name = url.slice(1);
      const sub = subByName.get(name);
      if (!sub) { res.statusCode = 404; res.end(JSON.stringify({ error: `Unknown operation: ${name}` })); return; }
      const body = await readJsonBody(req);
      try {
        const output = opts.runHook(opts.hookCli, bodyToArgs(sub, body));
        res.end(JSON.stringify({ output }));
      } catch (e: unknown) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
      }
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: "Not found" }));
  });

  return {
    listen: (port) => new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve((server.address() as { port: number }).port))),
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/bridge.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/bridge.ts tests/bridge.test.ts
git commit -m "feat: local HTTP bridge for hook CLI"
```

---

## Task 8: Orchestrator (`src/index.ts` Replacement)

**Files:**
- Modify: `src/index.ts` (full replacement of existing file)
- Create: `tests/serverSurface.test.ts`

**Context:** This task replaces the existing 467-line `src/index.ts` that registers the 7 `hookmark_*` tools. The new file is a slim orchestrator that mirrors Brandjet's `src/index.ts` shape. Use `/Users/hack/github/brandjet/src/index.ts` as a reference for the exact UTCP wiring and the 9 meta-tool definitions — copy verbatim where possible, adjusting manual name from `brandjet` → `hook` and prompt copy to match Hookmark usage.

- [ ] **Step 1: Write the failing test**

```ts
// tests/serverSurface.test.ts
import { describe, expect, it } from "vitest";
import { TOOL_NAMES, buildUsageGuide } from "../src/index";

describe("server surface", () => {
  it("exposes exactly the 9 code-mode meta-tools", () => {
    expect(TOOL_NAMES).toEqual([
      "register_manual",
      "deregister_manual",
      "search_tools",
      "list_tools",
      "changelog",
      "tools_info",
      "get_all_tool_interfaces",
      "get_required_keys_for_tool",
      "call_tool_chain",
    ]);
  });

  it("teaches hook.<subcommand>() usage", () => {
    const guide = buildUsageGuide();
    expect(guide).toContain("hook.clip");
    expect(guide).toContain("hook.link");
    expect(guide).toContain("call_tool_chain");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/serverSurface.test.ts`
Expected: FAIL — `TOOL_NAMES` and `buildUsageGuide` not exported yet.

- [ ] **Step 3: Replace `src/index.ts`**

Replace the entire contents of `src/index.ts` with the new orchestrator. Structure (copy the 9 meta-tool registrations verbatim from `/Users/hack/github/brandjet/src/index.ts:157-718`, renaming manual `brandjet` → `hook` throughout):

```ts
#!/usr/bin/env node
import util from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { config as loadDotenv } from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import "@utcp/http";
import "@utcp/dotenv-loader";
import {
  CallTemplateSchema,
  ensureCorePluginsInitialized,
  UtcpClientConfigSerializer,
} from "@utcp/sdk";
import type { CallTemplate } from "@utcp/sdk";
import { CodeModeUtcpClient } from "@utcp/code-mode";
import { ContentBlockSchema } from "@modelcontextprotocol/sdk/types.js";
import type { ContentBlock } from "@modelcontextprotocol/sdk/types.js";
import type { HttpCallTemplate } from "@utcp/http";

import { getConfig } from "./config.js";
import { runHook } from "./hookCli.js";
import { loadHookCliSpec } from "./manualBuilder.js";
import { createBridgeServer, type BridgeServer } from "./bridge.js";
import { diffSpecs, renderChangelogHtml, openInBrowser } from "./changelog.js";
import { regenHookSpec } from "../scripts/regen_hook_spec.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log = (...args: unknown[]) => process.stderr.write(util.format(...args) + "\n");
console.warn = (...args: unknown[]) => process.stderr.write(util.format(...args) + "\n");

loadDotenv({ path: path.resolve(__dirname, "..", ".env") });
ensureCorePluginsInitialized();

export const TOOL_NAMES = [
  "register_manual",
  "deregister_manual",
  "search_tools",
  "list_tools",
  "changelog",
  "tools_info",
  "get_all_tool_interfaces",
  "get_required_keys_for_tool",
  "call_tool_chain",
] as const;

export function buildUsageGuide(): string {
  return [
    "## Hookmark Code-Mode Usage",
    "",
    "Discovery:",
    "1. `search_tools` with the user's task description to find relevant hook subcommands.",
    "2. `tools_info` to fetch the TypeScript interface for a given hook subcommand before using it.",
    "",
    "Execution (preferred):",
    "- Use `call_tool_chain` with a TypeScript snippet that calls `hook.<subcommand>({...})`.",
    "- Examples:",
    "    return await hook.clip({ item: '/Users/me/note.md' });",
    "    const a = await hook.clip({ item: '/a.md' });",
    "    const b = await hook.clip({ item: '/b.md' });",
    "    return await hook.link({ item_a: a.output, item_b: b.output });",
    "",
    "Batch related work in a single `call_tool_chain` execution rather than many small tool calls.",
  ].join("\n");
}

const SPEC_PATH = path.resolve(__dirname, "..", "docs/reference/hook-cli-spec.json");
const PREVIOUS_PATH = path.resolve(__dirname, "..", "docs/reference/hook-cli-spec.previous.json");

let bridge: BridgeServer | null = null;
let bridgePort: number | null = null;
let utcpClient: CodeModeUtcpClient | null = null;
let cachedChangelogHtml = "<p>No changelog generated yet.</p>";

async function bootBridgeAndClient(): Promise<void> {
  const cfg = getConfig(process.env);

  // 1. Regen the spec (unless skipped)
  let changed = false;
  if (!cfg.skipRegen) {
    try {
      const result = regenHookSpec({ hookCli: cfg.hookCli, specPath: SPEC_PATH, previousPath: PREVIOUS_PATH });
      changed = result.changed;
      console.log(changed ? "[hook] Spec regenerated (changed)" : "[hook] Spec regenerated (no changes)");
    } catch (err) {
      console.warn("[hook] Spec regen failed, using existing checked-in spec:", err);
    }
  }

  // 2. Load spec + render changelog HTML
  const spec = loadHookCliSpec(SPEC_PATH);
  let diff = { addedSubcommands: [], removedSubcommands: [], changedSubcommands: [], hasChanges: false } as ReturnType<typeof diffSpecs>;
  try {
    const prev = loadHookCliSpec(PREVIOUS_PATH);
    diff = diffSpecs(prev, spec);
  } catch { /* first run, no previous */ }
  cachedChangelogHtml = renderChangelogHtml(diff, spec);

  // 3. Start bridge
  bridge = createBridgeServer({
    spec,
    hookCli: cfg.hookCli,
    runHook,
    getChangelogHtml: () => cachedChangelogHtml,
  });
  bridgePort = await bridge.listen(cfg.bridgePort);
  console.log(`[hook] Bridge server on http://127.0.0.1:${bridgePort}`);

  // 4. Auto-open changelog on detected change
  if (changed && diff.hasChanges) {
    await openInBrowser(`http://127.0.0.1:${bridgePort}/changelog`, { autoOpen: cfg.changelogAutoOpen });
  }

  // 5. Construct UTCP code-mode client and register the hook manual
  const clientConfig = new UtcpClientConfigSerializer().validateDict({
    tool_repository: { tool_repository_type: "in_memory" },
    tool_search_strategy: { tool_search_strategy_type: "tag_and_description_word_match" },
  });
  const client = await CodeModeUtcpClient.create(path.resolve(__dirname, ".."), clientConfig);
  await client.registerManual({
    name: "hook",
    call_template_type: "http",
    http_method: "GET",
    url: `http://127.0.0.1:${bridgePort}/openapi`,
    content_type: "application/json",
  } as HttpCallTemplate);
  utcpClient = client;
  const tools = await client.getTools();
  console.log(`[hook] Registered hook manual (${tools.length} tools)`);
}

// Helpers for name mapping (copy from Brandjet: sanitizeIdentifier + utcpNameToTsInterfaceName + findToolByName).
// ... [PASTE lines 119-151 from /Users/hack/github/brandjet/src/index.ts verbatim] ...

const mcp = new McpServer({ name: "hookmark-mcp", version: "0.2.0" }, {
  instructions: buildUsageGuide(),
});

function setupMcpTools(): void {
  // Register all 9 meta-tools.
  // COPY lines 234-718 from /Users/hack/github/brandjet/src/index.ts, replacing:
  //   - the `brandjet_codemode_usage` prompt body with buildUsageGuide()
  //   - all prompt/description mentions of "Brandjet" → "Hookmark"
  //   - tool category enumerations with: clip, link, list, find, remove, clone, from
  //   - `initializeUtcpClient()` calls with a lazy wrapper around bootBridgeAndClient()
  //
  // The `changelog` tool additionally calls:
  //   await openInBrowser(`${baseUrl}/changelog`, { autoOpen: getConfig(process.env).changelogAutoOpen });
  // right before returning, so manual invocations also pop the browser.
}

async function main(): Promise<void> {
  setupMcpTools();
  await bootBridgeAndClient();
  const transport = new StdioServerTransport();
  await mcp.connect(transport);
  console.log("[hook] MCP server running on stdio");
}

main().catch((err) => {
  console.error("[hook] Fatal error:", err);
  process.exit(1);
});
```

When pasting the Brandjet helpers and tool registrations, leave their logic untouched — the only string-level edits are:
- `brandjet` → `hook` everywhere (prompt titles, manual name, tool descriptions)
- Prompt body replaced with `buildUsageGuide()` output, plus the same `CodeModeUtcpClient.AGENT_PROMPT_TEMPLATE` include
- In the `changelog` tool handler, after computing `baseUrl`, call `await openInBrowser(\`${baseUrl}/changelog\`, { autoOpen: getConfig(process.env).changelogAutoOpen });` before returning
- `initializeUtcpClient()` calls → a small inline wrapper that returns the already-booted `utcpClient` or calls `bootBridgeAndClient()` if still null

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/serverSurface.test.ts`
Expected: PASS. The 9 meta-tool names appear in `TOOL_NAMES`; usage guide contains `hook.clip` and `call_tool_chain`.

- [ ] **Step 5: Full test sweep**

Run: `npm test`
Expected: all suites pass (scaffold, config, hookCli, regenHookSpec, manualBuilder, changelog, bridge, serverSurface).

- [ ] **Step 6: Commit**

```bash
git add src/index.ts tests/serverSurface.test.ts
git commit -m "feat: replace concrete hookmark tools with 9-tool code-mode surface"
```

---

## Task 9: README Migration Note

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update `README.md`**

Add a top-of-file section before existing content:

```md
## v0.2.0 — Code-Mode MCP (Breaking Change)

`hookmark-mcp` has been rewritten as a code-mode MCP. The seven concrete
tools (`hookmark_link`, `hookmark_connect`, `hookmark_list`,
`hookmark_search`, `hookmark_remove`, `hookmark_clone`,
`hookmark_frontmost`) are **removed**.

Callers now invoke hook subcommands through `call_tool_chain`:

```ts
// Before (v0.1.x):
hookmark_link({ item: "/Users/me/note.md" })

// After (v0.2.0):
call_tool_chain({
  code: `return await hook.clip({ item: "/Users/me/note.md" });`
})
```

### Startup behavior

On every server start, `scripts/regen_hook_spec.ts` runs `hook help` against
your installed Hookmark CLI and writes `docs/reference/hook-cli-spec.json`.
If the spec changed since last run, the bridge renders a changelog page and
auto-opens `http://127.0.0.1:<port>/changelog` in your default browser.

Opt out with `HOOK_SKIP_REGEN=1` or `HOOK_CHANGELOG_AUTO_OPEN=0`.

### Manual spec refresh

```bash
npm run regen-spec
```
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document v0.2.0 code-mode breaking change"
```

---

## Execution Notes

- `@utcp/code-mode` APIs (`CodeModeUtcpClient.create`, `client.callToolChain`, `client.toolToTypeScriptInterface`, etc.) are used exactly as in `/Users/hack/github/brandjet/src/index.ts`. If types drift in newer versions, pin to `^1.2.11`.
- `tests/regenHookSpec.test.ts` never shells out to `hook`; the parser tests feed a fixture string. This keeps the suite hermetic on CI machines without Hookmark installed.
- The static fallback `docs/reference/hook-cli-spec.json` exists so a fresh clone without Hookmark can still `npm test` and `npm run build`. The real content lands on first successful startup regen.
- `HOOK_SKIP_REGEN=1` is the escape hatch for CI, tests, and machines where `hook` is broken (the current dev box, per the broken Ruby gem path seen during design).
- Auto-opening the browser on every restart when nothing changed would be annoying — the guard is `changed && diff.hasChanges`. Manual `changelog` tool invocations always open (that's the explicit user intent).
- Preserve `src/` file size targets: if `src/index.ts` exceeds ~200 lines after pasting the Brandjet meta-tool registrations, extract the tool registration block into `src/metaTools.ts`.

---

## Self-Review Summary

- **Spec coverage:** architecture (Task 7, 8), 9 meta-tools (Task 8), `hookCli.ts` (Task 3), `manualBuilder.ts` (Task 5), `bridge.ts` (Task 7), `scripts/regen_hook_spec.ts` (Task 4), `changelog.ts` (Task 6), `src/index.ts` with startup regen + auto-open (Task 8), config env vars (Task 2), breaking-change README (Task 9), TDD structure throughout, test files listed in spec all created.
- **Placeholder scan:** one deliberate "paste from Brandjet" marker in Task 8 — the reference file path and line ranges are explicit (`/Users/hack/github/brandjet/src/index.ts:119-151` and `234-718`) so it's actionable, not vague. All other steps contain complete code.
- **Type consistency:** `HookCliSpec`, `HookSubcommand`, `HookOption` defined in Task 4's `src/specTypes.ts` and used consistently in Tasks 5, 6, 7, 8. `BridgeServer`, `BridgeOptions`, `SpecDiff`, `OpenOptions`, `RegenResult` all defined before consumed.

---

Plan complete and saved to `docs/superpowers/plans/2026-04-20-hookmark-code-mode.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
