# Hookmark MCP — Agent Instructions

You have access to the **hookmark** MCP server. Use it for ALL Hook operations (link, clip, find, get-linked, unlink, etc.). Do not invoke Hookmark any other way.

## Workflow

1. **Discover** — `hookmark.search_tools` with a description of the task to find the right subcommand.
2. **Inspect** — `hookmark.tools_info` on that subcommand to get its TypeScript interface before writing code.
3. **Execute** — `hookmark.call_tool_chain` with a TypeScript snippet that calls `hook.<subcommand>({ body: {...} })`. Batch everything related into ONE chain — never one MCP call per operation.

## Sandbox model (important)

`call_tool_chain` runs your TypeScript inside an **isolated-vm sandbox**. What's exposed:

- `hook.*` — all registered Hookmark subcommands
- `console.*` — bridged to logs
- `__interfaces`, `__getToolInterface(name)`, `__availableTools` — introspection

What's NOT exposed: `fs`, `child_process`, `fetch`, `process`, `require`, network, env vars. The sandbox cannot touch the filesystem directly.

**This is fine** because Hookmark subcommands take paths as strings and operate on the filesystem *outside* the sandbox. You can link/clip/find files anywhere on the system — you just can't *discover* paths from inside the sandbox.

## Division of labor

| Task | Where to do it |
|---|---|
| List directories, check file existence, enumerate paths | Host tools (Bash/Glob/fd) — your normal tools |
| Link/clip/find/unlink files | Inside `call_tool_chain` via `hook.*` |
| Loop over many items | `Promise.all` inside the sandbox |
| Filter invalid paths | Do it in host tools BEFORE the chain call |

## Batch pattern

```ts
const anchor = '/Users/hack/github/ralph-wiggum-cre-marketer';
const targets = [
  '/Users/hack/github/llamalease',
  '/Users/hack/github/tenant-rep-os',
  // ...as many as needed, pre-filtered for existence
];

return Promise.all(
  targets.map(t =>
    hook.link({ body: { item_a: anchor, item_b: t } })
      .then(() => ({ ok: true, path: t }))
      .catch(e => ({ ok: false, path: t, err: String(e) }))
  )
);
```

Per-item `.catch` prevents one bad pair from failing the whole batch.

## Chained operations (clip → link)

```ts
return hook.clip({ body: { item: '/a.md' } }).then(a =>
  hook.clip({ body: { item: '/b.md' } }).then(b =>
    hook.link({ body: { item_a: a.output, item_b: b.output } })
  )
);
```

## Hard rules — DO NOT

- ❌ Shell out to `ruby /Library/Ruby/Gems/.../hookapp-*/bin/hook` or any `hook` CLI binary
- ❌ Write `.sh` scripts to `/tmp` and execute them
- ❌ Use `osascript`, `Filesystem:write_file`, or `Desktop Commander` to run Hookmark indirectly
- ❌ Make one MCP call per link/clip — always batch with `Promise.all` in a single `call_tool_chain`
- ❌ Try to `require('fs')` or access `process` inside the sandbox — it will fail
- ❌ Fall back to shell scripts if an MCP tool errors — report the error verbatim and stop

## Always DO

- ✅ Use host tools (Glob/Bash/fd) to enumerate and pre-validate paths
- ✅ Embed the resulting path list as a TypeScript array literal in the chain code
- ✅ Batch all related operations into a single `call_tool_chain` execution
- ✅ Wrap each item's call in `.catch` so one failure doesn't abort the batch
- ✅ Return a summary (counts + failed items) from the chain — don't return full raw payloads
- ✅ Before bulk operations (>10 items), show the user the planned pair list and wait for confirmation

## Error handling

If an MCP tool errors:
1. Report the exact error message.
2. Stop. Do not retry with a different mechanism (shell, AppleScript, filesystem tools).
3. Ask the user how to proceed.

If the sandbox times out: split the batch in half and run two sequential `call_tool_chain` executions. Default timeout is 30s, max memory 128MB — both can be raised via `timeout` and `memory_limit` args.
