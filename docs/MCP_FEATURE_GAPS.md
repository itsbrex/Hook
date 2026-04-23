# Hookmark Features Not Yet Exposed by the MCP Server

Analysis of `docs/reference/hook-cli-spec.json`, the Ruby CLI source (`ttscoff/hookapp/bin/hook`), and the Hookmark AppleScript dictionary (`Hookmark.app/Contents/Resources/hook.sdef`).

## Currently in the MCP (12 subcommands, all CLI-derived)

`browse`, `clip`, `clone`, `find`, `from`, `link`, `list`, `open`, `remove`, `select`, `percent_encode`, `percent_decode` — with their CLI flags (`--markdown`, `--app`, `--files_only`, `--names_only`, `--output_format`, `--select`, `--null`, `--all`, `--paste`, `--copy`).

## Hookmark features NOT exposed — but could be

### From the AppleScript dictionary (`hook.sdef`) — biggest gap

The Ruby CLI doesn't expose these, but the Hookmark app does via AppleScript. Adding an `osascript` bridge alongside the CLI bridge would unlock:

1. **Tags (read + write)** — `bookmark.tags` is `rw`. No CLI equivalent. Huge for organization.
2. **`bookmarks with tags <list>`** — query bookmarks by tag set (any/all). No CLI equivalent.
3. **All bookmarks enumeration** — `application > allBookmarks` returns the entire library; CLI has no "list all" (only `list <file>` or `find <term>`).
4. **Rename a bookmark** — `bookmark.name` is `rw`. CLI cannot rename.
5. **`make bookmark with properties {...}`** — create a bookmark programmatically with name/address/tags in one call.
6. **`exists` / `count`** — quick existence/count checks for a bookmark or set.
7. **`bookmark from active window`** — returns a bookmark *or an async request handle* for x-callback apps. The CLI's `from APP_NAME` is sync-only and brings the app to the foreground; AppleScript can do it without window activation.
8. **`bookmark by request handle`** — resolve the async handle from #7 (needed for apps like Mail/DEVONthink).
9. **Structured property access** — `name`, `address`, `path`, `hooked bookmarks`, `tags` as discrete fields rather than parsing `--output_format=verbose` text.
10. **`hook` / `unhook` direct commands** — operate on bookmark objects rather than path strings (works on emails/notes/anything bookmarkable, not just files).
11. **`invoke on bookmark`** — programmatic "open this in Hookmark GUI" beyond what CLI `open` does.

### From the URL scheme (not in CLI either)

Hookmark exposes `hook://` x-callback URLs (e.g. `hook://x-callback-url/get-link`, `/create`, `/search`, `/find-by-name`). The MCP could wrap these — useful for apps that already speak x-callback-url, and for headless calls that don't shell out.

### Quality-of-life additions on top of existing commands

- **JSON output mode** — current formats are `paths|hooks|markdown|verbose`. A parser that returns `{name, address, path, hooked: [...]}` would eliminate text-scraping in the sandbox.
- **`list --all-bookmarks`** convenience — wrap the AppleScript enumeration.
- **`tag add/remove/set <bookmark> <tags...>`** — convenience over the raw property write.
- **Pinning** — Hookmark UI surfaces pinned items; if it's just a reserved tag, exposing it as a first-class concept would help.
- **Watch / change notifications** — Hookmark has no event stream, but a polling helper that diffs `allBookmarks` between calls could simulate one.

### Worth noting (probably NOT worth adding)

- `scripts` (shell completion examples), `help`, `--version` — meta commands, no value via MCP.
- `browse` / `select` / `open` — these open GUI windows. They work via MCP today but are awkward for headless agents; consider marking them GUI-only in `tools_info`.

## Recommended priority if you wanted to extend

1. **AppleScript bridge for tags + `allBookmarks` + `make`** — unlocks the biggest absent capability surface in one extension.
2. **Structured/JSON output** for `list` and `find` — removes the most common sandbox-side parsing pain.
3. **`bookmark from active window` (async handle flow)** — required for full coverage of Mail/DEVONthink/OmniFocus style apps.
4. URL-scheme wrappers for anything you'd want to trigger without shelling Ruby (lower priority — CLI already covers most of this).
