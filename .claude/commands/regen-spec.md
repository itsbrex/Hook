---
description: Refresh hook CLI spec and show the diff
allowed-tools: Bash
---

Regenerate `docs/reference/hook-cli-spec.json` from the installed Hookmark CLI and show what changed.

1. `git diff --stat docs/reference/hook-cli-spec.json` — baseline
2. `bun run regen-spec`
3. `git diff docs/reference/hook-cli-spec.json` — show the delta

If the spec changed, summarize: new subcommands added, removed, or modified signatures. If unchanged, report "spec up to date".
