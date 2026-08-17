## Known Limitations (v0.3.1)

Surfaced during live testing in Claude Desktop. Documented here so the next caller doesn't re-discover them.

### Hookmark JXA / indexing quirks

- **Fresh bookmarks may not appear in `whose({path})` immediately.** `make_bookmark` creates the bookmark but Hookmark's index takes a tick to include it. Immediate lookups via `hook.bookmarks.whose({path: ...})()` may miss freshly-made bookmarks. Workaround: use the `address` (`hook://...`) returned from `make_bookmark` for immediate follow-up operations, or add a short retry loop on the caller side.
- **`whose({path: X})` only matches bookmarks that HAVE a filesystem path.** Bookmarks created from web URLs (`https://...`) have `path: null`, so path-based lookups (`get_tags`, `set_tags`, `rename_bookmark`, `hook_bookmarks`, `unhook_bookmarks`) will throw `No bookmark found for path`. To operate on web URL bookmarks, iterate `hook.bookmarks()` and filter by `.address()`, or use `hook://` address lookups directly.
- **No programmatic bookmark delete.** Hookmark exposes no `delete bookmark` verb, so bookmarks created via `make_bookmark` cannot be removed through the MCP. Delete them from the Hookmark UI.

### Hookmark CLI quirks worked around in this MCP

- **`hook percent encode|decode STRING` (positional form) silently emits nothing.** v0.3.1 transparently routes these through the stdin-pipe form (`hook percent encode -`) which works. Clients see the encoded/decoded string as expected.

### Hookmark CLI limitations not yet worked around

- **`hook remove FILE_A FILE_B` is interactive.** It prompts `y/N` on stdin and hangs in non-TTY contexts. Calling the `/remove` MCP route will time out or error. Workaround: use `/unhook_bookmarks` (JXA-backed — same semantics, no TTY dependency). See `docs/upstream-issues.md`. Note: the spec description for `remove` is regenerated from `hook help remove` on each startup, so an inline annotation in `docs/reference/hook-cli-spec.json` would be clobbered — a regen-safe override (e.g. a post-regen patch step in `src/regenSpec.ts`) is needed before the warning can live in the spec itself.
- **Long-running enumerations can exceed the default executor timeout.** `hook.all_bookmarks` and unbounded `hook.find` / `hook.list` against large Hookmark libraries (~2000+ bookmarks) may time out. Pass `timeoutMs: 120000` (or larger) in the request body for a per-call override, or set `HOOK_TIMEOUT_MS` to change the server default.
- **`hook.all_bookmarks` / `hook.bookmarks_with_tags` return a `{records, total, errors}` shape.** Individual bookmarks that error during iteration appear as `{error, index, address?}` rows rather than crashing the batch. Inspect `errors > 0` to decide whether to log or retry. This is a breaking change from v0.3.0's bare-array return — callers that previously did `JSON.parse(out) as Array<VerboseBookmark>` must now read `.records`.
- **Two timeouts govern long operations:**
  1. The outer `call_tool_chain` `timeout` param (canonical default 30000ms) limits the full TypeScript-sandbox budget; set it higher for long Hook operations.
  2. The inner tool `timeoutMs` body param (server default 60000ms = 1 min, configurable with `HOOK_TIMEOUT_MS`) limits the individual tool executor (osascript or hook CLI).
  For operations like `hook.all_bookmarks` on large libraries, you must set BOTH high enough. Example:
  ```ts
  call_tool_chain({
    code: `await hook.all_bookmarks({ body: { timeoutMs: 180000 } });`,
    timeout: 200000,  // must exceed timeoutMs with headroom
  });
  ```

---

## v0.3.0 — AppleScript Bridge + JSON Output

v0.3.0 adds a JXA (JavaScript for Automation) bridge alongside the existing `hook` CLI bridge, exposing 15 new subcommands that the Ruby CLI can't reach, plus structured JSON output for the two most-used read commands.

