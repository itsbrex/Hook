# Upstream Issues to File with Hookmark

These are Hookmark CLI bugs surfaced during `hookmark-mcp` v0.3.1 development and testing. The MCP works around #1 internally; #2 is an open limitation.

> Note: an ideal fix for #2 in this MCP would let us annotate the `remove` subcommand description in `docs/reference/hook-cli-spec.json` with a warning. That spec is regenerated from `hook help remove` on every startup, however, so any inline edit there is clobbered. A regen-safe override (e.g. a post-regen patch step in `src/regenSpec.ts`, or a runtime description overlay in `src/manualBuilder.ts`) is needed before the warning can live in the spec itself. Until then the warning lives in the README under "Known Limitations".

---

## Issue 1: `hook percent encode|decode STRING` silently emits nothing

**CLI version:** 2.1.3

**Reproduction:**

```bash
$ hook percent encode "hello world"
$ echo $?
0
# (no stdout output)

$ echo "hello world" | hook percent encode -
hello%20world
```

**Expected:** the positional-arg form should print the encoded string to stdout, identical to the stdin-pipe form.

**Actual:** exits 0 with empty stdout. The command appears to do nothing despite a successful exit status.

**Impact:** automation pipelines that invoke `hook percent encode "$VAR"` silently get empty output. No error, no hint. Affects both `encode` and `decode`.

**Workaround:** always use the stdin-pipe form (`echo ... | hook percent encode -`).

---

## Issue 2: `hook remove` requires interactive TTY confirmation

**CLI version:** 2.1.3

**Reproduction:**

```bash
$ hook remove /path/to/a /path/to/b
Remove hook between /path/to/a and /path/to/b? (y/N):
# (hangs waiting for stdin input)

$ echo "y" | hook remove /path/to/a /path/to/b
# either hangs or errors — confirmation prompt is not piped-stdin-friendly
```

**Expected:** support a `--yes` / `-y` flag (or similar) for non-interactive use, consistent with `rm -f`, `apt remove -y`, etc.

**Actual:** prompts for y/N on stdin unconditionally. In non-TTY contexts (CI, MCP servers, editor extensions) this blocks indefinitely.

**Impact:** the `remove` subcommand is unusable from any automation context. MCP wrappers like `hookmark-mcp` can't expose it safely.

**Workaround:** use AppleScript/JXA `unhook` command against the bookmark objects directly (same semantics, no TTY).

---

Filed by: [reporter]
Relates to: hookmark-mcp v0.3.1
