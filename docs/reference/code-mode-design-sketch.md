# Hookmark Code-Mode MCP — Design Sketch

> Conversational design notes captured during brainstorming on 2026-04-20.
> The formal spec lives at `docs/superpowers/specs/2026-04-20-hookmark-code-mode-design.md`.
> This file is a plain-English reference kept out of the way.

## Architecture (mirrors Brandjet/Attio shape)

```
┌──────────────────────┐
│ MCP client (Claude)  │
└──────────┬───────────┘
     stdio │
┌──────────▼───────────┐
│ src/index.ts         │  stdio MCP server, 9 code-mode meta-tools
│ CodeModeUtcpClient   │  (@utcp/code-mode)
└──────────┬───────────┘
     HTTP  │  localhost:3801
┌──────────▼───────────┐
│ src/bridge.ts        │  Local HTTP bridge
│  ├── GET /openapi    │  serves generated Hook OpenAPI
│  ├── POST /clip      │  → runHook(["clip", ...])
│  ├── POST /link      │  → runHook(["link", ...])
│  └── POST /…         │  one route per hook subcommand
└──────────┬───────────┘
     exec  │
┌──────────▼───────────┐
│ hook CLI (local)     │  Hookmark's Ruby gem
└──────────────────────┘
```

## Components (each in its own file, isolated)

1. **`src/hookCli.ts`** — pure wrapper around `hook` CLI. Owns `HOOK_CLI` path resolution, `shellEscape`, `runHook`, output parsing (extracts `hook://` URLs, splits list output). Hook equivalent of Brandjet's `brandjetMcpClient.ts` / Attio's `attioMcpClient.ts`.

2. **`src/manualBuilder.ts`** — generates the OpenAPI spec. Reads `docs/reference/hook-cli-spec.json` (checked-in, produced by `scripts/regen_hook_spec.ts`), adds the bridge base URL, returns the spec object. Mirrors Brandjet's `manualBuilder.ts` exactly.

3. **`src/bridge.ts`** — Node `http.createServer`. Serves `GET /openapi` (the generated spec) and `POST /<operationId>` routes that parse the JSON body and delegate to `hookCli.ts`. Same shape as Brandjet's bridge but calls local CLI instead of forwarding to remote MCP.

4. **`scripts/regen_hook_spec.ts`** — one-shot dev script. Shells out to `hook help` and `hook help <subcmd>` for all 7 commands, parses flags/args, emits `docs/reference/hook-cli-spec.json`. Run by `npm run regen-spec` whenever Hookmark CLI updates.

5. **`src/changelog.ts`** — diffs old vs new `hook-cli-spec.json`, renders HTML at `/changelog` on the bridge. Surfaces CLI-upgrade drift (e.g. new `--flag` appearing in `hook list`). Direct port from Brandjet.

6. **`src/index.ts`** — slim orchestrator. Loads dotenv, constructs `CodeModeUtcpClient`, starts bridge, registers the 9 meta-tools, connects to stdio. Mirrors Brandjet's `index.ts` structure.

## What's different from Attio's plan (deliberately cut)

- **No OAuth / token provider / refresh flow** — hook is a local CLI, no auth
- **No session-id / SSE parsing / `notifications/initialized`** — no remote MCP
- **No live `tools/list` sync** — command set is fixed; spec comes from `regen_hook_spec.ts`
- **Task 0 (OAuth probe) and Task 4–5 (OAuth + token refresh) from Attio plan are dropped entirely**
- **No `HOOK_MCP_URL` config** — `HOOK_CLI` path is the only runtime env var

## What stays identical to Attio/Brandjet

- 9 meta-tools, same names, same order: `register_manual`, `deregister_manual`, `search_tools`, `list_tools`, `changelog`, `tools_info`, `get_all_tool_interfaces`, `get_required_keys_for_tool`, `call_tool_chain`
- UTCP code-mode client, HTTP bridge, OpenAPI manual registered as `hook`
- Checked-in spec fixture + changelog drift detection
- TDD task structure (test → implement → commit)
- Usage guide in server instructions teaching `hook.clip({item})`, `hook.link({item_a, item_b})` style calls chained in `call_tool_chain`

## Breaking change to existing users

The package's 7 concrete tools (`hookmark_link`, etc.) are removed. `hookmark-mcp` v0.1.0 consumers who wired tool names directly break. Version bumps to **0.2.0**, breaking change, old tool names gone.

## Design decisions recorded

- **Goal:** full code-mode parity — chain commands, OpenAPI self-describing, consistency with Brandjet/Attio, full types/shapes from hook CLI help similar to how Attio/Brandjet code-mode tool chains consume.
- **Spec generation:** Option C — build-time script (`scripts/regen_hook_spec.ts`) writes `docs/reference/hook-cli-spec.json`, server loads the checked-in file at runtime. Deterministic runtime, one command to refresh, committed file gives a diff when `hook` updates.
- **Tool surface:** Option A — pure code-mode. Drop the 7 concrete tools, expose only the 9 meta-tools. Matches Attio/Brandjet exactly.