### New JXA-backed subcommands (15)

All of these call Hookmark.app directly via `osascript -l JavaScript` and return parsed JSON — no text scraping.

**Bookmark enumeration**

- `all_bookmarks` — return every bookmark in the Hookmark library as `VerboseBookmark[]`.
- `bookmark` — look up a single bookmark by path or address.
- `count_bookmarks` — return the total bookmark count.
- `exists_bookmark` — boolean check for whether a given path/address is bookmarked.

**Tags**

- `get_tags` — return the tag list for a bookmark.
- `set_tags` — replace the tag list on a bookmark.
- `add_tags` — add tags to a bookmark without removing existing ones.
- `remove_tags` — remove specific tags from a bookmark.
- `bookmarks_with_tags` — return all bookmarks matching a given tag set.

**Mutations**

- `rename_bookmark` — change a bookmark's `name` property.
- `make_bookmark` — create a bookmark from an address, optionally with name/tags.
- `hook_bookmarks` — create a bidirectional link between two bookmark objects.
- `unhook_bookmarks` — remove a bidirectional link between two bookmark objects.

**Window / async handle**

- `from_active_window` — get a bookmark (or async request handle) from the frontmost window of a named app, without bringing it to the foreground.
- `by_request_handle` — resolve an async request handle returned by `from_active_window` (needed for Mail, DEVONthink, OmniFocus, etc.).

### JSON output for `list` and `find`

Both `list` and `find` now accept `{ json: true }` in their body. Instead of raw text, they return `VerboseBookmark[]` with shape:

```ts
{ name: string; address: string; path: string; hooked: string[] }
```

```ts
// Before — parse the text yourself:
call_tool_chain({ code: `return hook.list({ body: { item: "/path/to/file.md", format: "verbose" } });` })

// After — structured objects:
call_tool_chain({ code: `return hook.list({ body: { item: "/path/to/file.md", json: true } });` })
```

### macOS Automation permission (new requirement)

The JXA subcommands need macOS Automation permission for the process running this server (typically Claude Code or Node) to drive Hookmark. The first call triggers the system permission dialog.

If permission is denied, stderr shows:

```
[hook] AppleScript disabled: permission — grant Automation permission: System Settings → Privacy & Security → Automation → <terminal app> → Hookmark
```

…and the subcommand list auto-shrinks to the 12 CLI-only ones until the permission is granted **and the server is restarted**.

### New env var: `HOOK_SKIP_APPLESCRIPT=1`

Opt out of JXA subcommands entirely. Use this if you won't be granting Automation permission, if you're on a non-macOS host, or if you want to pin the exposed surface to the CLI-only subset for reproducibility.

### Probe & graceful degrade

On startup the server probes Hookmark with `tell application "Hookmark" to count bookmarks`. If the probe fails with `-1743` (Automation permission denied) or `-600` (Hookmark not running), the 15 JXA subcommands are silently omitted from the manual for the remainder of the session and stderr logs a one-line hint. Existing CLI subcommands continue to work.

---

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

---
links: "[[Ideaverse/AI/Hook/Hook|Hook]]"
---

# hookmark-mcp

