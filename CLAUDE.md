# hookmark-mcp — Claude Code instructions

Code-Mode MCP server that exposes the Hookmark `hook` CLI as a UTCP manual. Clients invoke hook subcommands via `call_tool_chain` executing TypeScript snippets that call `hook.<subcommand>({ body: {...} })`.

## Architecture

- **Entry:** `src/index.ts` — MCP server bootstrap
- **Bridge:** `src/bridge.ts` — UTCP code-mode runtime, wraps `hookCli`
- **CLI wrapper:** `src/hookCli.ts` — spawns `hook` binary, parses output
- **Spec generation:** `src/regenSpec.ts` + `scripts/regen_hook_spec.ts` — runs `hook help` on startup, writes `docs/reference/hook-cli-spec.json`
- **Manual builder:** `src/manualBuilder.ts` — converts spec to UTCP manual
- **Changelog:** `src/changelog.ts` — renders spec diffs, serves at `http://127.0.0.1:<port>/changelog`

Tests live in `tests/*.test.ts` (vitest).

## Commands

- `bun run dev` — run server with tsx
- `bun run build` — full compile + copy assets to `dist/`
- `npx vitest run` (or `npm test`) — run test suite. **Do not use `bun test`** — bun's embedded V8 lacks `ValueSerializer::Delegate::IsHostObject`, which `isolated-vm` needs. The `bun test` runner throws `dlopen ERR_DLOPEN_FAILED` even after `npm rebuild isolated-vm --build-from-source`. Use Node (via vitest) which has the symbol.
- `bun run regen-spec` — manually refresh `hook-cli-spec.json`
- `npx tsc --noEmit` — type-check only (no emit)

## Conventions

- **Runtime:** Node ≥ 22.12, Bun for dev/test
- **Module system:** `"type": "module"` with `tsconfig.json` `moduleResolution: "bundler"`. Runtime source compiled by `tsc` must use `.js` on relative imports so emitted Node ESM resolves (for example, `from "./toolNames.js"`). Existing Vitest-only test imports may remain extensionless because Vitest resolves `.ts` directly.
- **Strict TypeScript:** no `any` without justification
- **Test framework:** vitest — follow existing file naming (`*.test.ts` adjacent to source)
- **Error handling:** AppleEvents errors (-1743) are macOS Automation permission issues — annotate with permission hint, do not retry

## JXA (JavaScript for Automation) patterns for Hookmark

The MCP's AppleScript-backed subcommands use JXA (`osascript -l JavaScript`) rather than raw AppleScript `-ss` output. Key facts verified against live Hookmark:

- **Property access requires invocation:** `b.name()` not `b.name` (unlike AppleScript).
- **No `bookmarkFrom(path)` method exists.** To find a bookmark by path, use the `whose` filter: `hook.bookmarks.whose({path: targetPath})()` — returns an array, empty if no match.
- **Hookmark has NO "bookmark from <path>" command** in its `.sdef`. Only `bookmark from active window` (different — returns current-window bookmark or async request handle).
- **Working getters:** `.name()`, `.path()`, `.address()`, `.tags()`, `.hookedBookmarks()` (returns array; `.length` for count).
- **Templates return JSON:** every JXA template ends with `JSON.stringify(...)` so the dispatcher can `JSON.parse(stdout)` without a hand-rolled parser.
- **Argv:** scripts that take args use `function run(argv) { ... }`. osascript calls `run()` automatically when defined.

## Safety rules (important)

**Never run mutating `hook` subcommands against real user data.** When testing or exploring the MCP, use fixture paths under `tests/fixtures/` only. The subcommands `hook.link`, `hook.connect`, `hook.remove`, `hook.clone` operate on the user's **live Hookmark graph** — an errant call during debugging can silently corrupt their knowledge base. Read-only subcommands (`hook.clip`, `hook.frontmost`, `hook.search`, `hook.list`) are safe to exercise freely. If a task genuinely requires mutating real notes, confirm with the user first.

## Environment flags

- `HOOK_SKIP_REGEN=1` — skip spec regeneration on startup
- `HOOK_CHANGELOG_AUTO_OPEN=0` — suppress auto-opening changelog in browser
- `HOOK_BRIDGE_PORT` — bridge port; code default `0` (ephemeral)

**mise loads the main checkout's `.env` into every process under this repo** (worktrees included), and it overrides inline env and MCP client config `env` blocks. Never pin `HOOK_BRIDGE_PORT` there: each client spawns its own server, so a fixed port makes the second one fail with `EADDRINUSE`. Run `mise env | grep HOOK` to see the effective values.

## Git workflow

- Branch from `main`; `feat/code-mode-mcp` is merged and gone, so there is no long-lived feature branch
- Commit style: conventional commits (`feat:`, `fix:`, `docs:`, `chore:`)
- Do not commit: `dist/`, `node_modules/`, `.env*`, `Notes/`, `tasks/`

## When you learn something

If you correct Claude on a pattern specific to this repo, append the rule to this file so the next session doesn't repeat the mistake.