MCP server that gives Claude Code (and other MCP clients) full access to [Hookmark](https://hookproductivity.com) — the macOS app that creates bidirectional links between files, URLs, emails, notes, and anything else with an address.

Link a PDF to an email. Connect a note to a webpage. Find everything related to a project. All through natural language.

## How It Works

```
Claude Code  ──MCP──▶  hookmark-mcp  ──shell──▶  hook CLI  ──▶  Hookmark.app
                        (this server)              (v2.1.3)       (macOS)
```

The server wraps Hookmark's `hook` CLI as seven MCP tools. Claude calls them like any other tool — you just talk normally:

- *"Link my TODO to that PDF on the desktop"*
- *"What's connected to this file?"*
- *"Search hookmark for everything about invoices"*
- *"Hook whatever's open in Mail to this project"*

You never need to remember tool names or parameters.

## Quick Start

**Prerequisites:**
- macOS with [Hookmark](https://hookproductivity.com) installed
- Hookmark's `hook` CLI (`gem install hookmark` or installed with Hookmark)
- Node.js 22+ or Bun

**Install with Claude Code:**

Tell Claude:

> *"Install the hookmark MCP server from github.com/mnott/Hook"*

Claude will clone the repo, build it, and add it to your MCP config.

**Manual install:**

Add to your Claude Code MCP config (`~/.claude.json`):

```json
{
  "mcpServers": {
    "hookmark": {
      "command": "npx",
      "args": ["-y", "hookmark-mcp"]
    }
  }
}
```

Or with Bun:

```json
{
  "mcpServers": {
    "hookmark": {
      "command": "bunx",
      "args": ["hookmark-mcp"]
    }
  }
}
```

Restart Claude Code. The tools are ready.

**From source (development):**

```bash
git clone https://github.com/mnott/Hook.git
cd Hook
bun install
bun run build
```

Then point your MCP config to the local build:

```json
{
  "mcpServers": {
    "hookmark": {
      "command": "node",
      "args": ["/path/to/Hook/dist/index.js"]
    }
  }
}
```

## Tools at a Glance

| Tool | What it does | Example |
|------|-------------|---------|
| `hookmark_link` | Get a `hook://` URL for any file or URL | *"Get me a hook URL for this file"* |
| `hookmark_connect` | Link two items bidirectionally | *"Link this note to that PDF"* |
| `hookmark_list` | Show everything linked to an item | *"What's linked to this file?"* |
| `hookmark_search` | Search all bookmarks by keyword | *"Find all bookmarks about 'project X'"* |
| `hookmark_remove` | Unlink two items | *"Remove the link between these two files"* |
| `hookmark_clone` | Copy all links from one item to another | *"This file replaced that one — copy its links"* |
| `hookmark_frontmost` | Grab a hook URL from whatever's open in an app | *"Get me a hook for whatever's open in Mail"* |

## User Guide

You never need to remember tool names or parameters — just describe what you want in plain English. Here are the things you can do, organized by what you're trying to accomplish.

### Connecting Things

The core of Hookmark is bidirectional links. When you connect two items, each one knows about the other.

> *"Link my TODO.md to the project requirements PDF on the desktop"*

> *"Connect this source file to the GitHub issue at https://github.com/org/repo/issues/42"*

> *"Hook the meeting notes to the presentation slides"*

> *"Link every .ts file in src/ to the architecture document"*

You can link files to files, files to URLs, URLs to URLs — anything with an address.

### Finding Connections

Once things are linked, you can explore the web of connections from any starting point.

> *"What's hooked to this file?"*

> *"Show me everything connected to the project plan"*

> *"List all hooks for src/index.ts in verbose format"*

> *"What files are linked to https://github.com/mnott/Hook?"*

> *"Show me all my Hookmark bookmarks"*

Omit the item to list everything. Ask for different output formats — paths, markdown links, hook:// URLs, or verbose details with titles and addresses.

### Searching

Search across all your Hookmark bookmarks by keyword — it searches both names and URLs.

> *"Search hookmark for 'invoice'"*

> *"Find all bookmarks related to the quarterly report"*

> *"Search hookmark for anything mentioning 'API design'"*

> *"Search just bookmark names for 'meeting' — don't search URLs"*

> *"Search hookmark for 'budget' but only show files, no emails"*

### Working with Apps

Hookmark can reach into the frontmost window of any macOS app and grab a reference to whatever's active — the open document, email, note, task, or webpage.

> *"Get me a hook for whatever's open in Mail"*

> *"Hook the current Obsidian note to this project"*

> *"Link whatever's open in Finder to my TODO"*

> *"Grab a hook URL from Safari and connect it to the design doc"*

Supported apps include Finder, Mail, Safari, Obsidian, Bear, DEVONthink, Xcode, and any app that Hookmark supports (most document-based macOS apps).

### Moving and Reorganizing Files

When you move or rename a file, its hooks don't follow automatically. Clone them to the new location.

> *"I moved report.md to the archive — clone its hooks to the new path"*

> *"Copy all links from the old config to the new config file"*

> *"This file replaced the other one — transfer its hooks"*

The original keeps its links. The destination gets copies of all the same connections.

### Cleaning Up

Remove links you no longer need.

> *"Unlink the budget spreadsheet from the old project plan"*

> *"Remove the hook between these two files"*

> *"Disconnect the meeting notes from the wrong project"*

### Real-World Workflows

**Research and reference management**

> *"Link this paper PDF to the notes I'm writing about it"*
> *"What sources are connected to my literature review?"*
> *"Hook this Stack Overflow answer to the bug fix commit"*

**Project organization**

> *"Connect every file in this project to the project brief"*
> *"What's linked to the project requirements? Show me the full list."*
> *"Link the Jira ticket URL to the implementation file"*

**Email and communication**

> *"Hook whatever's open in Mail to this contract PDF"*
> *"Search hookmark for that email about the deadline"*
> *"Link the client's email to the proposal document"*

**Code and documentation**

> *"Link the API spec to the implementation in src/api/routes.ts"*
> *"What documentation is connected to this module?"*
> *"Hook the test file to the source file it tests"*

**Knowledge management**

> *"Connect this Obsidian note to the original article URL"*
> *"What notes are linked to this topic?"*
> *"Link the DEVONthink document to my project TODO"*

### Combining MCP Servers

Hookmark becomes especially powerful when combined with other MCP servers. Here's a workflow that bridges email, document management, and task tracking across devices.

**Email → DEVONthink → Hookmark → Todoist**

You archive important emails in DEVONthink. DEVONthink items have stable URLs (`x-devonthink-item://...`) that work in DEVONthink To Go on iOS/iPadOS too. By creating a Hookmark link to a DEVONthink document and adding it to a Todoist task, you get a clickable reference from your task list straight to the email — on any device.

> *"Search DEVONthink for the email from the lawyer about the contract"*
> *"Get a hook URL for that DEVONthink document"*
> *"Create a Todoist task 'Review lawyer contract' with that link in the description"*

Or in one shot:

> *"Find the email from Müller about the invoice in DEVONthink, get a hookmark link, and create a Todoist task to follow up on it by Friday"*

This works because:
1. **DEVONthink MCP** finds the archived email
2. **Hookmark MCP** creates a stable `hook://` URL that resolves to the DEVONthink item
3. **Todoist MCP** creates the task with the link in the description
4. On your iPhone, tapping the link in Todoist opens DEVONthink To Go and jumps straight to the email

The same pattern works with any combination — link Obsidian notes to Todoist tasks, connect GitHub issues to DEVONthink research, hook Calendar events to project files.

## MCP Tool Reference

### hookmark_link

Get the stable `hook://` URL for a file or web URL.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `item` | yes | Absolute file path or URL |

### hookmark_connect

Create a bidirectional link between two items.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `item_a` | yes | File path, URL, or `hook://` URL |
| `item_b` | yes | File path, URL, or `hook://` URL |

### hookmark_list

List all items hooked to a given item. Omit `item` to list all bookmarks.

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `item` | no | — | File path, URL, or `hook://` URL |
| `format` | no | `paths` | `paths`, `hooks`, `markdown`, or `verbose` |
| `files_only` | no | `false` | Exclude non-file items (emails, etc.) |

### hookmark_search

Search bookmarks by keyword.

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `query` | yes | — | Search term |
| `format` | no | `markdown` | `paths`, `hooks`, `markdown`, or `verbose` |
| `names_only` | no | `false` | Search only bookmark names, not URLs |
| `files_only` | no | `false` | Exclude non-file items |

### hookmark_remove

Remove the bidirectional link between two items.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `item_a` | yes | File path, URL, or `hook://` URL |
| `item_b` | yes | File path, URL, or `hook://` URL |

### hookmark_clone

Copy all hooks from source to destination. Source is not modified.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `source` | yes | Item to copy hooks from |
| `destination` | yes | Item to copy hooks onto |

### hookmark_frontmost

Get the `hook://` URL for the active document in a macOS app.

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `app` | yes | — | App name without `.app` (e.g. `Finder`, `Mail`, `Obsidian`) |
| `markdown` | no | `false` | Return as a Markdown link |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `HOOK_CLI` | auto-detected | Path to the `hook` CLI binary |
| `HOOK_BRIDGE_PORT` | `0` | Local HTTP bridge port. `0` picks an ephemeral free port |
| `HOOK_TIMEOUT_MS` | `60000` | Default executor timeout in milliseconds. Positive per-request `timeoutMs` overrides it |
| `HOOK_SKIP_REGEN` | `0` | Skip `hook help` spec regeneration at startup when set to `1` |
| `HOOK_CHANGELOG_AUTO_OPEN` | `1` | Disable browser auto-open for the changelog UI when set to `0` |

Override the CLI path if your `hook` binary is installed elsewhere:

```json
{
  "mcpServers": {
    "hookmark": {
      "command": "npx",
      "args": ["-y", "hookmark-mcp"],
      "env": {
        "HOOK_CLI": "/usr/local/bin/hook"
      }
    }
  }
}
```

## Item References

Hookmark items can be referenced in three ways:

- **Absolute file path:** `/Users/you/Documents/report.pdf`
- **URL:** `https://example.com/page`
- **Hook URL:** `hook://file/5g29VkHoQ?p=...&n=index%2Ets`

Hook URLs are stable identifiers — they survive file renames and moves (as long as Hookmark is tracking the file).

## Troubleshooting

**"hook: command not found"**
The `hook` CLI isn't in the expected path. Install it with `gem install hookmark` or set `HOOK_CLI` to point to your binary. Find it with `which hook` or `gem which hookmark`.

**"Hookmark is not running"**
The `hook` CLI requires Hookmark.app to be running. Open it from Applications.

**Tool calls return empty results**
Hookmark only knows about items it has bookmarked. Open a file in Hookmark first (or use `hookmark_link` to create a bookmark), then hooks can be created.

**"Permission denied" errors**
Claude Code needs accessibility permissions to interact with Hookmark via AppleScript. Check System Settings > Privacy & Security > Accessibility.

### "Not authorized to send Apple events to Hookmark" (error -1743)

Every data-touching `hook` subcommand (`clip`, `link`, `list`, `find`, `remove`,
`clone`, `open`, `select`, `browse`, `from`) internally uses AppleScript to talk
to Hookmark.app. macOS requires the *process running the `hook` binary* —
usually Claude Code or Node — to be granted Automation permission for Hookmark.

**Fix:**

1. Open **System Settings → Privacy & Security → Automation**.
2. Find the entry for the app running this MCP server (typically `Claude` or
   `Node`).
3. Toggle the checkbox next to **Hookmark** on.
4. Retry the command. If the toggle isn't present yet, run one hook command
   from that app once; macOS will show the permission prompt.

If the error persists after granting permission, confirm Hookmark.app is
running and licensed, and that `hook --version` reports `2.1.3` or newer.

## Requirements

- macOS (Hookmark is macOS-only)
- [Hookmark](https://hookproductivity.com) with an active license
- `hook` CLI v2.0+ (`gem install hookmark`)
- Node.js 22+ or Bun

## License

MIT

## Author

Matthias Nott — [github.com/mnott](https://github.com/mnott)

---
*Links:* [[Ideaverse/AI/Hook/Hook|Hook]]
